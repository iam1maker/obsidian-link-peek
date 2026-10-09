import { hostnameOf, resolveUrl } from "./parse";
import type { FileKind, LinkMetadata } from "./types";

/**
 * Links to files rather than pages. Recognised from the URL whenever possible
 * so nothing is downloaded: `requestUrl` cannot stream or abort, and a hover
 * over a 200 MB video should not fetch 200 MB.
 */
const EXTENSIONS: Record<string, FileKind> = {
	pdf: "pdf",
	doc: "document",
	docx: "document",
	odt: "document",
	rtf: "document",
	xls: "spreadsheet",
	xlsx: "spreadsheet",
	ods: "spreadsheet",
	csv: "spreadsheet",
	ppt: "presentation",
	pptx: "presentation",
	odp: "presentation",
	zip: "archive",
	rar: "archive",
	"7z": "archive",
	tar: "archive",
	gz: "archive",
	tgz: "archive",
	bz2: "archive",
	xz: "archive",
	mp4: "video",
	m4v: "video",
	mov: "video",
	webm: "video",
	mkv: "video",
	avi: "video",
	mp3: "audio",
	m4a: "audio",
	wav: "audio",
	flac: "audio",
	ogg: "audio",
	opus: "audio",
	aac: "audio",
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	webp: "image",
	avif: "image",
	svg: "image",
	bmp: "image",
	epub: "ebook",
	mobi: "ebook",
	azw3: "ebook",
	dmg: "installer",
	pkg: "installer",
	exe: "installer",
	msi: "installer",
	apk: "installer",
	deb: "installer",
	rpm: "installer",
	appimage: "installer",
	iso: "installer",
};

/** The file kind a URL points at, judged by its last path segment; null for pages. */
export function fileKindFromUrl(url: string): FileKind | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	// arXiv serves PDFs from extensionless paths.
	if (/(^|\.)arxiv\.org$/i.test(parsed.hostname) && parsed.pathname.startsWith("/pdf/")) return "pdf";
	const last = parsed.pathname.split("/").pop() ?? "";
	const dot = last.lastIndexOf(".");
	if (dot <= 0) return null;
	return EXTENSIONS[last.slice(dot + 1).toLowerCase()] ?? null;
}

/** The file kind for a non-HTML response, for URLs the extension check could not place. */
export function fileKindFromContentType(contentType: string | null): FileKind {
	const type = contentType?.toLowerCase() ?? "";
	if (type === "application/pdf") return "pdf";
	if (type.startsWith("image/")) return "image";
	if (type.startsWith("video/")) return "video";
	if (type.startsWith("audio/")) return "audio";
	if (type.includes("epub")) return "ebook";
	if (/zip|compressed|x-tar|gzip|x-7z|x-rar/.test(type)) return "archive";
	if (/spreadsheet|excel|text\/csv/.test(type)) return "spreadsheet";
	if (/presentation|powerpoint/.test(type)) return "presentation";
	if (/wordprocessing|msword|opendocument\.text|rtf/.test(type)) return "document";
	return "file";
}

/**
 * The file kind of cached metadata. Entries cached before 0.3.2 carry only the
 * content type, so derive it for any non-HTML response.
 */
export function fileKindOf(meta: LinkMetadata): FileKind | null {
	if (meta.fileKind) return meta.fileKind;
	const type = meta.contentType?.toLowerCase();
	if (!type || type.includes("html") || type.includes("xml")) return null;
	return fileKindFromContentType(type);
}

/** Lucide icon per file kind, for the card's file row. */
export const FILE_ICONS: Record<FileKind, string> = {
	pdf: "file-text",
	document: "file-text",
	spreadsheet: "sheet",
	presentation: "presentation",
	archive: "archive",
	video: "film",
	audio: "music",
	image: "image",
	ebook: "book-open",
	installer: "package",
	file: "file",
};

/** Card metadata for a file link: its name as the title, its kind for the label. */
export function fileMetadata(url: string, kind: FileKind, contentType: string | null): LinkMetadata {
	let title: string | null = null;
	try {
		const last = new URL(url).pathname.split("/").filter(Boolean).pop();
		title = last ? decodeURIComponent(last) : null;
	} catch {
		title = null;
	}
	return {
		url,
		title,
		description: null,
		image: kind === "image" ? url : null,
		favicon: resolveUrl("/favicon.ico", url),
		siteName: hostnameOf(url),
		contentType,
		fileKind: kind,
	};
}
