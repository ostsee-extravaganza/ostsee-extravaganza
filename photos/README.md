# Fotos

Drop files into a dated folder, then run the generator:

```bash
python3 tools/fotos.py
```

```
photos/2026-09-02/DSC_1234.jpg     ->  Tag 3 · Zingst
photos/planung/whatever.jpg        ->  Planungsphase
photos/2026-09-05/clip.mp4         ->  shown inline as a video
```

The script writes a 1600px web copy and a 480px thumbnail beside each original,
strips EXIF from those copies, reads the capture time for ordering and GPS if it
is there, and rebuilds `data/photos.json`. Re-running is safe.

## Videos

Not touched by the script. Compress them yourself before committing — 720p and
under about 20 MB. Anything bigger belongs somewhere other than a git repo.

```bash
ffmpeg -i in.mov -vf scale=-2:720 -c:v libx264 -crf 26 -preset slow -c:a aac -b:a 128k out.mp4
```

## Captions

Add them in `data/photos.json` after generating. The script preserves nothing on
re-run, so if you write a lot of captions, keep them somewhere safe first.
