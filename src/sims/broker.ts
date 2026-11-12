import { hash32 } from '../lib/hash.ts';

/**
 * A small model of a log-based message broker (Kafka-style): a topic split into
 * partitions, consumer groups that share partitions, committed offsets, retention
 * and replay. Every function returns a new state.
 */

export interface BrokerMessage {
  partition: number;
  offset: number;
  key: string;
  value: string;
  /** Global production order, used to interleave partitions realistically. */
  seq: number;
}

export interface Partition {
  id: number;
  /** Messages still on disk, oldest first. */
  messages: BrokerMessage[];
  /** Offset of the oldest retained message; anything below was deleted by retention. */
  startOffset: number;
  /** Offset the next appended message will receive. */
  endOffset: number;
}

export interface GroupConsumer {
  id: string;
  alive: boolean;
  partitions: number[];
  /** Next offset to read for each assigned partition. Lives only in the consumer's memory. */
  positions: Record<number, number>;
  /** Messages processed since this consumer last committed. */
  sinceCommit: number;
}

export interface Delivery {
  partition: number;
  offset: number;
  key: string;
  consumer: string;
}

export interface ConsumerGroup {
  id: string;
  consumers: GroupConsumer[];
  /** Committed offset (next offset to read) per partition — the only progress that survives a crash. */
  committed: Record<number, number>;
  /** Every message processed, in order. A repeated (partition, offset) is a duplicate. */
  deliveries: Delivery[];
  /** Messages deleted by retention before this group got to them. */
  missed: number;
}

export interface BrokerConfig {
  partitions: number;
  /** Messages kept per partition before the oldest are deleted. */
  retention: number;
  /** A consumer commits its offsets after processing this many messages. */
  commitEvery: number;
}

export interface BrokerState {
  config: BrokerConfig;
  partitions: Partition[];
  groups: ConsumerGroup[];
  produced: number;
}

export type StartFrom = 'earliest' | 'latest';

export function createBroker(config: BrokerConfig): BrokerState {
  if (!Number.isInteger(config.partitions) || config.partitions < 1) throw new RangeError('A topic needs at least one partition');
  return {
    config,
    partitions: Array.from({ length: config.partitions }, (_, id) => ({ id, messages: [], startOffset: 0, endOffset: 0 })),
    groups: [],
    produced: 0,
  };
}

/** The partition key decides the partition, so all messages with one key stay in order. */
export function partitionFor(key: string, partitions: number): number {
  return hash32(key) % partitions;
}

export function produce(state: BrokerState, key: string, value: string): BrokerState {
  const p = partitionFor(key, state.partitions.length);
  const partitions = state.partitions.map((part) => {
    if (part.id !== p) return part;
    const messages = [...part.messages, { partition: p, offset: part.endOffset, key, value, seq: state.produced }];
    const dropped = Math.max(0, messages.length - state.config.retention);
    return { ...part, messages: messages.slice(dropped), startOffset: part.startOffset + dropped, endOffset: part.endOffset + 1 };
  });
  return { ...state, partitions, produced: state.produced + 1 };
}

export function getGroup(state: BrokerState, groupId: string): ConsumerGroup {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`No consumer group ${groupId}`);
  return group;
}

function withGroup(state: BrokerState, groupId: string, update: (group: ConsumerGroup) => ConsumerGroup): BrokerState {
  return { ...state, groups: state.groups.map((g) => (g.id === groupId ? update(g) : g)) };
}

/** Partition p goes to live consumer p mod n; every consumer restarts from the committed offsets. */
function assign(group: ConsumerGroup, partitionCount: number): ConsumerGroup {
  const alive = group.consumers.filter((c) => c.alive);
  const owner = new Map<number, string>();
  for (let p = 0; p < partitionCount && alive.length > 0; p++) owner.set(p, alive[p % alive.length].id);
  return {
    ...group,
    consumers: group.consumers.map((c) => {
      const partitions = [...owner.entries()].filter(([, id]) => id === c.id).map(([p]) => p);
      return { ...c, partitions, positions: Object.fromEntries(partitions.map((p) => [p, group.committed[p]])), sinceCommit: 0 };
    }),
  };
}

function commitPositions(group: ConsumerGroup, consumerIds: readonly string[]): ConsumerGroup {
  const committed = { ...group.committed };
  for (const c of group.consumers) if (consumerIds.includes(c.id)) Object.assign(committed, c.positions);
  return { ...group, committed, consumers: group.consumers.map((c) => (consumerIds.includes(c.id) ? { ...c, sinceCommit: 0 } : c)) };
}

export function addGroup(state: BrokerState, groupId: string, consumerCount: number, from: StartFrom = 'earliest'): BrokerState {
  if (state.groups.some((g) => g.id === groupId)) throw new Error(`Group ${groupId} already exists`);
  const group: ConsumerGroup = {
    id: groupId,
    consumers: Array.from({ length: consumerCount }, (_, i) => ({ id: `c${i + 1}`, alive: true, partitions: [], positions: {}, sinceCommit: 0 })),
    committed: Object.fromEntries(state.partitions.map((p) => [p.id, from === 'earliest' ? p.startOffset : p.endOffset])),
    deliveries: [],
    missed: 0,
  };
  return { ...state, groups: [...state.groups, assign(group, state.partitions.length)] };
}

export interface PollResult {
  state: BrokerState;
  delivery: Delivery | null;
  /** Offsets that were deleted before this consumer read them. */
  skipped: number;
  committed: boolean;
}

/** One consumer processes the earliest-produced message waiting on its partitions. */
export function poll(state: BrokerState, groupId: string, consumerId: string): PollResult {
  const group = getGroup(state, groupId);
  const consumer = group.consumers.find((c) => c.id === consumerId);
  if (!consumer?.alive) return { state, delivery: null, skipped: 0, committed: false };

  let next: BrokerMessage | undefined;
  let skipped = 0;
  const positions = { ...consumer.positions };
  for (const p of consumer.partitions) {
    const part = state.partitions[p];
    if (positions[p] < part.startOffset) {
      skipped += part.startOffset - positions[p];
      positions[p] = part.startOffset;
    }
    const candidate = part.messages[positions[p] - part.startOffset];
    if (candidate && (!next || candidate.seq < next.seq)) next = candidate;
  }
  if (!next) {
    const updated = { ...group, missed: group.missed + skipped, consumers: group.consumers.map((c) => (c.id === consumerId ? { ...c, positions } : c)) };
    return { state: withGroup(state, groupId, () => updated), delivery: null, skipped, committed: false };
  }

  positions[next.partition] = next.offset + 1;
  const delivery: Delivery = { partition: next.partition, offset: next.offset, key: next.key, consumer: consumerId };
  const sinceCommit = consumer.sinceCommit + 1;
  let updated: ConsumerGroup = {
    ...group,
    missed: group.missed + skipped,
    deliveries: [...group.deliveries, delivery],
    consumers: group.consumers.map((c) => (c.id === consumerId ? { ...c, positions, sinceCommit } : c)),
  };
  const commit = sinceCommit >= state.config.commitEvery;
  if (commit) updated = commitPositions(updated, [consumerId]);
  return { state: withGroup(state, groupId, () => updated), delivery, skipped, committed: commit };
}

/** Every live consumer in the group takes one turn. */
export function tick(state: BrokerState, groupId: string): BrokerState {
  return getGroup(state, groupId)
    .consumers.filter((c) => c.alive)
    .reduce((s, c) => poll(s, groupId, c.id).state, state);
}

/** Polls until the group has nothing left to read (bounded for safety). */
export function drain(state: BrokerState, groupId: string, maxTicks = 1000): BrokerState {
  let current = state;
  for (let i = 0; i < maxTicks && lag(current, groupId, 'position') > 0; i++) current = tick(current, groupId);
  return current;
}

export function commit(state: BrokerState, groupId: string, consumerId: string): BrokerState {
  return withGroup(state, groupId, (g) => commitPositions(g, [consumerId]));
}

/** The crashed consumer's uncommitted progress is lost; survivors commit before the rebalance. */
export function crash(state: BrokerState, groupId: string, consumerId: string): BrokerState {
  return withGroup(state, groupId, (g) => {
    const survivors = g.consumers.filter((c) => c.alive && c.id !== consumerId).map((c) => c.id);
    const committed = commitPositions(g, survivors);
    const down = { ...committed, consumers: committed.consumers.map((c) => (c.id === consumerId ? { ...c, alive: false } : c)) };
    return assign(down, state.partitions.length);
  });
}

export function restart(state: BrokerState, groupId: string, consumerId: string): BrokerState {
  return withGroup(state, groupId, (g) => {
    const live = commitPositions(g, g.consumers.filter((c) => c.alive).map((c) => c.id));
    return assign({ ...live, consumers: live.consumers.map((c) => (c.id === consumerId ? { ...c, alive: true } : c)) }, state.partitions.length);
  });
}

export function addConsumer(state: BrokerState, groupId: string): BrokerState {
  return withGroup(state, groupId, (g) => {
    const live = commitPositions(g, g.consumers.filter((c) => c.alive).map((c) => c.id));
    const consumer: GroupConsumer = { id: `c${g.consumers.length + 1}`, alive: true, partitions: [], positions: {}, sinceCommit: 0 };
    return assign({ ...live, consumers: [...live.consumers, consumer] }, state.partitions.length);
  });
}

/** Moves the group's committed offsets — to the start of what's retained (replay) or to the end (skip). */
export function resetOffsets(state: BrokerState, groupId: string, to: StartFrom): BrokerState {
  return withGroup(state, groupId, (g) =>
    assign({ ...g, committed: Object.fromEntries(state.partitions.map((p) => [p.id, to === 'earliest' ? p.startOffset : p.endOffset])) }, state.partitions.length),
  );
}

// ── Measurements ────────────────────────────────────────────────────

export function duplicateCount(group: ConsumerGroup): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const d of group.deliveries) {
    const id = `${d.partition}:${d.offset}`;
    if (seen.has(id)) duplicates++;
    else seen.add(id);
  }
  return duplicates;
}

/** Messages not yet processed, measured from committed offsets or from live positions. */
export function lag(state: BrokerState, groupId: string, from: 'committed' | 'position' = 'committed'): number {
  const group = getGroup(state, groupId);
  return state.partitions.reduce((sum, p) => {
    const owner = group.consumers.find((c) => c.alive && c.partitions.includes(p.id));
    const at = from === 'position' && owner ? owner.positions[p.id] : group.committed[p.id];
    return sum + Math.max(0, p.endOffset - at);
  }, 0);
}

export function idleConsumers(group: ConsumerGroup): string[] {
  return group.consumers.filter((c) => c.alive && c.partitions.length === 0).map((c) => c.id);
}

/** True when the first processing of each message with this key happened in offset order. */
export function keyProcessedInOrder(group: ConsumerGroup, key: string): boolean {
  const seen = new Set<string>();
  let last = -1;
  for (const d of group.deliveries) {
    if (d.key !== key || seen.has(`${d.partition}:${d.offset}`)) continue;
    seen.add(`${d.partition}:${d.offset}`);
    if (d.offset < last) return false;
    last = d.offset;
  }
  return true;
}
