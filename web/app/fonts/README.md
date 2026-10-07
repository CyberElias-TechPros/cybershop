# Fonts

Three files, three different jobs. Only one of them reaches a browser.

| File | Size | Shipped to browsers? | Job |
|---|---|---|---|
| `Fraunces.woff2` | 104 KB | **Yes** — the site's display face | Headings, prices, brand marks |
| `Fraunces.ttf` | 352 KB | No | Build-time source for the two files below |
| `OgFraunces-Bold.ttf` | 19 KB | No (rendered server-side) | Share cards |

## `Fraunces.woff2` — the font the site loads

Loaded by `next/font/local` in `app/layout.tsx` and exposed as
`--font-fraunces`. It is a subsetted, woff2-compressed build of `Fraunces.ttf`.

The original is a four-axis variable font (`opsz`, `wght`, `SOFT`, `WONK`) that
weighs 352 KB and was preloaded on **every** page — the single largest asset
most visitors downloaded. Two things make it that heavy: it is an uncompressed
TTF rather than woff2, and it carries delta data for all four axes.

The build keeps the two axes anything actually varies and pins the other two:

- **`wght` kept** — `next/font` declares `weight: '300 700'`, and this is the
  axis those numbers mean.
- **`opsz` kept** — browsers apply optical sizing automatically via
  `font-optical-sizing: auto`, so a 72px headline and a 13px label render
  differently, as designed.
- **`SOFT` pinned to `0` and `WONK` pinned to `1`** — these are Fraunces'
  signature axes, but nothing on the site ever varies them, so they sit at
  their defaults forever. Pinning them to exactly those values is what pays
  for the file-size drop: 352 KB → 104 KB with **no visual difference at all**.

Glyph coverage is deliberately *not* trimmed — every codepoint the source font
has a glyph for is kept. Subsetting to Latin only saved a further 1.4 KB while
risking a missing glyph (the minus sign, `U+2212`, is used in the analytics
deltas), which is a bad trade.

Nigerian content was the reason for keeping coverage broad: the naira sign
(`U+20A6`), Yoruba/Igbo precomposed letters (`ẹ ọ ṣ ị ŋ`) and combining
diacritics are all present.

Regenerate with `fonttools` (subset **before** instancing — the other order
hits a fontTools crash on this font):

```bash
pip install fonttools brotli
python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.subset import Subsetter, Options

src = TTFont('app/fonts/Fraunces.ttf')

# 1. Keep every glyph the source font ships.
o = Options(); o.layout_features = ['*']; o.notdef_outline = True
o.drop_tables += ['DSIG']; o.name_IDs = ['*']; o.name_legacy = True
s = Subsetter(options=o); s.populate(unicodes=list(src.getBestCmap().keys()))
s.subset(src)

# 2. Pin the two axes nothing varies, then compress.
f = instancer.instantiateVariableFont(src, {'SOFT': 0, 'WONK': 1},
                                      inplace=False, updateFontNames=False)
f.flavor = 'woff2'
f.save('app/fonts/Fraunces.woff2')
PY
```

If you change it, re-check that no codepoint used in the app was lost — a
missing glyph renders as a blank box, and the minus sign is easy to miss.

## `OgFraunces-Bold.ttf` — share cards only

**Not used by the website.** It exists for one job: rendering share cards
(`web/lib/og-card.tsx`).

`@vercel/og` (Satori) cannot read a variable font, and its built-in default has
no glyph for the naira sign — so a price like `₦60,000` would render with a
blank box, and Satori would try to fetch a Google Font mid-request to
compensate. This file is a static, subsetted instance that avoids both.

Regenerate it from the source `.ttf` (not from the woff2) with:

```bash
pip install fonttools
python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

f = TTFont('app/fonts/Fraunces.ttf')
inst = instantiateVariableFont(f, {'wght': 800, 'opsz': 144, 'SOFT': 0, 'WONK': 0},
                               inplace=False, updateFontNames=False)
o = Options(); o.layout_features = []; o.drop_tables += ['DSIG']; o.name_IDs = ['*']
s = Subsetter(options=o)
s.populate(unicodes=[0x20A6] + list(range(0x20, 0x7F)) +
           [0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x00A0])
s.subset(inst)
inst.save('app/fonts/OgFraunces-Bold.ttf')
PY
```

Keep the naira sign (`0x20A6`) in the subset — without it prices break on every
share card.
