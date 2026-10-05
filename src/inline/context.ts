import type { MetadataService } from "../metadata/service";
import type { LinkPeekSettings } from "../settings";
import type { Prefetcher } from "./prefetch";

/** What the inline renderers need from the plugin, kept narrow so they stay testable and decoupled. */
export interface InlineContext {
	settings(): LinkPeekSettings;
	service: MetadataService;
	prefetch: Prefetcher;
	/** True when the note at this path has `link-peek: off`. */
	optedOut(path: string | null): boolean;
	/** Called when anything that affects inline rendering changes. Returns an unsubscribe function. */
	onRefresh(listener: () => void): () => void;
	/** Open the hover card for a URL, pinned, next to an element. */
	peek(url: string, el: Element): void;
}
