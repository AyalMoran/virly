// Runs once per test file (Jest setupFiles), before the file's modules load.
//
// The client runs under testEnvironment "node", which has no Web Storage. Client
// source (e.g. lib/route-transition.ts, lib/currency.ts) accesses sessionStorage /
// localStorage directly, so every client test file needs them defined. Installing
// fresh in-memory shims here makes the suite ORDER-INDEPENDENT — previously some
// tests passed only because another file happened to leave a storage global behind
// (and one restored it to `undefined`), which broke under CI's worker ordering.

class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const g = globalThis as unknown as {
  localStorage: Storage;
  sessionStorage: Storage;
};

g.localStorage = new MemoryStorage() as unknown as Storage;
g.sessionStorage = new MemoryStorage() as unknown as Storage;
