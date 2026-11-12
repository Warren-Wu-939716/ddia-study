import { db, TABLE_NAMES, type TableName } from './db.ts';

export const BACKUP_APP_ID = 'ddia-study';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type BackupTables = Record<TableName, Record<string, unknown>[]>;

export interface Backup {
  app: typeof BACKUP_APP_ID;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  tables: BackupTables;
}

/** Primary-key field per table; every imported record must have it. */
const PRIMARY_KEYS: Record<TableName, string | null> = {
  cardStates: 'cardId',
  reviewLogs: null,
  responses: 'key',
  customCards: 'id',
  challenges: 'challengeId',
  problemAttempts: 'problemId',
  journal: null,
  settings: 'key',
};

/** Date-valued fields (dot paths) that JSON flattens to strings and must be revived on import. */
const DATE_FIELDS: Record<TableName, string[]> = {
  cardStates: ['unlockedAt', 'introducedAt', 'fsrs.due', 'fsrs.last_review'],
  reviewLogs: ['reviewedAt'],
  responses: ['updatedAt', 'completedAt'],
  customCards: ['createdAt'],
  challenges: ['completedAt'],
  problemAttempts: ['firstAt', 'updatedAt'],
  journal: ['createdAt'],
  settings: [],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reviveDate(record: Record<string, unknown>, path: string, where: string): void {
  const parts = path.split('.');
  let target: Record<string, unknown> = record;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (!isPlainObject(next)) return;
    target = next;
  }
  const leaf = parts[parts.length - 1];
  const value = target[leaf];
  if (value === null || value === undefined || value instanceof Date) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${where}: "${path}" is not a valid date`);
  }
  target[leaf] = new Date(value);
}

/** Validates an untrusted backup object and revives its dates. Throws a readable Error on bad input. */
export function parseBackup(input: unknown): Backup {
  if (!isPlainObject(input)) throw new Error('Backup must be a JSON object.');
  if (input.app !== BACKUP_APP_ID) throw new Error('This file is not a DDIA Study backup.');
  if (input.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(input.version)}.`);
  if (!isPlainObject(input.tables)) throw new Error('Backup is missing its tables.');
  const rawTables = input.tables;
  const tables = {} as BackupTables;
  for (const name of TABLE_NAMES) {
    const rows = rawTables[name] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Table "${name}" must be an array.`);
    tables[name] = rows.map((row, index) => {
      const where = `${name}[${index}]`;
      if (!isPlainObject(row)) throw new Error(`${where} must be an object.`);
      const copy = structuredClone(row);
      const pk = PRIMARY_KEYS[name];
      if (pk && (typeof copy[pk] !== 'string' || copy[pk] === '')) throw new Error(`${where} is missing "${pk}".`);
      for (const path of DATE_FIELDS[name]) reviveDate(copy, path, where);
      return copy;
    });
  }
  const exportedAt = typeof input.exportedAt === 'string' ? input.exportedAt : new Date(0).toISOString();
  return { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt, tables };
}

/** Parses JSON text from a user-selected file. */
export function parseBackupText(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('Backup file is too large.');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  return parseBackup(json);
}

/** Snapshot of every table. */
export async function exportBackup(now = new Date()): Promise<Backup> {
  const tables = {} as BackupTables;
  for (const name of TABLE_NAMES) {
    tables[name] = (await db.table(name).toArray()) as Record<string, unknown>[];
  }
  return { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

/** Replaces all progress with the backup's contents in one transaction. */
export async function importBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkAdd(backup.tables[name]);
    }
  });
}
