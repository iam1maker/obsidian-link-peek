import { setIcon } from "obsidian";
import { t } from "../i18n";
import { appendIcon } from "../inline/chip";
import { FILE_ICONS, fileKindOf } from "../metadata/files";
import { displayUrl } from "../metadata/parse";
import type { LinkMetadata } from "../metadata/types";

/** Images narrower than this (width / height) are shown whole rather than cropped. */
const WIDE_IMAGE_RATIO = 1.4;

/** How a card is drawn, from settings. */
export interface CardLook {
	compact: boolean;
	/** Thumbnails on, and this host not on the no-image list. */
	showImage: boolean;
}

/** Identity of what a card shows, so editors and Reading view skip re-renders that change nothing. */
export function cardKey(meta: LinkMetadata | null, look: CardLook): string {
	if (!meta) return `loading|${look.compact}`;
	return [meta.url, meta.title, meta.description, meta.image, meta.favicon, meta.fileKind, look.compact, look.showImage].join("|");
}

/**
 * A bookmark card: title, two lines of description and the URL on the left,
 * the thumbnail (or a file-type icon) on the right. Built into `el`, which the
 * caller owns so it can attach its own click handling.
 */
export function renderCard(el: HTMLElement, meta: LinkMetadata, look: CardLook): void {
	el.empty();
	el.className = "lpk-card";
	el.toggleClass("is-compact", look.compact);
	el.setAttr("title", meta.url);

	const kind = fileKindOf(meta);
	const body = el.createDiv({ cls: "lpk-card-body" });
	const title = meta.title?.trim() || displayUrl(meta.url);
	body.createDiv({ cls: "lpk-card-title", text: title });
	if (!look.compact) {
		const description = meta.description?.trim() || (kind ? t(`file.${kind}`) : "");
		// Many sites repeat the title as the description; saying it twice adds nothing.
		if (description && description !== title) body.createDiv({ cls: "lpk-card-desc", text: description });
		else el.addClass("no-desc");
	}
	const footer = body.createDiv({ cls: "lpk-card-meta" });
	if (meta.favicon) appendIcon(footer, meta.favicon, "lpk-card-favicon");
	footer.createSpan({ cls: "lpk-card-url", text: displayUrl(meta.url) });

	if (look.compact) return;
	if (kind && kind !== "image") {
		const thumb = el.createDiv({ cls: "lpk-card-thumb is-file" });
		setIcon(thumb, FILE_ICONS[kind]);
		return;
	}
	if (meta.image && look.showImage) {
		const thumb = el.createDiv({ cls: "lpk-card-thumb" });
		const img = thumb.createEl("img", {
			attr: { src: meta.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", draggable: "false" },
		});
		// A dead thumbnail leaves the text to fill the card instead of an empty box.
		img.addEventListener("error", () => thumb.remove(), { once: true });
		// Logos and avatars are near square; cropping them to a banner cuts them in half.
		img.addEventListener(
			"load",
			() => thumb.toggleClass("is-contained", img.naturalWidth < img.naturalHeight * WIDE_IMAGE_RATIO),
			{ once: true },
		);
	}
}

/** Same footprint as a card, shown while its metadata is being fetched. */
export function renderSkeleton(el: HTMLElement, look: CardLook): void {
	el.empty();
	el.className = "lpk-card is-loading";
	el.toggleClass("is-compact", look.compact);
	const body = el.createDiv({ cls: "lpk-card-body" });
	body.createDiv({ cls: "lpk-card-bar is-title" });
	if (!look.compact) body.createDiv({ cls: "lpk-card-bar is-desc" });
	body.createDiv({ cls: "lpk-card-bar is-meta" });
}
