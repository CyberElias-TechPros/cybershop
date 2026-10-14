#!/usr/bin/env python3
"""Validate Galaxy Store screenshots before upload (stdlib only).

The Galaxy rejection said "screenshot is blurred". Blurred store shots are
almost never the app's fault — they are JPEGs, messenger-recompressed files,
or captures below native resolution that the portal then upscales. This
checker fails loudly on all three causes it can detect from the file alone:

  * not a PNG (JPEG artefacts upscale into mush)
  * smaller than 1080x1920 (below a mainstream Samsung's native portrait)
  * suspiciously small file for its dimensions (heavy compression)
  * mixed dimensions across the set (portal will rescale the odd ones)

Usage:  python3 scripts/store-screenshots/check_screenshots.py <dir>
Exit code 0 = ready to upload, 1 = fix the listed problems first.
"""
import struct
import sys
from pathlib import Path

MIN_W, MIN_H = 1080, 1920
MIN_BYTES_PER_PIXEL = 0.08  # a real UI PNG is rarely below this


def png_size(path: Path):
    """(width, height) if the file is a PNG, else None."""
    with path.open("rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    # IHDR starts at byte 8: length(4) + 'IHDR'(4) + width(4) + height(4)
    width, height = struct.unpack(">II", head[16:24])
    return width, height


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    folder = Path(sys.argv[1])
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"}) if folder.is_dir() else []
    if not files:
        print(f"✗ no image files in {folder}")
        return 1

    problems = []
    sizes = set()
    for f in files:
        size = png_size(f)
        if size is None:
            problems.append(f"{f.name}: not a PNG — re-export losslessly (JPEG is the #1 blur cause)")
            continue
        w, h = size
        sizes.add((w, h))
        kb = f.stat().st_size / 1024
        if w < MIN_W or h < MIN_H:
            problems.append(f"{f.name}: {w}x{h} is below {MIN_W}x{MIN_H} — capture at native resolution, never upscale")
        if f.stat().st_size < w * h * MIN_BYTES_PER_PIXEL:
            problems.append(f"{f.name}: only {kb:.0f} KB for {w}x{h} — looks recompressed (did it pass through WhatsApp/e-mail?)")
        print(f"  {f.name}: {w}x{h}, {kb:.0f} KB")

    if len(sizes) > 1:
        problems.append(f"mixed dimensions {sorted(sizes)} — the portal rescales the odd ones soft; recapture at one size")
    if not (4 <= len(files) <= 10):
        problems.append(f"{len(files)} screenshots — upload 4–10 (8 is the storyboard in docs/galaxy-store.md)")
    # Sharpness heuristic without Pillow: detail-rich UI PNGs compress worse
    # (bigger) than flat/blurry ones. Already covered by bytes/pixel above.

    if problems:
        print("\nNOT READY:")
        for p in problems:
            print(f"  ✗ {p}")
        return 1
    print(f"\n✓ {len(files)} screenshots at {sorted(sizes)} — ready to upload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
