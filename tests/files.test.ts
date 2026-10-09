import { describe, expect, it } from "vitest";
import { fileKindFromContentType, fileKindFromUrl, fileKindOf, fileMetadata } from "../src/metadata/files";
import type { LinkMetadata } from "../src/metadata/types";

describe("fileKindFromUrl", () => {
	it("recognises files by extension, ignoring case, query and hash", () => {
		expect(fileKindFromUrl("https://example.com/docs/Report.PDF")).toBe("pdf");
		expect(fileKindFromUrl("https://example.com/a.zip?download=1")).toBe("archive");
		expect(fileKindFromUrl("https://cdn.example.com/clip.mp4#t=10")).toBe("video");
		expect(fileKindFromUrl("https://example.com/sheet.xlsx")).toBe("spreadsheet");
		expect(fileKindFromUrl("https://example.com/photo.jpeg")).toBe("image");
	});

	it("knows arXiv's extensionless PDF paths", () => {
		expect(fileKindFromUrl("https://arxiv.org/pdf/2301.00001")).toBe("pdf");
		expect(fileKindFromUrl("https://arxiv.org/abs/2301.00001")).toBeNull();
	});

	it("leaves pages alone", () => {
		expect(fileKindFromUrl("https://example.com/")).toBeNull();
		expect(fileKindFromUrl("https://example.com/post.html")).toBeNull();
		expect(fileKindFromUrl("https://en.wikipedia.org/wiki/Obsidian_(software)")).toBeNull();
		expect(fileKindFromUrl("https://example.com/.well-known")).toBeNull();
		expect(fileKindFromUrl("https://github.com/obsidianmd/obsidian-api/blob/master/README.md")).toBeNull();
		expect(fileKindFromUrl("not a url")).toBeNull();
	});
});

describe("fileKindFromContentType", () => {
	it("maps common types and falls back to a plain file", () => {
		expect(fileKindFromContentType("application/pdf")).toBe("pdf");
		expect(fileKindFromContentType("image/png")).toBe("image");
		expect(fileKindFromContentType("application/zip")).toBe("archive");
		expect(fileKindFromContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("spreadsheet");
		expect(fileKindFromContentType("application/json")).toBe("file");
		expect(fileKindFromContentType(null)).toBe("file");
	});
});

describe("fileMetadata", () => {
	it("uses the file name as title and previews images inline", () => {
		const pdf = fileMetadata("https://example.com/docs/Report%202024.pdf", "pdf", null);
		expect(pdf.title).toBe("Report 2024.pdf");
		expect(pdf.image).toBeNull();
		expect(pdf.description).toBeNull();
		expect(pdf.fileKind).toBe("pdf");
		const img = fileMetadata("https://example.com/a.png", "image", null);
		expect(img.image).toBe("https://example.com/a.png");
	});
});

describe("fileKindOf", () => {
	const meta = (contentType: string | null): LinkMetadata => ({
		url: "https://example.com/x",
		title: "x",
		description: null,
		image: null,
		favicon: null,
		siteName: null,
		contentType,
	});

	it("derives the kind for entries cached before fileKind existed", () => {
		expect(fileKindOf(meta("application/pdf"))).toBe("pdf");
		expect(fileKindOf(meta("text/html"))).toBeNull();
		expect(fileKindOf(meta(null))).toBeNull();
		expect(fileKindOf({ ...meta(null), fileKind: "video" })).toBe("video");
	});
});
