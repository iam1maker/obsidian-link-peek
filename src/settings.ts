import { App, Notice, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { plural, t } from "./i18n";
import type LinkPeekPlugin from "./main";

/**
 * Inline titles for bare URLs:
 * - off: no decoration
 * - cached: only links whose metadata is already cached (no extra requests)
 * - fetch: also fetch metadata for links on screen
 */
export type InlineTitlesMode = "off" | "cached" | "fetch";

/** Which key must be held for a hover to open a card. "none" means plain hover. */
export type TriggerModifier = "none" | "Mod" | "Alt" | "Shift";

export interface LinkPeekSettings {
	enabled: boolean;
	/** Delay before a popover opens, so sweeping the mouse across text does not flash cards. */
	hoverDelayMs: number;
	triggerModifier: TriggerModifier;
	/** Restart the hover delay whenever the pointer moves, so only a resting pointer opens a card. */
	requireStillPointer: boolean;
	cacheTtlDays: number;
	maxCacheEntries: number;
	showImages: boolean;
	/** Hostnames (suffix match) that never get a preview, e.g. internal tools or paywalls. */
	excludedDomains: string[];
	/** Also preview Canvas link nodes and links inside Canvas text nodes. */
	enableCanvas: boolean;
	/** Hostnames (suffix match) whose thumbnails are never shown, e.g. image-heavy or NSFW hosts. */
	noImageDomains: string[];
	/** How many lines of description the card shows before clamping. */
	descriptionLines: number;
	/** Compact cards: favicon, site and title only. */
	compactCards: boolean;
	inlineTitles: InlineTitlesMode;
	/** The mode the toggle command restores when turning inline titles back on. */
	inlineLastMode: Exclude<InlineTitlesMode, "off">;
	/** Favicon in front of `[text](url)` links. */
	inlineFavicons: boolean;
	/** Inline titles longer than this are cut with an ellipsis. */
	inlineMaxTitle: number;
}

export const DEFAULT_SETTINGS: LinkPeekSettings = {
	enabled: true,
	hoverDelayMs: 350,
	triggerModifier: "none",
	requireStillPointer: true,
	cacheTtlDays: 7,
	maxCacheEntries: 2000,
	showImages: true,
	excludedDomains: [],
	enableCanvas: true,
	noImageDomains: [],
	descriptionLines: 3,
	compactCards: false,
	inlineTitles: "off",
	inlineLastMode: "cached",
	inlineFavicons: false,
	inlineMaxTitle: 60,
};

export const FAILURE_TTL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CACHE_ENTRIES = 10;

export function ttlMsFromDays(days: number): number {
	return Math.max(1, days) * DAY_MS;
}

export function isExcluded(url: string, excludedDomains: string[]): boolean {
	if (excludedDomains.length === 0) return false;
	let host: string;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	return excludedDomains.some((domain) => {
		const d = domain.trim().toLowerCase();
		return d.length > 0 && (host === d || host.endsWith(`.${d}`));
	});
}

export function parseDomainList(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

type SettingKey = keyof LinkPeekSettings;

/**
 * Declarative settings (Obsidian ≥ 1.13): the definitions double as the
 * search index, so every option is reachable from the settings search box.
 * Values are read from and written to `plugin.settings` through the two
 * overrides below, because our data.json also carries the metadata cache.
 */
export class LinkPeekSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LinkPeekPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{
				name: t("settings.enabled.name"),
				desc: t("settings.enabled.desc"),
				control: { type: "toggle", key: "enabled", defaultValue: DEFAULT_SETTINGS.enabled },
			},
			{
				name: t("settings.delay.name"),
				desc: t("settings.delay.desc"),
				control: {
					type: "slider",
					key: "hoverDelayMs",
					min: 0,
					max: 1500,
					step: 50,
					defaultValue: DEFAULT_SETTINGS.hoverDelayMs,
					displayFormat: (value) => t("unit.ms", { n: value }),
				},
			},
			{
				name: t("settings.trigger.name"),
				desc: t("settings.trigger.desc"),
				aliases: ["modifier", "hold key"],
				control: {
					type: "dropdown",
					key: "triggerModifier",
					defaultValue: DEFAULT_SETTINGS.triggerModifier,
					options: {
						none: t("settings.trigger.none"),
						Mod: t("settings.trigger.mod"),
						Alt: t("settings.trigger.alt"),
						Shift: t("settings.trigger.shift"),
					},
				},
			},
			{
				name: t("settings.still.name"),
				desc: t("settings.still.desc"),
				aliases: ["stillness"],
				control: { type: "toggle", key: "requireStillPointer", defaultValue: DEFAULT_SETTINGS.requireStillPointer },
			},
			{
				type: "group",
				heading: t("settings.heading.card"),
				items: [
					{
						name: t("settings.images.name"),
						desc: t("settings.images.desc"),
						control: { type: "toggle", key: "showImages", defaultValue: DEFAULT_SETTINGS.showImages },
					},
					{
						name: t("settings.noImages.name"),
						desc: t("settings.noImages.desc"),
						aliases: ["no image", "thumbnail blocklist"],
						control: { type: "textarea", key: "noImageDomains", placeholder: "example.com", rows: 3 },
					},
					{
						name: t("settings.descLines.name"),
						desc: t("settings.descLines.desc"),
						control: {
							type: "slider",
							key: "descriptionLines",
							min: 1,
							max: 6,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.descriptionLines,
							displayFormat: (value) => plural("unit.line", value),
						},
					},
					{
						name: t("settings.compact.name"),
						desc: t("settings.compact.desc"),
						control: { type: "toggle", key: "compactCards", defaultValue: DEFAULT_SETTINGS.compactCards },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.heading.inline"),
				items: [
					{
						name: t("settings.inline.name"),
						desc: t("settings.inline.desc"),
						aliases: ["chip", "decorate", "rich link"],
						control: {
							type: "dropdown",
							key: "inlineTitles",
							defaultValue: DEFAULT_SETTINGS.inlineTitles,
							options: {
								off: t("settings.inline.off"),
								cached: t("settings.inline.cached"),
								fetch: t("settings.inline.fetch"),
							},
						},
					},
					{
						name: t("settings.favicons.name"),
						desc: t("settings.favicons.desc"),
						control: { type: "toggle", key: "inlineFavicons", defaultValue: DEFAULT_SETTINGS.inlineFavicons },
					},
					{
						name: t("settings.maxTitle.name"),
						desc: t("settings.maxTitle.desc"),
						control: {
							type: "slider",
							key: "inlineMaxTitle",
							min: 20,
							max: 120,
							step: 5,
							defaultValue: DEFAULT_SETTINGS.inlineMaxTitle,
							displayFormat: (value) => plural("unit.char", value),
						},
					},
				],
			},
			{
				name: t("settings.canvas.name"),
				desc: t("settings.canvas.desc"),
				control: { type: "toggle", key: "enableCanvas", defaultValue: DEFAULT_SETTINGS.enableCanvas },
			},
			{
				name: t("settings.excluded.name"),
				desc: t("settings.excluded.desc"),
				aliases: ["blocklist", "ignore sites"],
				control: { type: "textarea", key: "excludedDomains", placeholder: "example.com\nintranet.local", rows: 4 },
			},
			{
				type: "group",
				heading: t("settings.heading.cache"),
				items: [
					{
						name: t("settings.ttl.name"),
						desc: t("settings.ttl.desc"),
						control: {
							type: "slider",
							key: "cacheTtlDays",
							min: 1,
							max: 90,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.cacheTtlDays,
							displayFormat: (value) => plural("unit.day", value),
						},
					},
					{
						name: t("settings.maxCache.name"),
						desc: t("settings.maxCache.desc"),
						control: {
							type: "number",
							key: "maxCacheEntries",
							min: MIN_CACHE_ENTRIES,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.maxCacheEntries,
							validate: (value) =>
								Number.isInteger(value) && value >= MIN_CACHE_ENTRIES ? undefined : t("settings.maxCache.invalid", { n: MIN_CACHE_ENTRIES }),
						},
					},
					{
						name: t("settings.clear.name"),
						desc: plural("settings.clear.desc", this.plugin.cache.size),
						action: () => {
							this.plugin.service.clear();
							void this.plugin.saveSettings();
							new Notice(t("notice.cacheCleared"));
							this.update();
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		const value = this.plugin.settings[key as SettingKey];
		return (key === "excludedDomains" || key === "noImageDomains") && Array.isArray(value) ? value.join("\n") : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		if (key === "excludedDomains" || key === "noImageDomains") {
			settings[key] = parseDomainList(typeof value === "string" ? value : "");
		} else if (key === "maxCacheEntries") {
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed < MIN_CACHE_ENTRIES) return;
			settings[key] = parsed;
		} else {
			settings[key] = value;
			if (key === "inlineTitles" && value !== "off") settings.inlineLastMode = value;
		}
		await this.plugin.saveSettings();
	}
}
