import type { LinkMetadata, MetadataResult } from "./metadata/types";

export interface CacheEntry {
	result: MetadataResult;
	fetchedAt: number;
	lastAccess: number;
}

export interface CacheOptions {
	/** Successful lookups live this long. */
	ttlMs: number;
	/** Failures are retried sooner: a site that was down should not stay "broken" for a week. */
	failureTtlMs: number;
	maxEntries: number;
}

export type SerializedCache = Record<string, CacheEntry>;

/** Fragments never reach the server, so `#a` and `#b` are the same page. */
export function normalizeUrl(raw: string): string {
	try {
		const url = new URL(raw.trim());
		url.hash = "";
		return url.toString();
	} catch {
		return raw.trim();
	}
}

/**
 * In-memory metadata cache with TTL and LRU eviction.
 * Persistence is the caller's job: `toJSON()` / `fromJSON()` round-trip plain objects
 * so the plugin can store it with `saveData()`.
 */
export class MetadataCache {
	private entries = new Map<string, CacheEntry>();
	private readonly now: () => number;

	constructor(
		private options: CacheOptions,
		now: () => number = () => Date.now(),
	) {
		this.now = now;
	}

	setOptions(options: Partial<CacheOptions>): void {
		this.options = { ...this.options, ...options };
		this.evict();
	}

	get size(): number {
		return this.entries.size;
	}

	get(url: string): MetadataResult | null {
		const key = normalizeUrl(url);
		const entry = this.entries.get(key);
		if (!entry) return null;
		if (this.isExpired(entry)) {
			this.entries.delete(key);
			return null;
		}
		entry.lastAccess = this.now();
		return entry.result;
	}

	set(url: string, result: MetadataResult): void {
		const key = normalizeUrl(url);
		const timestamp = this.now();
		this.entries.set(key, { result, fetchedAt: timestamp, lastAccess: timestamp });
		this.evict();
	}

	delete(url: string): boolean {
		return this.entries.delete(normalizeUrl(url));
	}

	clear(): void {
		this.entries.clear();
	}

	toJSON(): SerializedCache {
		const out: SerializedCache = {};
		for (const [key, entry] of this.entries) {
			if (!this.isExpired(entry)) out[key] = entry;
		}
		return out;
	}

	fromJSON(data: unknown): void {
		this.entries.clear();
		if (!data || typeof data !== "object") return;
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			if (isCacheEntry(value) && !this.isExpired(value)) this.entries.set(key, value);
		}
		this.evict();
	}

	private isExpired(entry: CacheEntry): boolean {
		const ttl = entry.result.ok ? this.options.ttlMs : this.options.failureTtlMs;
		return this.now() - entry.fetchedAt > ttl;
	}

	private evict(): void {
		const overflow = this.entries.size - this.options.maxEntries;
		if (overflow <= 0) return;
		const byAge = [...this.entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
		for (let i = 0; i < overflow; i++) this.entries.delete(byAge[i][0]);
	}
}

function isCacheEntry(value: unknown): value is CacheEntry {
	if (!value || typeof value !== "object") return false;
	const entry = value as Partial<CacheEntry>;
	if (typeof entry.fetchedAt !== "number" || typeof entry.lastAccess !== "number") return false;
	const result = entry.result as Partial<MetadataResult> | undefined;
	if (!result || typeof result.ok !== "boolean") return false;
	if (result.ok) {
		const meta = (result as { meta?: Partial<LinkMetadata> }).meta;
		return !!meta && typeof meta.url === "string";
	}
	return typeof (result as { error?: unknown }).error === "string";
}
