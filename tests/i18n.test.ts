import { afterEach, describe, expect, it } from "vitest";
import { plural, setLocale, t } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

describe("i18n", () => {
	afterEach(() => setLocale("en"));

	it("fills placeholders and picks plural forms", () => {
		expect(t("error.http", { error: "HTTP 500" })).toBe("The site returned an error (HTTP 500)");
		expect(plural("unit.day", 1)).toBe("1 day");
		expect(plural("unit.day", 7)).toBe("7 days");
	});

	it("switches to Simplified Chinese for zh only", () => {
		setLocale("zh");
		expect(t("menu.copy")).toBe("复制 URL");
		expect(plural("unit.day", 7)).toBe("7 天");
		setLocale("zh-TW");
		expect(t("menu.copy")).toBe("Copy URL");
	});

	it("keeps the same placeholders in every language", () => {
		const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
		for (const key of Object.keys(en) as (keyof typeof en)[]) {
			expect(placeholders(zh[key]), key).toBe(placeholders(en[key]));
		}
	});
});
