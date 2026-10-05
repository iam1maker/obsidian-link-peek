import type { MetadataCache } from "../cache";
import type { LinkMetadata, MetadataResult } from "./types";

export type Fetcher = (url: string) => Promise<MetadataResult>;

/**
 * The single way to get metadata: cache first, one in-flight request per URL,
 * and one change signal for everyone who renders it (hover card, inline chips,
 * Reading view). Hover, prefetch and retry all go through here so a URL is
 * never fetched twice at once.
 */
export class MetadataService {
	private inflight = new Map<string, Promise<MetadataResult>>();
	private listeners = new Set<() => void>();

	constructor(
		readonly cache: MetadataCache,
		private fetcher: Fetcher,
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

	private fetch(url: string): Promise<MetadataResult> {
		const existing = this.inflight.get(url);
		if (existing) return existing;
		const promise = this.fetcher(url)
			.then((result) => {
				this.cache.set(url, result);
				this.emit();
				return result;
			})
			.finally(() => this.inflight.delete(url));
		this.inflight.set(url, promise);
		return promise;
	}
}
