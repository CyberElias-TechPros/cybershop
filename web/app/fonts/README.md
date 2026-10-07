# Fonts

## `Fraunces.ttf`

The app's display face, loaded by `app/globals.css` for headings. Variable
(`opsz`, `wght`, `SOFT`, `WONK`).

## `OgFraunces-Bold.ttf`

**Not used by the website.** It exists for one job: rendering share cards
(`web/lib/og-card.tsx`).

`@vercel/og` (Satori) cannot read the variable font above, and its built-in
default has no glyph for the naira sign — so a price like `₦60,000` would render
with a blank box, and Satori would try to fetch a Google Font mid-request to
compensate. This file is a static, subsetted instance that avoids both.

Regenerate it with `fonttools`:

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
