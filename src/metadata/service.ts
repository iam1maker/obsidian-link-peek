import type { MetadataCache } from "../cache";
import type { LinkMetadata, MetadataResult } from "./types";

export type Fetcher = (url: string) => Promise<MetadataResult>;

/** A stale entry is refreshed at most this often, so a site that is down is not asked on every hover. */
const REVALIDATE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The single way to get metadata: cache first, one in-flight request per URL,
 * and one change signal for everyone who renders it (hover card, inline chips,
 * Reading view). Hover, prefetch and retry all go through here so a URL is
 * never fetched twice at once.
 */
export class MetadataService {
	private inflight = new Map<string, Promise<MetadataResult>>();
	private listeners = new Set<() => void>();
	/** When each stale URL was last refreshed in the background. */
	private revalidatedAt = new Map<string, number>();

	constructor(
		readonly cache: MetadataCache,
		private fetcher: Fetcher,
		private now: () => number = () => Date.now(),
	) {}

	/** Cached result, success or recent failure. */
	get(url: string): MetadataResult | null {
		return this.cache.get(url);
	}

	/** Cached metadata for a successful lookup only. */
	peek(url: string): LinkMetadata | null {
		const result = this.cache.get(url);
		return result?.ok ? result.meta : null;
	}

	lookup(url: string): Promise<MetadataResult> {
		const cached = this.cache.get(url);
		if (cached) return Promise.resolve(cached);
		return this.fetch(url);
	}

	/**
	 * Refresh a stale entry in the background (hover does this). Resolves to the
	 * new result, or null when the entry is fresh or was refreshed recently. A
	 * failed refresh keeps the old metadata: stale beats an error card.
	 */
	revalidate(url: string): Promise<MetadataResult | null> {
		if (!this.cache.isStale(url)) return Promise.resolve(null);
		const last = this.revalidatedAt.get(url);
		if (last !== undefined && this.now() - last < REVALIDATE_INTERVAL_MS) return Promise.resolve(null);
		this.revalidatedAt.set(url, this.now());
		return this.fetch(url, true);
	}

	/** Drop whatever is cached and fetch again (the Retry button). */
	refresh(url: string): Promise<MetadataResult> {
		this.cache.delete(url);
		return this.fetch(url);
	}

	clear(): void {
		this.cache.clear();
		this.emit();
	}

	/** Called after every cache change. Returns an unsubscribe function. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (error) {
				console.error("[link-peek] change listener failed:", error);
			}
		}
	}

	private fetch(url: string, keepOnFailure = false): Promise<MetadataResult> {
		const existing = this.inflight.get(url);
		if (existing) return existing;
		const promise = this.fetcher(url)
			.then((result) => {
				const previous = keepOnFailure && !result.ok ? this.cache.get(url) : null;
				if (previous?.ok) return previous;
				this.cache.set(url, result);
				this.emit();
				return result;
			})
			.finally(() => this.inflight.delete(url));
		this.inflight.set(url, promise);
		return promise;
	}
}
