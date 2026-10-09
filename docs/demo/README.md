# README demo animations

Sources of `docs/images/demo.gif` (this folder) and `docs/images/link-cards.gif` (`cards/`). Each is a [HyperFrames](https://github.com/heygen-com/hyperframes)
composition. The editor and card are rebuilt in HTML from the plugin's `styles.css`; titles,
descriptions and icons are the real ones from each page. All assets are local.

Re-render (Node 22+, FFmpeg); for the cards animation run the same steps in `cards/` and write `../../images/link-cards.gif`:

```bash
cd docs/demo
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.141 check
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.141 render -f 30 -q high -o demo.mp4
ffmpeg -i demo.mp4 -vf "fps=20,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ../images/demo.gif
rm demo.mp4
```
