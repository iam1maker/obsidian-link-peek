import { en, type MessageKey } from "./en";
import { zh } from "./zh";

export type { MessageKey };

type Messages = Record<MessageKey, string>;

let messages: Messages = en;

/**
 * Pick the UI language from Obsidian's language code (`getLanguage()`).
 * Kept free of the `obsidian` import so the pure modules stay testable; the
 * plugin calls it once on load. Traditional Chinese falls back to English.
 */
export function setLocale(language: string): void {
	messages = language === "zh" ? zh : en;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
	const template = messages[key];
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Pick the `.one` or `.other` form for a count. */
export function plural(base: "settings.clear.desc" | "unit.line" | "unit.char" | "unit.day", n: number): string {
	const key = `${base}.${n === 1 ? "one" : "other"}` as MessageKey;
	return t(key, { n });
}
