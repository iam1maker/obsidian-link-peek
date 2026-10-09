# Link Peek roadmap

Last reviewed: 2026-10-08 (0.3.1 review fixes). Status markers: `[ ]` planned, `[~]` in progress, `[x]` shipped.

## Positioning

Link Peek is the lightweight half of the link-preview space: a metadata card, rendered from
the page's own `<head>`, fetched through `requestUrl`, cached locally, never written into notes.
That is the gap left by the two camps that already exist in the Obsidian community:

| Camp | Plugins (downloads, 2026-10) | What they do | Why we are not that |
|---|---|---|---|
| Persisted cards | Link Embed (109k), Auto Card Link (80k, unmaintained; Enhanced fork 3.3k), Rich Links (32k), Cards4Links (1.3k) | Write a card block into the note; most depend on microlink / iframely / jsonlink | Third-party services, destructive edits |
| Live page hover | Hoverlay (1.1k), URL Preview (2.1k), Link Preview (7k, iframe, reading view only) | Electron webview or iframe of the real page | Heavy, desktop-only, already well served |
| Inline decoration | URL Enricher (1.5k) | Live Preview only; URL shown as favicon + title, raw URL revealed under the cursor | Closest neighbour; no reading view, no hover |

The money is in persisted cards (~220k downloads) and the hover camp is small (~18k). The plan
is therefore: finish the hover experience (0.2), then add the second half of the original
[logseq-plugin-link-preview](https://github.com/pengx17/logseq-plugin-link-preview), the
"link card", in a non-destructive Obsidian-native form (0.3).

Principles that every item below must respect:

1. No third-party preview service; one GET to the link's own host.
2. Never modify a note unless the user runs an explicit command.
3. One code path for Reading view, Live Preview, Source mode, Canvas and pop-out windows.
4. Theme variables only; no hard-coded colours.

## 0.2 — polish the hover

Each item maps to a complaint seen in competitor issue trackers (Logseq original, Link Preview,
Hoverlay) or a gap found in our own code.

- [x] **Trigger control.** (2026-10-05, 0.2.0) Logseq #123: "preview appears too quickly and covers content".
  Add an optional modifier key (Mod / Alt / Shift, matching the core Page Preview habit) and a
  stillness rule: the hover delay restarts whenever the pointer moves more than a few pixels, so
  sweeping across text never opens cards. Also re-resolve the URL on pointer movement so moving
  between two links on the same editor line switches the card (today `mouseover` only fires once
  per `.cm-line`).
- [x] **Pin and keyboard command.** (2026-10-05, 0.2.0) Link Preview #9, Hoverlay. A pin button keeps the card open
  so text can be selected and links clicked; a `Preview link under cursor` command opens the card
  without a mouse. The command is also the only viable entry point on mobile, where the plugin
  currently loads (`isDesktopOnly: false`) but can never fire.
- [x] **Pop-out windows.** (2026-10-05, 0.2.0) The controller listens on the main `document` and the card is a child
  of the main `document.body`. Notes dragged into their own window get no previews. Attach per
  window via `workspace.on("window-open")` and create the popover in that window's document.
- [x] **Coverage audit.** (2026-10-05, 0.2.0; Properties and Bases render URLs as `.external-link[data-href]` divs, search/backlinks as plain text; both handled. Nested popovers fixed by re-appending the card to `<body>` on show.) Links in Properties (Hoverlay #1), Bases cards, search results,
  backlinks pane, footnotes, nested Page Preview popovers. The anchor path probably covers most;
  verify each and fix what does not.
- [x] **Charset handling.** (2026-10-05, 0.2.0) `requestUrl().text` decodes as UTF-8 only; GBK / Big5 pages garble.
  Read `arrayBuffer`, sniff the charset from `Content-Type` then `<meta charset>` /
  `http-equiv`, decode with `TextDecoder`.
- [x] **Site compatibility.** (2026-10-05, 0.2.0; generic oEmbed fill-in plus Wikipedia REST summary and Reddit oEmbed resolvers. Zhihu returns 403 to everything non-browser and is reported as blocked. Also raised the head scan limit: YouTube puts its `<title>` after 700 KB.) Reddit, X, LinkedIn, Zhihu, WeChat articles, Bilibili return bot
  pages or carry no OG tags. First a generic oEmbed discovery step
  (`<link rel="alternate" type="application/json+oembed">`), then a small table of per-host
  overrides for the sites that still fail. Keep the table short; Auto Card Link Enhanced's 60
  extractors is the maintenance trap to avoid.
- [x] **Error states.** (2026-10-05, 0.2.0) Distinguish "blocked by the site" (403 / 429 / challenge page) from
  timeout and network failure; show different copy and offer *Open in browser* and *Retry* in
  the card.
- [x] **Card options.** (2026-10-05, 0.2.0) Max description lines, image on / off per host, optional compact layout
  (title + favicon only). Only after the items above.

All 0.2 items were implemented and verified in-app on 2026-10-05 and released as 0.2.0.

Regression fixtures in the ob-mxl vault: `inbox/Link Peek 测试.canvas` (Canvas paths) and
`inbox/Link Peek 测试.base` (Bases table and cards). Scripted checks drive the plugin through
`app.plugins.plugins["link-peek"].debug` from `obsidian eval`.

## 0.3 — the second half: link cards

Two candidate shapes. A first, B only if there is real demand.

**A. Inline decoration (non-destructive, preferred).** Released as 0.3.0 on 2026-10-06; design and prior-art notes in [docs/inline-decoration.md](docs/inline-decoration.md). A CodeMirror 6 `ViewPlugin` renders bare
URLs and `[text](url)` links as favicon + title, restores the raw text while the cursor is inside,
and a Reading-view post-processor does the same for rendered output. Reuses the existing cache
and parser; writes nothing. Differentiator: URL Enricher stops at Live Preview and has no hover.

**B. Explicit "Convert to link card" command.** The Logseq original's macro mode. Writes a code
block that is format-compatible with Auto Card Link's `cardlink` block so existing notes from
that (unmaintained) plugin render with Link Peek. Paste-to-card stays off by default.

## 0.3.2 — housekeeping before 0.4

Decided 2026-10-09.

- [x] **Desktop only.** Mobile was never tested; `isDesktopOnly` is now true. Revisit only with
  a real device to test on.
- [x] **File links.** URLs that point at files (PDF, archives, video, Office documents...) are
  recognised by extension and never downloaded; the card shows the file name and kind.
  Extensionless files are still fetched once and then cached as files.
- [x] **Chinese UI.** All UI text goes through `src/i18n`; Simplified Chinese follows
  Obsidian's language setting.
- [x] **End-to-end tests.** See Engineering debt.

## 0.4 — block cards for standalone links (scheduled after 0.3.2)

Decided 2026-10-06; scheduled 2026-10-09, to start once 0.3.2 is out.

**What.** A URL alone on its own line (nothing else on the line, outside code) renders as a full
card in Live Preview, Reading view and Canvas text cards: image, title, description, site, the
same look as the hover card. A URL inside a sentence keeps the 0.3 inline title. Close to
Notion's bookmark block. The note still contains only the URL; uninstalling leaves nothing behind.

**Why this shape and not a card written into the note.** "Never modifies your notes" is the
main difference from Link Embed (109k downloads, third-party services, writes HTML) and Auto
Card Link (80k, unmaintained, writes a `cardlink` block). Writing cards would join a crowded
field and break that promise. No plugin today shows non-destructive block cards across Live
Preview, Reading view and Canvas; URL Enricher's card style is Live Preview only.

**Reuse.** Cache, fetch pipeline, the Off / cached / fetch modes, the per-note
`link-peek: off` switch, click and right-click behaviour, card styles from the hover popover.

**Known work.**
- Block decorations cannot come from a `ViewPlugin` in CodeMirror; Live Preview needs a
  `StateField` that recomputes on doc changes and on the cache-change signal.
- Layout shift when a card appears or its image loads. Default to cached-only, give cards a
  fixed height, reserve the image box before it loads.
- Caret on the line reveals the raw URL, same rule as the inline titles.
- Settings: a toggle ("Show standalone links as cards"), image on/off reusing the existing
  per-domain thumbnail list, compact variant reusing the compact-card setting.

**Idea for later, separate from 0.4.** Render existing Auto Card Link `cardlink` code blocks
read-only, so its users can switch without rewriting notes. Both plugins would register the
same code-block language; Link Peek must stand down when Auto Card Link is enabled.

## Non-goals

- Live page previews via webview or iframe. Hoverlay and URL Preview own that niche.
- Saving thumbnails or favicons into the vault.
- Any remote cache, telemetry or preview API.

## Engineering debt

- Canvas link-node resolution relies on the undocumented `canvas.nodes`; verify in a real Canvas
  on each Obsidian minor release.
- [x] End-to-end regression suite (2026-10-09): `npm run e2e` runs nine scenarios in a live
  Obsidian (chips, caret reveal, Source mode, Reading view, per-note opt-out, toggle, hover
  card, file links, pop-out). Extend it with every new surface, starting with 0.4.
- [x] Community directory review findings from the 0.3.0 review, fixed together in 0.3.1
  (2026-10-08): needless regex escape, `unknown | null` return types, the deprecated
  `caretRangeFromPoint` fallback, `document.createElement` in the inline widgets (now created
  through the owning window's `createSpan`, checked in a pop-out), the `text-decoration-line`
  CSS lint (now the single-value `text-decoration` shorthand), and the clipboard note in the
  README. Before a release, run the `eslint-plugin-obsidianmd` recommended config locally; the
  remaining `ui/sentence-case` hits are false positives (the product name "Link Peek").
- `requestUrl` cannot stream or abort; large non-HTML responses are downloaded in full before
  the content-type check. Acceptable for now; revisit if PDF links become common.

## Sources

Competitor data gathered 2026-10-04 from the community directory, each plugin's README and
issue tracker, and `obsidianmd/obsidian-releases/community-plugin-stats.json`.
