import type { StepFrame } from '../lib/steps.ts';
import {
  addConsumer,
  addGroup,
  crash,
  getGroup,
  partitionFor,
  poll,
  produce,
  resetOffsets,
  restart,
  type BrokerState,
  type StartFrom,
} from './broker.ts';

export interface BrokerFocus {
  partition?: number;
  offset?: number;
  group?: string;
  consumer?: string;
  kind?: 'route' | 'append' | 'read' | 'duplicate' | 'skip' | 'commit' | 'crash' | 'assign' | 'delete';
}

export interface BrokerFrame extends StepFrame {
  state: BrokerState;
  focus?: BrokerFocus;
}

const owners = (state: BrokerState, groupId: string) =>
  getGroup(state, groupId)
    .consumers.filter((c) => c.alive)
    .map((c) => `${c.id} → ${c.partitions.length ? c.partitions.map((p) => `P${p}`).join(', ') : 'nothing (idle)'}`)
    .join(' · ');

/** Producing one message: the key picks the partition, the message is appended, retention may delete old ones. */
export function traceProduce(state: BrokerState, key: string, value: string): { frames: BrokerFrame[]; final: BrokerState } {
  const p = partitionFor(key, state.partitions.length);
  const final = produce(state, key, value);
  const offset = state.partitions[p].endOffset;
  const frames: BrokerFrame[] = [
    {
      state,
      focus: { partition: p, kind: 'route' },
      caption: `The producer hashes the key \`${key}\` and takes it modulo ${state.partitions.length} → partition **P${p}**. Every message with this key goes to P${p}, so they stay in order.`,
    },
    {
      state: final,
      focus: { partition: p, offset, kind: 'append' },
      caption: `Append it to the end of P${p}. It gets the next number in that partition: offset **${offset}**. Nothing is overwritten and nobody is notified individually — consumers just read on.`,
    },
  ];
  const deleted = final.partitions[p].startOffset - state.partitions[p].startOffset;
  if (deleted > 0) {
    frames.push({
      state: final,
      focus: { partition: p, offset: final.partitions[p].startOffset, kind: 'delete' },
      caption: `P${p} now holds more than ${state.config.retention} messages, so retention deletes the oldest (offset ${final.partitions[p].startOffset - 1}). Any group that hadn’t read it yet will never see it.`,
    });
  }
  return { frames, final };
}

/** Each live consumer in a group takes one turn: read the next message, maybe commit. */
export function traceTick(state: BrokerState, groupId: string): { frames: BrokerFrame[]; final: BrokerState } {
  const frames: BrokerFrame[] = [];
  let current = state;
  const seen = new Set(getGroup(state, groupId).deliveries.map((d) => `${d.partition}:${d.offset}`));
  for (const consumer of getGroup(state, groupId).consumers.filter((c) => c.alive)) {
    const result = poll(current, groupId, consumer.id);
    current = result.state;
    if (result.skipped > 0) {
      frames.push({
        state: current,
        focus: { group: groupId, consumer: consumer.id, kind: 'skip' },
        caption: `${groupId}/${consumer.id}: the next offset it wanted was already deleted by retention. It jumps forward — **${result.skipped}** message${result.skipped === 1 ? '' : 's'} lost for this group.`,
      });
    }
    const d = result.delivery;
    if (!d) {
      if (!result.skipped) frames.push({ state: current, focus: { group: groupId, consumer: consumer.id }, caption: `${groupId}/${consumer.id}: caught up — nothing new on ${consumer.partitions.length ? consumer.partitions.map((p) => `P${p}`).join(', ') : 'its (zero) partitions'}.`, quick: true });
      continue;
    }
    const id = `${d.partition}:${d.offset}`;
    const duplicate = seen.has(id);
    seen.add(id);
    frames.push({
      state: current,
      focus: { group: groupId, consumer: consumer.id, partition: d.partition, offset: d.offset, kind: duplicate ? 'duplicate' : 'read' },
      caption: duplicate
        ? `${groupId}/${consumer.id} reads P${d.partition} offset ${d.offset} (\`${d.key}\`) — **a second time**. This group processed it before, but that progress was never committed.`
        : `${groupId}/${consumer.id} reads P${d.partition} offset ${d.offset} (\`${d.key}\`) and processes it. Reading doesn’t remove anything from the log.`,
    });
    if (result.committed) {
      const committed = getGroup(current, groupId).committed;
      frames.push({
        state: current,
        focus: { group: groupId, consumer: consumer.id, kind: 'commit' },
        caption: `${consumer.id} has processed ${state.config.commitEvery} messages since its last commit, so it **commits** its offsets (${consumer.partitions.map((p) => `P${p} → ${committed[p]}`).join(', ')}). Only committed progress survives a crash.`,
      });
    }
  }
  if (frames.length === 0) frames.push({ state, caption: `${groupId} has no live consumers.` });
  return { frames, final: current };
}

/** A crash loses uncommitted progress; the rebalance hands its partitions to the survivors. */
export function traceCrash(state: BrokerState, groupId: string, consumerId: string): { frames: BrokerFrame[]; final: BrokerState } {
  const group = getGroup(state, groupId);
  const victim = group.consumers.find((c) => c.id === consumerId);
  const final = crash(state, groupId, consumerId);
  if (!victim?.alive) return { frames: [{ state, caption: `${consumerId} is already down.` }], final: state };
  const lost = victim.partitions.map((p) => ({ p, at: victim.positions[p], committed: group.committed[p] })).filter((x) => x.at > x.committed);
  const down = { ...state, groups: state.groups.map((g) => (g.id === groupId ? { ...g, consumers: g.consumers.map((c) => (c.id === consumerId ? { ...c, alive: false } : c)) } : g)) };
  const frames: BrokerFrame[] = [
    {
      state: down,
      focus: { group: groupId, consumer: consumerId, kind: 'crash' },
      caption: lost.length
        ? `**${consumerId} crashes.** Its reading positions lived only in its memory. It had read up to ${lost.map((x) => `P${x.p} offset ${x.at - 1}`).join(', ')}, but the last commit says ${lost.map((x) => `P${x.p} → ${x.committed}`).join(', ')}.`
        : `**${consumerId} crashes.** Luckily it had committed everything it processed, so no progress is lost.`,
    },
    {
      state: final,
      focus: { group: groupId, kind: 'assign' },
      caption: `The group notices and **rebalances**: the survivors commit their own progress, then partitions are shared out again — ${owners(final, groupId) || 'no one is left to read'}.`,
    },
  ];
  const redo = lost.reduce((sum, x) => sum + (x.at - x.committed), 0);
  if (redo > 0) {
    frames.push({
      state: final,
      focus: { group: groupId, kind: 'duplicate' },
      caption: `The new owner starts from the **committed** offset, not where ${consumerId} really was. So ${redo} message${redo === 1 ? '' : 's'} will be processed again — at-least-once delivery. The consumer must be able to handle duplicates.`,
    });
  }
  return { frames, final };
}

export function traceRestart(state: BrokerState, groupId: string, consumerId: string): { frames: BrokerFrame[]; final: BrokerState } {
  const final = restart(state, groupId, consumerId);
  return {
    frames: [
      { state, focus: { group: groupId, consumer: consumerId }, caption: `${consumerId} comes back and asks to join ${groupId}. The current members commit their progress first.` },
      { state: final, focus: { group: groupId, kind: 'assign' }, caption: `Rebalance: ${owners(final, groupId)}. Each consumer starts from the committed offsets of the partitions it now owns.` },
    ],
    final,
  };
}

export function traceAddConsumer(state: BrokerState, groupId: string): { frames: BrokerFrame[]; final: BrokerState } {
  const final = addConsumer(state, groupId);
  const added = getGroup(final, groupId).consumers.at(-1)!.id;
  const idle = getGroup(final, groupId).consumers.filter((c) => c.alive && c.partitions.length === 0);
  return {
    frames: [
      { state, focus: { group: groupId }, caption: `A new consumer, ${added}, joins ${groupId}. Members commit their progress so nothing is redone.` },
      {
        state: final,
        focus: { group: groupId, kind: 'assign' },
        caption: `Rebalance: ${owners(final, groupId)}.${idle.length ? ` A partition is read by only one consumer in a group, so with ${final.partitions.length} partition${final.partitions.length === 1 ? '' : 's'} the extra consumer${idle.length === 1 ? ' sits' : 's sit'} idle.` : ''}`,
      },
    ],
    final,
  };
}

export function traceAddGroup(state: BrokerState, groupId: string, consumers: number, from: StartFrom): { frames: BrokerFrame[]; final: BrokerState } {
  const final = addGroup(state, groupId, consumers, from);
  return {
    frames: [
      {
        state: final,
        focus: { group: groupId, kind: 'assign' },
        caption: `A second, independent group **${groupId}** subscribes, starting from the ${from === 'earliest' ? 'oldest retained message' : 'end of the log'}. It has its own offsets, so it gets every message too (fan-out) without disturbing the other group.`,
      },
    ],
    final,
  };
}

export function traceReset(state: BrokerState, groupId: string, to: StartFrom): { frames: BrokerFrame[]; final: BrokerState } {
  const final = resetOffsets(state, groupId, to);
  return {
    frames: [
      {
        state: final,
        focus: { group: groupId, kind: 'assign' },
        caption:
          to === 'earliest'
            ? `${groupId}’s offsets are moved back to the oldest retained message. Reading is harmless, so the group can simply **replay** everything still on disk — handy after fixing a bug.`
            : `${groupId}’s offsets are moved to the end of the log. Anything it hadn’t read yet is **skipped** — a deliberate choice, never something to do by accident.`,
      },
    ],
    final,
  };
}
