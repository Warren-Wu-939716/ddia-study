import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './db.ts';

describe('requestPersistentStorage', () => {
  it('returns false when the Storage API is unavailable', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false);
  });

  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks for persistence and reports whether the browser granted it', async () => {
    const persist = vi.fn(async () => false);
    expect(await requestPersistentStorage({ persisted: async () => false, persist })).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('returns false when the browser rejects the request', async () => {
    const persisted = async (): Promise<boolean> => {
      throw new Error('denied');
    };
    expect(await requestPersistentStorage({ persisted, persist: async () => true })).toBe(false);
  });
});
