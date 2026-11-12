import type { ComponentType } from 'react';
import type { WidgetId } from '../content/types.ts';
import { BitmapWidget, DataCubeWidget, RowColumnWidget } from './AnalyticsWidgets.tsx';
import { AppendLogWidget, HashIndexWidget } from './AppendLogWidget.tsx';
import { BTreeMiniWidget, WalCrashWidget } from './BTreeWidgets.tsx';
import { SsdGcWidget, WriteAmpWidget } from './HardwareWidgets.tsx';
import { FuzzyWidget, IndexHopsWidget, InvertedIndexWidget, MapRangeWidget, PhoneBookWidget } from './IndexWidgets.tsx';
import { BloomMiniWidget, LsmMiniWidget, MergeWidget, SparseIndexWidget } from './LsmWidgets.tsx';
import { BrokerMiniWidget } from './BrokerWidget.tsx';
import * as D from './DiagramWidgets12.tsx';
import { DualWritesWidget, EventLogWidget, FanoutWidget, LogCompactionWidget, RedeliveryWidget } from './StreamWidgets.tsx';
import { EventTimeWidget, ExactlyOnceWidget, StreamJoinsWidget, WindowsWidget } from './StreamTimeWidgets.tsx';
import { VectorSearchWidget } from './VectorWidget.tsx';

/** Interactive lesson widgets by id; lessons reference them with `{ kind: 'widget', widget: id }`. */
export const WIDGETS: Record<WidgetId, ComponentType> = {
  'append-log': AppendLogWidget,
  'hash-index': HashIndexWidget,
  'sparse-index': SparseIndexWidget,
  'lsm-mini': LsmMiniWidget,
  merge: MergeWidget,
  'bloom-mini': BloomMiniWidget,
  'btree-mini': BTreeMiniWidget,
  'wal-crash': WalCrashWidget,
  'ssd-gc': SsdGcWidget,
  'write-amp': WriteAmpWidget,
  'index-hops': IndexHopsWidget,
  'row-column': RowColumnWidget,
  bitmap: BitmapWidget,
  'data-cube': DataCubeWidget,
  'phone-book': PhoneBookWidget,
  'map-range': MapRangeWidget,
  'inverted-index': InvertedIndexWidget,
  fuzzy: FuzzyWidget,
  'vector-search': VectorSearchWidget,
  fanout: FanoutWidget,
  redelivery: RedeliveryWidget,
  'broker-mini': BrokerMiniWidget,
  'dual-writes': DualWritesWidget,
  'log-compaction': LogCompactionWidget,
  'event-log': EventLogWidget,
  'event-time': EventTimeWidget,
  windows: WindowsWidget,
  'stream-joins': StreamJoinsWidget,
  'exactly-once': ExactlyOnceWidget,
  'batch-vs-stream': D.BatchVsStreamWidget,
  pubsub: D.PubSubWidget,
  polling: D.PollingWidget,
  overload: D.OverloadWidget,
  'direct-vs-broker': D.DirectVsBrokerWidget,
  'partition-order': D.PartitionOrderWidget,
  'hol-blocking': D.HolBlockingWidget,
  retention: D.RetentionWidget,
  'cdc-snapshot': D.CdcSnapshotWidget,
  outbox: D.OutboxWidget,
  ledger: D.LedgerWidget,
  'crypto-shredding': D.CryptoShreddingWidget,
  'async-view': D.AsyncViewWidget,
  cep: D.CepWidget,
  'stream-search': D.StreamSearchWidget,
  'stream-analytics': D.StreamAnalyticsWidget,
  ivm: D.IvmWidget,
  'two-clocks': D.TwoClocksWidget,
  stragglers: D.StragglersWidget,
  'clock-skew': D.ClockSkewWidget,
  'versioned-join': D.VersionedJoinWidget,
  checkpoint: D.CheckpointWidget,
  'state-recovery': D.StateRecoveryWidget,
  fencing: D.FencingWidget,
};
