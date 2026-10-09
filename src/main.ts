import { Notice, Plugin, debounce, getLanguage } from "obsidian";
import { MetadataCache, type SerializedCache } from "./cache";
import { HoverController } from "./hover/controller";
import { setLocale, t } from "./i18n";
import { optedOut } from "./inline/classify";
import type { InlineContext } from "./inline/context";
import { inlineEditorExtension } from "./inline/live-preview";
import { Prefetcher } from "./inline/prefetch";
import { registerReadingView } from "./inline/reading-view";
import { fetchMetadata } from "./metadata/fetch";
import { MetadataService } from "./metadata/service";
import { DEFAULT_SETTINGS, FAILURE_TTL_MS, LinkPeekSettingTab, ttlMsFromDays, type LinkPeekSettings } from "./settings";

interface PersistedData {
	settings?: Partial<LinkPeekSettings>;
	cache?: SerializedCache;
}

/** Per-note switch in properties: `link-peek: off`. */
const OPT_OUT_PROPERTY = "link-peek";

export default class LinkPeekPlugin extends Plugin {
	settings: LinkPeekSettings = { ...DEFAULT_SETTINGS };
	cache!: MetadataCache;
	service!: MetadataService;
	/** Handles for scripted regression checks via `obsidian eval`; not a public API. */
	debug!: { hover: HoverController; fetchMetadata: typeof fetchMetadata; service: MetadataService; prefetch: Prefetcher };

	private prefetch!: Prefetcher;
	/** Listeners for changes that are not cache changes (settings, per-note switch). */
	private refreshListeners = new Set<() => void>();
	/** Last known per-note switch per path, so frontmatter edits only refresh when it flips. */
	private optOutByPath = new Map<string, boolean>();

	/** Hover fetches arrive in bursts; coalesce writes instead of hitting disk per link. */
	private persistCache = debounce(() => void this.saveAll(), 2000, true);

	async onload(): Promise<void> {
		setLocale(getLanguage());
		const data = ((await this.loadData()) ?? {}) as PersistedData;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };

		this.cache = new MetadataCache({
			ttlMs: ttlMsFromDays(this.settings.cacheTtlDays),
			failureTtlMs: FAILURE_TTL_MS,
			maxEntries: this.settings.maxCacheEntries,
		});
		this.cache.fromJSON(data.cache);
		this.service = new MetadataService(this.cache, fetchMetadata);
		this.register(this.service.onChange(() => this.persistCache()));

		const hover = new HoverController(this, this.service, () => this.settings);

		this.prefetch = new Prefetcher({
			lookup: (url) => this.service.lookup(url),
			known: (url) => this.service.get(url) !== null,
		});
		this.register(() => this.prefetch.clear());

		const inline: InlineContext = {
			settings: () => this.settings,
			service: this.service,
			prefetch: this.prefetch,
			optedOut: (path) => this.isOptedOut(path),
			onRefresh: (listener) => {
				const off = this.service.onChange(listener);
				this.refreshListeners.add(listener);
				return () => {
					off();
					this.refreshListeners.delete(listener);
				};
			},
			peek: (url, el) => hover.previewElement(url, el),
		};
		this.registerEditorExtension(inlineEditorExtension(inline));
		registerReadingView(this, inline);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, _data, cache) => {
				const off = optedOut(cache.frontmatter?.[OPT_OUT_PROPERTY]);
				if ((this.optOutByPath.get(file.path) ?? false) === off) return;
				this.optOutByPath.set(file.path, off);
				this.notifyRefresh();
			}),
		);

		this.debug = { hover, fetchMetadata, service: this.service, prefetch: this.prefetch };

		this.addSettingTab(new LinkPeekSettingTab(this.app, this));

		this.addCommand({
			id: "toggle-hover-previews",
			name: t("command.toggleHover"),
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				new Notice(t(this.settings.enabled ? "notice.hoverOn" : "notice.hoverOff"));
			},
		});

		this.addCommand({
			id: "toggle-inline-titles",
			name: t("command.toggleInline"),
			callback: async () => {
				const { inlineTitles, inlineLastMode } = this.settings;
				this.settings.inlineTitles = inlineTitles === "off" ? inlineLastMode : "off";
				if (inlineTitles !== "off") this.settings.inlineLastMode = inlineTitles;
				await this.saveSettings();
				new Notice(t(this.settings.inlineTitles === "off" ? "notice.inlineOff" : "notice.inlineOn"));
			},
		});

		this.addCommand({
			id: "preview-link-under-cursor",
			name: t("command.previewAtCursor"),
			editorCallback: (editor) => hover.previewAtCursor(editor),
		});

		this.addCommand({
			id: "clear-cache",
			name: t("command.clearCache"),
			callback: async () => {
				this.service.clear();
				await this.saveSettings();
				new Notice(t("notice.cacheCleared"));
			},
		});
	}

	async saveSettings(): Promise<void> {
		this.cache.setOptions({
			ttlMs: ttlMsFromDays(this.settings.cacheTtlDays),
			maxEntries: this.settings.maxCacheEntries,
		});
		if (this.settings.inlineTitles !== "fetch") this.prefetch.clear();
		this.notifyRefresh();
		await this.saveAll();
	}

	private isOptedOut(path: string | null): boolean {
		if (!path) return false;
		const file = this.app.vault.getFileByPath(path);
		if (!file) return false;
		return optedOut(this.app.metadataCache.getFileCache(file)?.frontmatter?.[OPT_OUT_PROPERTY]);
	}

	private notifyRefresh(): void {
		for (const listener of [...this.refreshListeners]) listener();
	}

	private async saveAll(): Promise<void> {
		const data: PersistedData = { settings: this.settings, cache: this.cache.toJSON() };
		await this.saveData(data);
	}
}
