import { describe, expect, it } from "vitest";
import { charsetFromMeta, decodeHtml, detectCharset, normalizeLabel } from "../src/metadata/charset";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("detectCharset", () => {
	it("prefers the BOM, then the header, then <meta>", () => {
		const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('<meta charset="gbk">')]);
		expect(detectCharset(bom, "text/html; charset=big5")).toBe("utf-8");
		expect(detectCharset(bytes('<meta charset="gbk">'), "text/html; charset=big5")).toBe("big5");
		expect(detectCharset(bytes('<html><head><meta charset="GBK"></head>'), "text/html")).toBe("gbk");
		expect(detectCharset(bytes("<html><head><title>x</title></head>"), null)).toBe("utf-8");
	});

	it("reads the http-equiv form and normalises legacy labels", () => {
		const html = '<meta http-equiv="Content-Type" content="text/html; charset=gb2312">';
		expect(charsetFromMeta(bytes(html))).toBe("gb2312");
		expect(detectCharset(bytes(html), null)).toBe("gbk");
		expect(normalizeLabel("Shift-JIS")).toBe("shift_jis");
		expect(normalizeLabel("UTF8")).toBe("utf-8");
	});
});

describe("decodeHtml", () => {
	it("decodes a GBK page declared only in <meta>", () => {
		// "中文" in GBK is D6 D0 CE C4.
		const gbk = new Uint8Array([...bytes('<meta charset="gb2312"><title>'), 0xd6, 0xd0, 0xce, 0xc4, ...bytes("</title>")]);
		expect(decodeHtml(gbk.buffer, "text/html")).toContain("<title>中文</title>");
	});

	it("falls back to UTF-8 for unknown labels", () => {
		const html = bytes('<meta charset="x-nonsense"><title>日本語</title>');
		expect(decodeHtml(html.buffer, null)).toContain("日本語");
	});

	it("honours the header charset over the bytes' UTF-8 look", () => {
		const text = "<title>café</title>";
		const latin1 = Uint8Array.from(text, (c) => c.charCodeAt(0));
		expect(decodeHtml(latin1.buffer, "text/html; charset=iso-8859-1")).toContain("café");
	});
});
