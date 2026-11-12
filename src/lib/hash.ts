/** 32-bit FNV-1a with a MurmurHash3 finalizer for better bit spread on short keys. */
export function hash32(input: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
