# README demo animation

Source of `docs/images/demo.gif`, a [HyperFrames](https://github.com/heygen-com/hyperframes)
composition. The editor and card are rebuilt in HTML from the plugin's `styles.css`; titles,
descriptions and icons come from real Link Peek cache entries. All assets are local.

Re-render (Node 22+, FFmpeg):

```bash
cd docs/demo
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.141 check
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.141 render -f 30 -q high -o demo.mp4
ffmpeg -i demo.mp4 -vf "fps=20,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ../images/demo.gif
rm demo.mp4
```
