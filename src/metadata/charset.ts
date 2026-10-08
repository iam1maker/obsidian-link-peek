/**
 * Decode an HTML response body with the charset it actually declares.
 * `requestUrl().text` always decodes as UTF-8, which garbles GBK / Big5 /
 * Shift_JIS pages. Priority follows the HTML spec: BOM, then the
 * `Content-Type` header, then `<meta charset>` / `http-equiv` in the first
 * kilobytes, then UTF-8.
 */

/** The spec says to look at the first 1024 bytes; real pages put it a bit later. */
const SNIFF_BYTES = 4096;

const HEADER_CHARSET_RE = /charset\s*=\s*["']?\s*([^"';\s]+)/i;
const META_CHARSET_RE = /<meta\b[^>]*\bcharset\s*=\s*["']?\s*([^"'\s;>/]+)/i;
const META_HTTP_EQUIV_RE = /<meta\b[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["']([^"']*)["']/i;

export function charsetFromHeader(contentType: string | null | undefined): string | null {
	if (!contentType) return null;
	return HEADER_CHARSET_RE.exec(contentType)?.[1]?.toLowerCase() ?? null;
}

export function charsetFromBom(bytes: Uint8Array): string | null {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
	return null;
}

/** Scan the head as Latin-1: charset declarations are ASCII in every encoding we care about. */
export function charsetFromMeta(bytes: Uint8Array): string | null {
	const head = new TextDecoder("latin1").decode(bytes.subarray(0, SNIFF_BYTES));
	const direct = META_CHARSET_RE.exec(head)?.[1];
	if (direct) return direct.toLowerCase();
	const content = META_HTTP_EQUIV_RE.exec(head)?.[1];
	return content ? charsetFromHeader(content) : null;
}

/** Labels that are not valid for TextDecoder but show up in the wild. */
const LABEL_ALIASES: Record<string, string> = {
	"utf8": "utf-8",
	"gb2312": "gbk",
	"x-gbk": "gbk",
	"cp936": "gbk",
	"ms936": "gbk",
	"big5-hkscs": "big5",
	"shift-jis": "shift_jis",
	"sjis": "shift_jis",
	"euc_kr": "euc-kr",
	"ks_c_5601-1987": "euc-kr",
	"latin1": "iso-8859-1",
	"iso8859-1": "iso-8859-1",
	"windows1252": "windows-1252",
};

export function normalizeLabel(label: string): string {
	const key = label.trim().toLowerCase();
	return LABEL_ALIASES[key] ?? key;
}

function decoderFor(label: string | null): TextDecoder {
	if (label) {
		try {
			return new TextDecoder(normalizeLabel(label));
		} catch {
			// Unknown or unsupported label: fall through to UTF-8.
		}
	}
	return new TextDecoder("utf-8");
}

export function detectCharset(bytes: Uint8Array, contentType: string | null | undefined): string {
	const label = charsetFromBom(bytes) ?? charsetFromHeader(contentType) ?? charsetFromMeta(bytes);
	return label ? normalizeLabel(label) : "utf-8";
}

export function decodeHtml(buffer: ArrayBuffer, contentType: string | null | undefined): string {
	const bytes = new Uint8Array(buffer);
	return decoderFor(detectCharset(bytes, contentType)).decode(bytes);
}
