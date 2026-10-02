import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 500;

/**
 * Process-local response cache with in-flight de-duplication.
 *
 * Marketplace research is read-heavy and the upstream APIs are slow and rate
 * limited, so repeated identical lookups (a user paging back and forth, two
 * panels on one page needing the same item) must not become repeated upstream
 * calls. `wrap` guarantees one upstream call per key per TTL window even when
 * several requests arrive at the same moment.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async wrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const run = factory()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, run);
    return run;
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= MAX_ENTRIES) this.evictOldest();
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix: string): number {
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) this.logger.debug(`Invalidated ${removed} cache entries for ${prefix}`);
    return removed;
  }

  /** Builds a stable key from a prefix and a filter object. */
  key(prefix: string, parts: Record<string, unknown>): string {
    const serialised = Object.keys(parts)
      .sort()
      .filter((name) => parts[name] !== undefined && parts[name] !== null && parts[name] !== '')
      .map((name) => `${name}=${String(parts[name])}`)
      .join('&');
    return `${prefix}:${serialised}`;
  }

  private evictOldest(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
