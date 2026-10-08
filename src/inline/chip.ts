import { Menu, Notice } from "obsidian";
import type { ChipLabel } from "./label";

/**
 * A detached `<span>` owned by the window `near` lives in. Obsidian installs its DOM
 * helpers on every window, so a pop-out gets nodes from its own document.
 */
export function spanFor(near: Node, cls: string): HTMLSpanElement {
	return (near.win as Window & { createSpan: typeof createSpan }).createSpan({ cls });
}

/** Fill an element with favicon + title. Shared by the Live Preview widget and Reading view anchors. */
export function fillChip(el: HTMLElement, label: ChipLabel): void {
	el.empty();
	if (label.favicon) appendIcon(el, label.favicon, "lpk-chip-icon");
	el.createSpan({ cls: "lpk-chip-title", text: label.title });
}

/** A favicon `<img>` that removes itself when the site has none, so no broken-image glyph ever shows. */
export function appendIcon(parent: HTMLElement, src: string, cls: string, prepend = false): HTMLImageElement {
	const img = parent.createEl("img", { cls, attr: { src, alt: "", referrerpolicy: "no-referrer", draggable: "false" } });
	if (prepend) parent.prepend(img);
	img.addEventListener("error", () => img.remove(), { once: true });
	return img;
}

export function openUrl(url: string): void {
	// Obsidian routes window.open for http(s) to the system browser.
	activeWindow.open(url, "_blank");
}

export interface LinkMenuActions {
	/** Reveal the raw URL in the editor for editing. Absent in Reading view. */
	edit?: () => void;
	/** Open the Link Peek card pinned next to the link. */
	peek: () => void;
}

export function showLinkMenu(event: MouseEvent, url: string, actions: LinkMenuActions): void {
	const menu = new Menu();
	menu.addItem((item) => item.setTitle("Open link").setIcon("external-link").onClick(() => openUrl(url)));
	menu.addItem((item) => item.setTitle("Preview card").setIcon("panel-top").onClick(actions.peek));
	menu.addItem((item) =>
		item
			.setTitle("Copy URL")
			.setIcon("copy")
			.onClick(() => {
				void navigator.clipboard.writeText(url).then(
					() => new Notice("URL copied"),
					(error: unknown) => console.error("[link-peek] copy failed:", error),
				);
			}),
	);
	if (actions.edit) {
		const edit = actions.edit;
		menu.addItem((item) => item.setTitle("Edit URL").setIcon("pencil").onClick(edit));
	}
	menu.showAtMouseEvent(event);
}
