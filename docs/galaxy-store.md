# Samsung Galaxy Store — rejection fix kit

**Rejection received:** *Metadata — Insufficient information on description
or screenshots. "Screenshot of application is blurred… Description and
screenshots should show the application functions enough to let users
understand its features."*

That is two defects, not one:

1. **Content** — the listing explained the brand instead of demonstrating
   functions. Fixed by the function-first copy in
   [`store-listing/galaxy-store-listing.md`](../store-listing/galaxy-store-listing.md)
   (paste-ready) and the shot list below, where **every screenshot is a
   feature doing its job**.
2. **Sharpness** — blurred screenshots are almost always one of:
   a JPEG uploaded where a PNG belongs, an emulator/screenshot at one
   resolution rescaled by the portal to another, a screenshot passed
   through WhatsApp/e-mail (recompression), or a low-density device.
   The rules + validator below eliminate all four.

> **Honesty rule:** capture the real app. Do not submit mock-ups, AI
> images, or the templates in marketing material — Samsung compares
> screenshots against the binary, and fabricated UI earns a harder
> rejection. Nothing in this kit fabricates a screenshot.

---

## 1. The 8 screenshots (in upload order)

Each maps to a real screen of the current build. Seed data (or your live
store) must show real listings with photos and prices — an empty market
is both a bad screenshot and a bad first impression.

| # | Screen (route) | What it proves | Capture notes |
|---|---|---|---|
| 1 | **Shop home** (`/`) | "This is a shop" — search, categories, real listings with prices | Scroll so at least 4 complete listing cards are visible; city set to your main city |
| 2 | **Shop with filters** (`/listings?category=…&city=…`) | Search, filters, ratings, Verified ID badges | Pick a category with photos; keep the filter bar visible |
| 3 | **Listing page** (`/business/<store>/…/<item>`) | Price, gallery, seller card, reviews, WhatsApp CTA | The money shot — CTA visible without scrolling if possible |
| 4 | **WhatsApp handover** (WhatsApp chat opened from the CTA) | The core differentiator: pre-written enquiry in WhatsApp | Use a test seller number you control; blur only personal numbers, never the message |
| 5 | **WhatsApp cart** (`/cart` with 2–3 items from one store) | Multi-item list → one conversation | Add items first so the cart is meaningfully full |
| 6 | **Storefront** (`/business/<store>`) | Sellers get a real shop: cover, catalogue, offers | Use the best-looking live store (e.g. Cyber Elias Academy) |
| 7 | **Vendor dashboard** (`/dashboard` after login) | Sellers: leads, views, store strength | Demo vendor account; shows the "sell" half of the app |
| 8 | **Safety** (`/safety`) or saved listings (`/saved`) | Trust: safety guidance / save-for-later | Safety proves the trust story reviewers look for in marketplaces |

Optional 9–10 if the portal allows: `/sell` pricing (proves the vendor
offer) and an item page with a vendor **voice note** playing.

Order matters: shots 1–3 must sell the app in the first swipe of the
store page. Never put the logo/intro curtain, a login wall, or an empty
state in the first three.

## 2. Capture rules (the "not blurred" checklist)

- **Device:** a real Samsung (or the exact device-class you submitted),
  display at **native resolution** (Settings → Display → Screen
  resolution → highest/WQHD if offered). Target files: **1080×1920 PNG**
  (or the device's native portrait size, minimum 1080 wide).
- **Format:** PNG only. If your capture flow produces JPG, re-export
  losslessly — never let a messenger or gallery "compress" toggle touch
  the file between capture and upload. Transfer by USB/`adb pull`.
- **App state:** open the app **once first** (the brand curtain plays
  only on first view per session) and wait for images to finish loading
  before every capture. No loading spinners, no skeleton shimmer.
- **Density/text:** system font size at Default (not Largest), dark
  theme as shipped. Status bar is fine; hide notifications, low-battery
  warnings and personal notification content.
- **No portal-side rescaling surprises:** upload at the size you
  captured. If the portal shows a resized preview that looks soft,
  re-check the original file with the validator — if the file is native
  PNG and soft in preview, the preview is lying; if the file itself is
  small/JPEG, recapture.

One-command capture over USB (USB debugging on):

```bash
scripts/store-screenshots/capture.sh   # pulls shot-01.png … into store-listing/screenshots/
```

Then validate before uploading:

```bash
python3 scripts/store-screenshots/check_screenshots.py store-listing/screenshots/
# expects: all PNG, ≥1080×1920 (or consistent native size), healthy file sizes
```

## 3. Resubmission checklist

- [ ] Title, short + full description, keywords replaced (copy in
      `store-listing/galaxy-store-listing.md`)
- [ ] Category = Shopping; Age = 12+; Languages = English only
- [ ] Privacy Policy URL live and loading over HTTPS
- [ ] 8 new screenshots, native PNG, story order above, validator green
- [ ] Icon still the sharp 512×512
- [ ] Binary unchanged (this is a *metadata* rejection — do not upload a
      new APK/AAB unless the portal demands one; if it does, notes below)
- [ ] Reply to the reviewer (template below)

**Reviewer reply (paste into the resubmission note):**

> Thank you for the feedback. We have (1) rewritten the description to
> explain every function for buyers and sellers, (2) replaced all
> screenshots with native-resolution PNG captures showing the actual
> features: shop home with live listings and prices, filters and
> Verified ID badges, listing page with WhatsApp enquiry, the WhatsApp
> handover, the multi-item WhatsApp cart, a seller storefront, the
> vendor dashboard and the in-app safety guide. Category (Shopping),
> age rating (12+) and supported languages (English) have also been
> corrected. We are happy to provide a screen recording if useful.

## 4. Why this should pass now

The distribution guide's test is "can a user understand the functions
from the description + screenshots alone." Before: a slogan, a metaphor
and decoration. After: every verb in the description (shop, filter,
save, cart, chat, sell, track) has a screenshot performing it, at the
resolution the device actually renders. That is also, not coincidentally,
exactly what the new shop-first homepage was built to show.
