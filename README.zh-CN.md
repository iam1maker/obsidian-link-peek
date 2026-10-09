# Link Peek

[English](README.md) | 简体中文

在 Obsidian 里把鼠标停在外部链接上，就能看到预览卡片：网页的标题、摘要和图片。裸 URL 还可以直接显示成网页标题，单独占一行的 URL 可以显示成卡片。

![Link Peek 演示：裸 URL 显示成网页标题，悬停弹出预览卡片](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/demo.gif)

- 支持实时预览、阅读视图、白板（Canvas）、笔记属性、Bases 和弹出窗口。
- 从不修改笔记，Markdown 里始终只是一个普通的 URL。
- 不经过任何第三方服务。元数据直接从链接所在的网站读取，并缓存在本地。

## 链接卡片

单独占一行的 URL 可以显示成卡片，类似书签。在 设置 → Link Peek → 链接卡片 里开启。指向文件的链接（PDF、压缩包、视频等）只显示文件名和类型，不会下载文件。

![单独成行的 URL 显示成卡片](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/link-cards.gif)

## 安装

设置 → 第三方插件 → 浏览 → 搜索「Link Peek」。

## 使用技巧

- 点预览卡片上的**固定**按钮，卡片会一直开着，打字或点别处都不会关掉。
- **行内链接标题**和**链接卡片**默认关闭。链接显示成标题或卡片后，把光标移到它上面，或者按住 Option/Alt 点击，就能编辑原始 URL。
- 在笔记属性里加上 `link-peek: off`，这篇笔记里的 URL 会保持原样。
- 超过缓存有效期的标题和卡片会继续显示，悬停链接时在后台刷新。
- 卡片弹得太频繁？可以设一个触发键（Cmd/Ctrl、Option/Alt 或 Shift）。
- 用键盘时，可以用命令「预览光标处的链接」。
- 界面语言跟随 Obsidian 的设置，支持简体中文。

## 隐私

悬停一个链接时，插件只向这个链接所在的网站发一次 GET 请求，不发往任何其他地方，也不收集任何使用数据。图片和图标直接从对应网站加载。行内标题和链接卡片只使用悬停时已经缓存的数据，除非你把它们切换到「抓取」模式。插件从不读取剪贴板，只有链接右键菜单里的「复制 URL」会往剪贴板写入内容。

## 截图

![实时预览中 Wikipedia 链接的悬停卡片](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/hover-card.png)

![裸 URL 显示成网站图标和网页标题](https://raw.githubusercontent.com/iam1maker/obsidian-link-peek/main/docs/images/inline-titles.png)

---

灵感来自 [logseq-plugin-link-preview](https://github.com/pengx17/logseq-plugin-link-preview)。从源码构建见 [docs/development.md](docs/development.md)（英文）。许可证：[MIT](LICENSE)。
