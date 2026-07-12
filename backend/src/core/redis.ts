/*
 * KV abstraction — the Redis seam. Sessions, rate limits, lockouts,
 * idempotency replay, caches, and distributed locks all go through this
 * interface. `MemoryKV` backs it today; a RedisKV(config.redisUrl) drop-in
 * replaces it in staging/production with zero call-site changes.
 */

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** atomic increment; sets TTL when the key is created */
  incr(key: string, ttlSec?: number): Promise<number>;
  /** distributed lock: returns a release fn, or null if already held */
  lock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
}

interface Entry {
  value: string;
  expiresAt: number; // 0 = never
}

export class MemoryKV implements KV {
  private map = new Map<string, Entry>();

  private live(key: string): Entry | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt !== 0 && e.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSec?: number) {
    this.map.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }

  async del(key: string) {
    this.map.delete(key);
  }

  async incr(key: string, ttlSec?: number) {
    const cur = this.live(key);
    const next = cur ? Number(cur.value) + 1 : 1;
    this.map.set(key, {
      value: String(next),
      expiresAt: cur ? cur.expiresAt : ttlSec ? Date.now() + ttlSec * 1000 : 0,
    });
    return next;
  }

  async lock(key: string, ttlMs: number) {
    const k = `lock:${key}`;
    if (this.live(k)) return null;
    this.map.set(k, { value: "1", expiresAt: Date.now() + ttlMs });
    return async () => {
      this.map.delete(k);
    };
  }

  /** test helper */
  clear() {
    this.map.clear();
  }
}

export const kv: KV = new MemoryKV();
