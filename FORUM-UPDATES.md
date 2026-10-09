# Forum updates

Replies to the Link Peek topic in Share & showcase > Plugins on forum.obsidian.md, one per
release, newest first. Each entry is ready to paste into the Discourse composer as is. Prose
goes through the humanizer pass before it lands here.

The forum account cannot post links yet, so entries point to the GitHub releases page in
words instead of with a URL.

## 0.3.2 (2026-10-09)

0.3.2 is out. A small release, mostly groundwork for the next feature.

- Links to files (PDF, zip, video, Office documents and so on) are no longer downloaded when you hover them. The card shows the file name and what kind of file it is.
- The interface is in Simplified Chinese when Obsidian is set to Chinese.
- Link Peek is now marked desktop only. I never tested it on a phone, so I'd rather not claim it works there.
- There's now an end-to-end test suite that runs inside Obsidian, which should keep regressions out of future releases.

Next up: a URL that sits alone on its own line will show as a full card, still without writing anything into the note.

Release notes are on the GitHub releases page, tag 0.3.2 (repo link is in the first post; this account can't post links yet).

## 0.3.1 (2026-10-08)

0.3.1 is a small fix release.

- Card descriptions now stop cleanly at the line limit. Before, the top of the next line peeked out under the last one.
- Cleanups from the community directory's automated review. None of them change how the plugin behaves.
- The README says what the plugin does with the clipboard: it never reads it, and only "Copy URL" in an inline link's right-click menu writes to it.
- The README has screenshots now.

Release notes are on the GitHub releases page, tag 0.3.1 (repo link is in the first post; this account can't post links yet).

## 0.3.0 (2026-10-06)

0.3.0 is out. The main addition is inline link titles, off by default.

With it on, a bare URL in a note is shown as the site's icon and the page title. The note itself doesn't change. Put the cursor on the link, or Alt/Option-click it, and the raw URL is back for editing.

- There are two modes. "Only links already previewed" uses titles from links you've hovered before and sends no requests at all. "Fetch titles for links on screen" asks each visible site once you stop scrolling, two at a time.
- [text](url) links keep the text you wrote. A separate setting puts the site's icon in front of them.
- Click opens the link and hover still shows the card. Right-click has Open link, Preview card, Copy URL and Edit URL.
- It works in Live Preview (callouts and tables included), Reading view, Canvas text cards and pop-out windows. Source mode always shows the raw Markdown.
- Code, comments and images are left alone. So are URLs that Obsidian itself doesn't render as links.
- "link-peek: off" in a note's properties turns it off for that note, and there's a command to toggle it everywhere.

Turn it on under Settings > Link Peek > Inline links.

Release notes are on the GitHub releases page, tag 0.3.0 (repo link is in the first post; this account can't post links yet).

## 0.2.0 (2026-10-05, posted)

0.2.0 is out. What changed since the first post:

- The hover can require a key now (Cmd/Ctrl, Alt or Shift), and by default the card waits until the pointer actually stops. Sweeping across a paragraph no longer flashes cards.
- A pin button keeps the card open while you type or click elsewhere. There is also a "Preview link under cursor" command. On mobile, which the first post said I hadn't tried, that command is the way to use the plugin at all.
- Pop-out windows work. They didn't before.
- Links in Properties and in Bases cells get previews, and so do bare URLs in search results and the backlinks pane.
- Pages that aren't UTF-8 (GBK, Big5, Shift_JIS) decode correctly.
- Wikipedia cards show the article extract instead of the site slogan. Reddit posts show title and author. Pages without OG tags fall back to their oEmbed endpoint if they advertise one.
- When a preview fails, the card says why (blocked, timed out, not found, no metadata) and has an "Open in browser" button, plus "Retry" where retrying can help.
- New settings: hide thumbnails per domain, number of description lines, compact cards.

Some sites refuse anything that isn't a browser (Zhihu, for one). Those show as blocked. Getting past that would need a third-party scraping service, which this plugin doesn't use on purpose.

Release notes are on the GitHub releases page, tag 0.2.0 (repo link is in the first post; this account can't post links yet).
