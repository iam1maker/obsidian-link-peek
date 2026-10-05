import type { LinkMetadata } from "../metadata/types";

export const ELLIPSIS = "…";

/** Cut by code points, not UTF-16 units, so emoji and CJK never split. */
export function clampText(text: string, max: number): string {
	const chars = [...text];
	if (chars.length <= max) return text;
	return chars.slice(0, Math.max(1, max - 1)).join("").trimEnd() + ELLIPSIS;
}

export interface ChipLabel {
	title: string;
	favicon: string | null;
}

/**
 * What a bare URL turns into. No cached title means no chip: the raw URL stays,
 * so nothing ever shows a half-made placeholder or a guess.
 */
export function chipLabel(meta: LinkMetadata | null, maxLength: number): ChipLabel | null {
	const title = meta?.title?.replace(/\s+/g, " ").trim();
	if (!title) return null;
	return { title: clampText(title, maxLength), favicon: meta?.favicon ?? null };
}
