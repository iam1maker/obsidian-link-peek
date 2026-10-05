# 0.3 design: inline link decoration

Status: released in 0.3.0 (2026-10-06). Companion to [ROADMAP.md](../ROADMAP.md) (0.3, option A).
Code: `src/inline/`. Notes on where the implementation differs from the draft are marked *Implemented:*.

## What it does

A bare URL in a note

```
https://github.com/iam1maker/obsidian-link-peek
```

renders in Live Preview and Reading view as a chip: favicon, then the page title
(`GitHub - iam1maker/obsidian-link-peek: Obsidian plugin: hover any external link…`),
clamped to a configurable length. The Markdown source is untouched. Put the cursor on it
and the raw URL comes back, exactly like Obsidian reveals its own formatting. Hovering the
chip opens the normal Link Peek card.

`[text](url)` links keep their text: the author chose it. They can optionally get a small
favicon in front of the text (second toggle, same infrastructure).

Everything is rendering. Disable the plugin and the note is what it was.

## Why this shape

- The persisted-card plugins (Link Embed, Auto Card Link) rewrite notes and depend on
  third-party services. The only non-destructive inline plugin, URL Enricher, stops at Live
  Preview and has no hover. Covering Live Preview, Reading view, Canvas text cards and the
  hover card from one cache is the gap.
- Reusing the metadata cache means a URL hovered once is titled everywhere, and a title
  seen inline can be expanded to the full card by hovering.

## Prior art, read on 2026-10-05

Two community plugins do inline decoration today. Both were read in full (editor extension,
widgets, post-processor, settings, issue tracker).

**URL Enricher** (mattmarotta/obsidian-url-enricher, 4.7k lines). Live Preview only. One
`ViewPlugin` at `Prec.highest` providing decorations synchronously; a replace widget per bare
URL and per `[text](url)` (inline style) or a block widget above the URL (card style).

- Worth copying: decorations are built synchronously from a cache and a fetch is queued for
  anything missing; when a fetch lands, a `setTimeout(0)` coalesces one refresh effect per
  batch instead of dispatching from inside a promise (which throws mid-update). Per-note
  frontmatter overrides (`preview-style`, `show-favicon`, ...). Widget `eq()` compares every
  displayed field so unchanged chips keep their DOM.
- Not copying: it calls `doc.toString()` and runs three regex passes over the whole document
  on every selection change (O(document) per keystroke). It fetches metadata for every visible
  URL automatically with no opt-in, resolves favicons through Google's service, and keeps the
  metadata cache in memory only (refetched every session). Its cursor rule looks only at
  `selection.main.head`, so a second cursor or a selection does not reveal the raw text. For
  `[text](url)` it replaces the author's text with the fetched title. Its widget swallows
  `mousedown` and `click`, so the only way to put the caret inside a URL is the keyboard.
  Reddit data is smuggled through the description string with `§REDDIT_CARD§` markers.

**Link Favicon** (joethei/obsidian-link-favicon, 1.7k lines, 67k downloads). Favicons only,
Live Preview, Source and Reading view; providers are remote services (Google, DuckDuckGo,
icon.horse, ...).

- Worth copying: finds links through `syntaxTree(state).iterate` over `view.visibleRanges`,
  taking nodes whose name contains `url` and deciding bare vs `[text](url)` by the character
  before the node. Registered at `Prec.lowest`; icon widgets at a position never fight
  Obsidian's own replace decorations. Marks processed anchors in Reading view with a data
  attribute so a re-run does not double-decorate, and delays the post-processor 50 ms so
  Dataview and friends have finished. Calls `app.workspace.updateOptions()` after a settings
  change, the official way to reconfigure every editor (including Canvas cards), rather than
  dispatching to Markdown leaves only.
- Not copying: decorations live in a `StateField` fed asynchronously by a debounced dispatch;
  the issue tracker is full of "icons don't load in Live Preview" (#47, #55, #68) and lag
  (#83) reports that follow from that shape. The per-link opt-out is a `|nofavicon` suffix
  inside the URL text. The widget cache is keyed by URL and never invalidated, and `eq()` is
  identity, so every rebuild recreates DOM.
- Its bug list is our test list: Chinese IME inserting spaces (#70), spaces deleted in tables
  (#71), a bare link in parentheses breaking a list (#69), Canvas (#84), Bases (#85),
  Reading view (#76), clash with Minimal theme's external-link icon (#78).

What neither does and we can: titles from a cache the hover feature already fills, zero
network by default, the same chip in Live Preview, Reading view, Canvas cards and pop-outs,
hover on the chip for the full card, and a persisted metadata cache.

## Decisions to confirm

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Default state of inline titles | **Off** in 0.3.0 | Existing users' notes should not change appearance on update. Announce it; consider "cached only" as the default in 0.4 once it has been seen in the wild. |
| 2 | Where titles come from | Three modes: **Off / Cached only / Fetch automatically** | "Cached only" keeps the README promise (one request per hovered link, nothing else). "Fetch automatically" prefetches visible URLs; it is a privacy change and must be opt-in and documented. |
| 3 | Favicons on `[text](url)` links | In scope, separate toggle, **off** by default | Cheap once the widget exists. Link Favicon (67k downloads) shows there is demand; it is also the thing most likely to clash with themes, hence off. |
| 4 | Reading view | In scope | Without it the feature is editor-only and a note looks different in the two modes. |

## Mechanics

### Live Preview (CodeMirror 6)

- One `ViewPlugin` registered through `registerEditorExtension`, so it applies to every
  editor: notes, Canvas text cards, embedded editors, pop-outs.
- Active only when `state.field(editorLivePreviewField)` is true. Source mode shows raw text.
- Decorations are provided synchronously by the plugin (`decorations: v => v.decorations`),
  built from the cache only. Each update (`docChanged`, `viewportChanged`, `selectionSet`,
  or a refresh effect) rebuilds for `view.visibleRanges` only, with a `RangeSetBuilder`.
  Cache changes become one refresh effect per batch through a `setTimeout(0)` coalescer,
  never a dispatch from inside a promise callback.
- No rebuild while `view.composing` is true, and ranges touching the composition are left
  undecorated: replace widgets next to an IME composition are what produced Link Favicon's
  "Chinese input inserts spaces" bug. Chinese IME is part of the in-app checks.
- URL discovery walks the syntax tree (`syntaxTree(state).iterate` over the visible ranges)
  and takes `url` tokens, skipping anything inside code (inline code, fenced blocks),
  frontmatter, comments and HTML.
  *Implemented:* no regex fallback. Obsidian's tokens are the source of truth, because a
  regex finds URLs Obsidian does not treat as links (a URL glued to CJK text, `参见https://…`,
  is plain text in Live Preview). Node names are token classes joined by `_`, dumped from
  Obsidian 1.13: `url`, `list-1_url`, `quote_quote-1_url` (bare);
  `formatting_formatting-link_link_url` (autolink); `string_url` (link or image target);
  `formatting_formatting-link-string_string_url` (the `(` `)` around a target, not a URL);
  `comment_url`, `inline-code`, `hmd-codeblock` (skipped). Rules and tests in
  `src/inline/classify.ts` and `tests/inline.test.ts`.
- Bare URL and `<autolink>`: `Decoration.replace({ widget })` over the whole token,
  `inclusive: false`. `[text](url)`: `Decoration.widget({ widget: favicon, side: -1 })`
  before the opening bracket, only when the favicon toggle is on.
- Cursor awareness: a range touched by any selection range is not decorated. Mirrors
  Obsidian's own reveal rule, keeps typing inside or next to a URL painless.
- Widget `eq()` compares url + label + favicon, so unchanged chips keep their DOM across
  rebuilds.
- Click model, matching Obsidian's own Live Preview links: plain click opens the URL;
  Alt/Option-click places the caret at the URL start so it reveals for editing (URL
  Enricher's keyboard-only editing is the usability hole to avoid); right-click opens an
  Obsidian `Menu` with *Open link*, *Copy URL*, *Edit URL*. The hover controller sees the
  chip through a `data-href` attribute (extend `urlFromAnchor`'s selector to
  `.lpk-chip[data-href]`).
- Precedence: default for the bare-URL replace (Obsidian does not replace bare URLs);
  `Prec.lowest` for the favicon widget on `[text](url)`, Link Favicon's proven setting.
- Per-note opt-out through frontmatter (`link-peek: off`), read from the editor's file via
  `editorInfoField` and `metadataCache`. No in-URL markers.
- Settings changes call `app.workspace.updateOptions()` so every editor, Canvas cards
  included, reconfigures; no per-leaf dispatch.

### Reading view

- A Markdown post-processor finds `a.external-link:not([data-lpk])` whose text equals its
  href (an autolinked bare URL) and swaps the text for the chip, keeping the `<a>` so clicks,
  context menu and the existing anchor hover path work unchanged, and marks it `data-lpk`.
  `[text](url)` anchors get the favicon prefix only.
  *Implemented:* runs synchronously, no delay; anchors other post-processors add later are
  simply not decorated. Obsidian's own parsers disagree on one case: Reading view links a
  URL glued to CJK text (and swallows the following characters into it), Live Preview does
  not. Each mode follows its own parser.
- Each decorated anchor is wrapped in a `MarkdownRenderChild` that subscribes to cache
  changes and updates its label when a title arrives, and unsubscribes on unload.

### Metadata and the cache

- The cache gains a change event (`onChange(listener)`), fired from `set`, `delete` and
  `clear`. The editor plugin turns it into a `StateEffect` dispatch; reading-view children
  update their own element.
- Label rule, in one pure function: cached title (clamped to *Max title length*, default
  60, ellipsis) > `displayUrl(url)`. Favicon from cache; none when the URL is uncached in
  "Cached only" mode, so the mode truly makes zero requests.
- "Fetch automatically": a prefetch queue takes visible uncached URLs after the viewport
  has been still for ~500 ms, two at a time, through the same `fetchMetadata`, honouring
  *Excluded domains* and the one-hour failure cache. Results persist via the existing
  debounced `saveData`.

### Settings, command, styles

- Group **Inline links**: *Inline link titles* (Off / Cached only / Fetch automatically),
  *Favicons on text links* (toggle), *Max title length* (slider 20–120).
- Command **Toggle inline link titles** (Off ↔ last non-off mode).
- `.lpk-chip`: plain inline (not `inline-flex`, so a long title wraps like text), 1em
  favicon, title clamped by characters in code, colour and underline from the theme's
  `--link-external-*` variables, no line-height change. In Reading view the anchor keeps its
  class, so the theme's external-link icon still follows the title.

## Non-goals

- Writing anything into the note; no paste-to-card. (ROADMAP option B stays separate.)
- Decorating internal links, embeds or tags.
- Rich embeds (players, images) inline. The hover card is where richness lives.

## Risks and how they are handled

- **Obsidian's own URL handling in Live Preview.** Replacing the token hides Obsidian's
  `cm-url` styling and click target; the widget must reproduce click-to-open and the
  context menu (right-click → copy URL). Test both before shipping.
- **Live Preview tables and callouts.** Table cells are separate editor instances since
  1.5; the extension should apply through `registerEditorExtension`, verify it does. Link
  Favicon deleted spaces in table cells (#71) and broke a list when a bare link sat in
  parentheses (#69); both go into the regression note.
- **IME.** See the composition rule above; test with Chinese input in a line that already
  has a chip before and after the caret.
- **Theme clashes.** Chips inherit link colour and font; favicons are the only new visual
  element. Keep a `lpk-chip` class and document it for snippets.
- **Performance on long notes.** Visible ranges only, widget reuse by `eq()`, no work in
  Source mode. Measure with a 5,000-line note of URLs before release.
- **Privacy.** Default mode makes no requests. The prefetch mode is opt-in and the README
  gets a paragraph about it next to the existing network section.

## Work breakdown

1. Cache change events; label and favicon rule as pure functions with tests
   (`src/inline/label.ts`).
2. Live Preview plugin, widget, selection rule, Live Preview-only gate
   (`src/inline/live-preview.ts`). In-app check: decoration count, raw reveal on cursor
   entry, click opens, hover opens the card, Canvas text card decorated, Source mode clean.
3. Reading view post-processor with live-updating children (`src/inline/reading-view.ts`).
4. Settings group, command, styles; `urlFromAnchor` selector extended.
5. Prefetch queue behind the "Fetch automatically" mode (`src/inline/prefetch.ts`).
6. Favicon prefix for `[text](url)` in both surfaces.
7. README section, ROADMAP update, performance check, release 0.3.0.

Steps 1–4 are the minimum shippable; 5 and 6 can trail in 0.3.x if needed.
