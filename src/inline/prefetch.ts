/**
 * Fetch titles for links on screen, politely. URLs are collected while the
 * user scrolls and only fetched once the view has been still for `delayMs`,
 * at most `concurrency` at a time. Used only in the opt-in
 * "fetch automatically" mode.
 */

export interface PrefetchOptions {
	/** Resolves when the URL's metadata (or failure) is in the cache. */
	lookup: (url: string) => Promise<unknown>;
	/** True when the cache already has an answer (success or recent failure). */
	known: (url: string) => boolean;
	delayMs?: number;
	concurrency?: number;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (id: number) => void;
}

export class Prefetcher {
	private queue = new Set<string>();
	private active = 0;
	private timer: number | null = null;
	private readonly delayMs: number;
	private readonly concurrency: number;
	private readonly setTimer: (fn: () => void, ms: number) => number;
	private readonly clearTimer: (id: number) => void;

	constructor(private options: PrefetchOptions) {
		this.delayMs = options.delayMs ?? 500;
		this.concurrency = options.concurrency ?? 2;
		this.setTimer = options.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
		this.clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));
	}

	get pending(): number {
		return this.queue.size;
	}

	/** Add URLs; each call restarts the stillness timer. */
	enqueue(urls: Iterable<string>): void {
		let added = false;
		for (const url of urls) {
			if (this.options.known(url) || this.queue.has(url)) continue;
			this.queue.add(url);
			added = true;
		}
		if (!added) return;
		if (this.timer !== null) this.clearTimer(this.timer);
		this.timer = this.setTimer(() => {
			this.timer = null;
			this.pump();
		}, this.delayMs);
	}

	/** Forget everything not yet started (mode switched off, plugin unloading). */
	clear(): void {
		this.queue.clear();
		if (this.timer !== null) this.clearTimer(this.timer);
		this.timer = null;
	}

	private pump(): void {
		while (this.active < this.concurrency && this.queue.size > 0) {
			const url = this.queue.values().next().value as string;
			this.queue.delete(url);
			if (this.options.known(url)) continue;
			this.active++;
			void this.options
				.lookup(url)
				.catch(() => undefined)
				.finally(() => {
					this.active--;
					this.pump();
				});
		}
	}
}
