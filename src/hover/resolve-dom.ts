import { App, MarkdownView, WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { urlAtPointer } from "./resolve-editor";

/** Minimal shape of Obsidian's (undocumented) canvas internals that we touch. */
interface CanvasNodeLike {
	nodeEl?: HTMLElement;
	url?: string;
}
interface CanvasLike {
	nodes?: Map<string, CanvasNodeLike>;
}

function isHttpUrl(value: string | null | undefined): value is string {
	return !!value && /^https?:\/\//i.test(value);
}

/** Rendered Markdown (Reading view, Canvas text nodes, hover popovers): the anchor carries the href. */
export function urlFromAnchor(target: Element): string | null {
	const anchor = target.closest<HTMLAnchorElement>("a.external-link, a[href^='http://'], a[href^='https://']");
	if (!anchor) return null;
	const href = anchor.getAttribute("href");
	return isHttpUrl(href) ? href : null;
}

function editorViewForElement(app: App, target: Element): EditorView | null {
	let found: EditorView | null = null;
	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		if (found) return;
		const view = leaf.view;
		if (view instanceof MarkdownView && view.containerEl.contains(target)) {
			// `editor.cm` is the CM6 EditorView; not in the public typings but stable since 1.0.
			found = ((view.editor as unknown as { cm?: EditorView }).cm) ?? null;
		}
	});
	return found;
}

/** Live Preview / Source mode: resolve via document offsets (see resolve-editor.ts). */
export function urlFromEditor(app: App, target: Element, event: MouseEvent): string | null {
	if (!target.closest(".cm-content")) return null;
	const view = editorViewForElement(app, target);
	return view ? urlAtPointer(view, event) : null;
}

/** Canvas link nodes: the DOM is an iframe + header, the URL lives on the node object. */
export function urlFromCanvasNode(app: App, target: Element): string | null {
	const nodeEl = target.closest<HTMLElement>(".canvas-node");
	if (!nodeEl) return null;
	let url: string | null = null;
	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		if (url || leaf.view.getViewType() !== "canvas") return;
		if (!leaf.view.containerEl.contains(nodeEl)) return;
		const canvas = (leaf.view as unknown as { canvas?: CanvasLike }).canvas;
		for (const node of canvas?.nodes?.values() ?? []) {
			if (node.nodeEl === nodeEl && isHttpUrl(node.url)) {
				url = node.url;
				return;
			}
		}
	});
	return url;
}
