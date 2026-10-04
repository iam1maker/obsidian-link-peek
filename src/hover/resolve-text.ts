import { findUrlSpans } from "./resolve-editor";

/**
 * Bare URLs in plain text: search results, the backlinks pane, outline and
 * other sidebar views render match context as text nodes, not anchors. Map the
 * pointer to a caret position inside the text node and look for a URL span
 * around that offset. Costs one hit-test and one regex pass over a single text
 * node, and only runs when nothing else matched.
 */

interface CaretHit {
	node: Node;
	offset: number;
}

type DocWithCaret = Document & {
	caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function caretAt(doc: Document, x: number, y: number): CaretHit | null {
	const d = doc as DocWithCaret;
	if (typeof d.caretPositionFromPoint === "function") {
		const pos = d.caretPositionFromPoint(x, y);
		return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
	}
	if (typeof d.caretRangeFromPoint === "function") {
		const range = d.caretRangeFromPoint(x, y);
		return range ? { node: range.startContainer, offset: range.startOffset } : null;
	}
	return null;
}

/** Contexts where a URL in text is being edited or is already handled elsewhere. */
const SKIP_SELECTOR = ".cm-content, input, textarea, [contenteditable='true'], .lpk-popover, code, pre";

/**
 * Search highlights split a URL across several text nodes
 * (`before<span class="matched">wiki</span>after`). Climb out of inline
 * wrappers to the nearest block and work on its full text.
 */
function blockContaining(node: Node): Element | null {
	let el = node.parentElement;
	for (let i = 0; el?.parentElement && i < 4; i++) {
		const display = el.win.getComputedStyle(el).display;
		if (!display.startsWith("inline")) break;
		el = el.parentElement;
	}
	return el;
}

function offsetWithin(container: Element, node: Node, offset: number): number {
	const walker = container.doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let total = 0;
	for (let current = walker.nextNode(); current; current = walker.nextNode()) {
		if (current === node) return total + offset;
		total += current.textContent?.length ?? 0;
	}
	return -1;
}

export function urlFromTextNode(target: Element, event: MouseEvent): string | null {
	if (target.closest(SKIP_SELECTOR)) return null;
	const hit = caretAt(target.ownerDocument, event.clientX, event.clientY);
	if (!hit || hit.node.nodeType !== 3 /* TEXT_NODE */) return null;
	const container = blockContaining(hit.node);
	if (!container) return null;
	const text = container.textContent ?? "";
	if (!text.includes("http")) return null;
	const offset = offsetWithin(container, hit.node, hit.offset);
	if (offset < 0) return null;
	for (const span of findUrlSpans(text)) {
		if (offset >= span.from && offset <= span.to) return span.url;
	}
	return null;
}
