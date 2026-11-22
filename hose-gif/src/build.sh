#!/bin/bash
# Renders frames and assembles GIFs. usage: ./build.sh
set -e
cd "$(dirname "$0")"
TMP=${TMPDIR:-/tmp}/hose-frames
for variant in plain caption; do
  rm -rf "$TMP/$variant"
  if [ $variant = caption ]; then node render.js "$TMP/$variant" --caption "Me: I've got this under control." >/dev/null; out=../hose-caption.gif
  else node render.js "$TMP/$variant" >/dev/null; out=../hose.gif; fi
  ffmpeg -loglevel error -y -framerate 25 -i "$TMP/$variant/f%03d.png" \
    -vf "scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
    -loop 0 "$out"
  ls -la "$out"
done
