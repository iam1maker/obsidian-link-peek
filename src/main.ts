import { Notice, Plugin, debounce } from "obsidian";
import { MetadataCache, type SerializedCache } from "./cache";
import { HoverController } from "./hover/controller";
import { fetchMetadata } from "./metadata/fetch";
import { DEFAULT_SETTINGS, FAILURE_TTL_MS, LinkPeekSettingTab, ttlMsFromDays, type LinkPeekSettings } from "./settings";

interface PersistedData {
	settings?: Partial<LinkPeekSettings>;
	cache?: SerializedCache;
}

export default class LinkPeekPlugin extends Plugin {
	settings: LinkPeekSettings = { ...DEFAULT_SETTINGS };
	cache!: MetadataCache;
	/** Handles for scripted regression checks via `obsidian eval`; not a public API. */
	debug!: { hover: HoverController; fetchMetadata: typeof fetchMetadata };

	/** Hover fetches arrive in bursts; coalesce writes instead of hitting disk per link. */
	private persistCache = debounce(() => void this.saveAll(), 2000, true);

	async onload(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as PersistedData;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };

		this.cache = new MetadataCache({
			ttlMs: ttlMsFromDays(this.settings.cacheTtlDays),
			failureTtlMs: FAILURE_TTL_MS,
			maxEntries: this.settings.maxCacheEntries,
		});
		this.cache.fromJSON(data.cache);

		const hover = new HoverController(this, this.cache, () => this.settings, () => this.persistCache());
		this.debug = { hover, fetchMetadata };

		this.addSettingTab(new LinkPeekSettingTab(this.app, this));

		this.addCommand({
			id: "toggle-hover-previews",
			name: "Toggle hover previews",
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				new Notice(`Link Peek: ${this.settings.enabled ? "on" : "off"}`);
			},
		});

		this.addCommand({
			id: "preview-link-under-cursor",
			name: "Preview link under cursor",
			editorCallback: (editor) => hover.previewAtCursor(editor),
		});

		this.addCommand({
			id: "clear-cache",
			name: "Clear metadata cache",
			callback: async () => {
				this.cache.clear();
				await this.saveSettings();
				new Notice("Link Peek: cache cleared");
			},
		});
	}

	async saveSettings(): Promise<void> {
		this.cache.setOptions({
			ttlMs: ttlMsFromDays(this.settings.cacheTtlDays),
			maxEntries: this.settings.maxCacheEntries,
		});
		await this.saveAll();
	}

	private async saveAll(): Promise<void> {
		const data: PersistedData = { settings: this.settings, cache: this.cache.toJSON() };
		await this.saveData(data);
	}
}
