# Link Peek

Hover any external link in Obsidian and peek at it: an OpenGraph preview card with title, description, image, favicon and site name.
Inspired by [logseq-plugin-link-preview](https://github.com/pengx17/logseq-plugin-link-preview).

![Hover card for a Wikipedia link in Live Preview](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/hover-card.png)

- Works in **Live Preview**, **Source mode**, **Reading view**, **Canvas** (link nodes and links inside text nodes), **Properties**, **Bases** cells, plain-text URLs in sidebars (search results, backlinks) and **pop-out windows**.
- Fetches metadata through Obsidian's own `requestUrl` — no third-party preview service, no API keys, no CORS trouble. Pages are decoded with their declared charset, so GBK / Big5 / Shift_JIS sites render correctly.
- Fills gaps with the page's own oEmbed endpoint when OG tags are missing, and uses the public JSON APIs of Wikipedia (real article extract) and Reddit (post title and author) whose HTML is useless to a non-browser.
- **Caches locally** (`data.json`) with a configurable lifetime and size; failed lookups are retried after an hour.
- **Never modifies your notes** — the card is pure rendering.
- Follows your theme (light/dark) via Obsidian CSS variables.
- Optional **inline link titles**: bare URLs shown as favicon + page title in Live Preview and Reading view, without changing the note (see below).

## Install

**Community plugins**: Settings → Community plugins → Browse → "Link Peek".

**BRAT** (pre-release builds): install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then *Add a beta plugin* with `iam1maker/obsidian-link-peek`.

**Manual**: download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/iam1maker/obsidian-link-peek/releases/latest) into `<vault>/.obsidian/plugins/link-peek/` and enable the plugin.

## Network use and privacy

When you hover an external link, Link Peek sends a single GET request **to that link's host** to read its `<head>` metadata, with a desktop-browser User-Agent. Nothing is sent anywhere else: there is no telemetry and no intermediary service. Thumbnails and favicons are loaded by the card directly from the site (with `referrerpolicy="no-referrer"`). Use **Excluded domains** in settings to opt specific hosts out, or turn previews off entirely with the *Toggle hover previews* command.

Inline link titles make **no requests** by default: in the *Only links already previewed* mode they only use what hovering has already cached. The *Fetch titles for links on screen* mode is opt-in; it sends the same single GET to each site whose link is visible, after you stop scrolling, two at a time.

The plugin never reads the clipboard. It writes to it in one place: *Copy URL* in an inline link's right-click menu puts that link's URL there.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Enable hover previews | on | Turn off without disabling the plugin; the cache is kept |
| Hover delay | 350 ms | Pointer must rest on a link this long before the card opens |
| Trigger key | none | Require Cmd/Ctrl, Option/Alt or Shift to be held; pressing the key while already over a link opens the card |
| Only when the pointer is still | on | Movement restarts the hover delay, so sweeping across text never opens cards |
| Show images | on | Render the `og:image` thumbnail |
| Hide images from these domains | — | One hostname per line; cards from these sites show no thumbnail |
| Description lines | 3 | Lines of description before the card cuts off |
| Compact cards | off | Favicon, site and title only |
| Inline link titles | Off | Off / Only links already previewed (no extra requests) / Fetch titles for links on screen |
| Favicons on text links | off | Site icon in front of `[text](url)` links; the link text is kept |
| Maximum title length | 60 | Longer inline titles are cut with an ellipsis |
| Preview in Canvas | on | Cards for Canvas link nodes and links inside text nodes |
| Excluded domains | — | One hostname per line; subdomains are included |
| Cache lifetime | 7 days | Failures are retried after an hour regardless |
| Maximum cached links | 2000 | Least recently used entries are dropped beyond this |

Commands: **Preview link under cursor** (opens the card pinned, next to the caret; also the way to use Link Peek on touch devices), **Toggle hover previews**, **Toggle inline link titles**, **Clear metadata cache**.

**Pinning.** The pin button in the card header keeps it open while you move away, click elsewhere or type, so you can select its text or follow it later. Other links do not replace a pinned card. `Esc` or the close button dismisses it.

## Inline link titles

With *Inline link titles* on, a bare URL such as `https://github.com/iam1maker/obsidian-link-peek` is displayed as the site's favicon followed by the page title. The Markdown source is never changed:

![Bare URLs shown as favicon and page title](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/inline-titles.png)

- Put the cursor on the link (or **Alt/Option-click** it) and the raw URL comes back for editing.
- Click opens the link, hover shows the full card, right-click offers *Open link*, *Preview card*, *Copy URL* and *Edit URL*.
- `[text](url)` links keep the text you wrote; turn on *Favicons on text links* to get the site icon in front of them.
- Code, comments, images and URLs Obsidian itself does not treat as links are left alone.
- Works in Live Preview (including callouts and tables), Reading view, Canvas text cards and pop-out windows. Source mode always shows raw Markdown.
- Turn it off for one note with the property `link-peek: off`.

## How it works

A document-level `mouseover` listener (one per window, pop-outs included) resolves the URL under the pointer:

1. **Rendered Markdown** (Reading view, Canvas text nodes), **Properties** and **Bases** — the hovered `<a>` (or Obsidian's `.external-link[data-href]` div) carries the URL.
2. **Editor** (Live Preview / Source) — the pointer is mapped to a document offset and that line's *source* is scanned for
   `[text](url)`, `<url>` and bare URLs. Working from the source rather than the DOM is what makes folded Live Preview links work.
3. **Canvas link nodes** — the node element is matched back to the canvas node object, which holds the URL.
4. **Plain text** (search results, backlinks pane, other sidebars) — the pointer is mapped to a caret position and the surrounding block's text is scanned for a URL. Code spans and editable fields are skipped.

A `mousemove` listener (active only while a link is armed or a card is open) tracks which link the pointer is on inside an editor line and enforces the stillness rule. After the hover delay the card opens (instantly from cache when possible) and stays open while the pointer is over the link or the card. `Esc`, clicking elsewhere or scrolling dismisses it, unless it is pinned.

## When a preview fails

The card says why and offers a way out: *This site blocks previews* (401/403/429/503 or a bot-challenge page such as Cloudflare's or WeChat's), *Page not found*, *The site did not respond in time*, *Could not reach the site*, or *This page has no preview metadata*. Every error card has **Open in browser**; transient failures also get **Retry**, which bypasses the one-hour failure cache. Zhihu and other sites that refuse non-browser clients cannot be previewed; that is a limitation of fetching from the link's host directly rather than through a scraping service.

## Development

```bash
npm install
npm run dev        # esbuild watch → main.js
npm test           # vitest: metadata parsing, cache, editor URL resolution
npm run build      # type-check + minified bundle
```

Link the checkout into a vault to test it live:

```bash
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/link-peek
```

Releases are cut by pushing a tag equal to the `manifest.json` version (`npm version patch && git push --follow-tags`); GitHub Actions builds and attaches `main.js`, `manifest.json`, `styles.css`.

## License

[MIT](LICENSE)
