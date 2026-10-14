# CyberShop — Samsung Galaxy Store listing (paste-ready)

Copy everything in the boxes verbatim into Seller Portal. This replaces a
concept-first description with a **function-first** one — the exact thing
the reviewer asked for ("description should show the application functions
enough to let users understand its features").

---

## App Title

```
CyberShop: Shop & Sell on WhatsApp
```

## Short Description

```
Shop Nigerian businesses and message sellers directly on WhatsApp.
```

## Full Description (3,718 bytes — Samsung's limit is 4,000 bytes)

```
CyberShop is a marketplace and business directory that helps shoppers in Nigeria discover products, courses and services, compare prices, and contact independent sellers directly on WhatsApp.

Browse the shop, open a listing to see photos and seller information, then start a WhatsApp conversation with a pre-written enquiry. CyberShop does not provide a buyer checkout: you agree the details with the seller, inspect the product or service, and pay the seller directly.

FOR SHOPPERS
- Browse new and featured listings from independent businesses
- Shop by category, including fashion, electronics, courses, food, property, services and general retail
- Search by keyword and city, and filter listings by price, availability, seller rating and category-specific details
- View listing photos, prices, descriptions, stock status, seller location and the date the listing was published
- Open a seller's storefront to see its full catalogue, offers and reviews
- Save listings for later, revisit recently viewed items and save searches
- Look for the Verified ID badge on sellers whose identity has been checked
- Listen to seller voice notes on supported listings
- Add supported items from the same seller to a WhatsApp cart and send one combined enquiry
- Contact a seller on WhatsApp with the listing name, price and link already included in the message
- Read the in-app safety guide, report a listing or business, and block a seller from your account

HOW WHATSAPP BUYING WORKS
1. Find a product, course or service and review the price and seller details.
2. Tap the WhatsApp action to open a chat with your enquiry already written.
3. Confirm availability, delivery and the final price with the seller.
4. Inspect or verify the product or service, then pay the seller directly.

No buyer account is required to browse listings or contact a seller. A free buyer account adds saved searches, alerts, enquiries and the ability to leave a review after enquiring.

FOR BUSINESSES AND SELLERS
- Create a business storefront with your logo, cover photo, description, location, categories and contact details
- Publish a catalogue with photos, prices, stock status, product variants, offers and voice notes
- Use catalogue fields designed for what you sell, such as sizes for fashion, duration for courses and bedrooms for property
- Share your storefront and listings in WhatsApp chats and Status with preview cards showing the photo and price
- Receive and manage buyer enquiries in your leads inbox
- View views, WhatsApp clicks and listing performance in your analytics
- Manage WhatsApp numbers and, depending on your plan, team members and a custom domain
- Start with the free seller plan; optional paid plans and add-ons provide higher catalogue limits and additional business tools. Current prices and payment instructions are shown before purchase during seller onboarding

IMPORTANT INFORMATION
CyberShop is a discovery and introduction service. It is not the seller of the listed products or services and does not process buyer checkout, hold buyer money, arrange delivery or guarantee a seller's products. Sellers are responsible for their listings, prices, availability, delivery and fulfilment.

For your safety, confirm all details with the seller, inspect or verify before paying, avoid advance payments to unknown sellers, and report suspicious listings in the app.

REQUIREMENTS
- An internet connection is required.
- WhatsApp is required to message a seller.
- A seller account is required to create a storefront.
- Language: English.

CyberShop gives Nigerian businesses a permanent online shop window and gives shoppers a clear way to discover them before continuing the conversation on WhatsApp.
```

## Search Keywords

```
whatsapp shop, nigeria marketplace, buy online nigeria, lagos shopping, online store, sell on whatsapp, business catalogue, jiji alternative, courses nigeria, fashion nigeria
```

(Keep to the portal's keyword field limits; drop from the right if trimmed.)

## Field-by-field settings for the form you pasted

| Field | Set it to | Why |
|---|---|---|
| **Category** | **Shopping** | It is a marketplace; "General" tells nobody anything |
| **Age Restriction** | **12+** | User-generated listings + direct chat with sellers is not a 0+ surface |
| **Rating Certificate** | PEGI 12 / ESRB Everyone 10+ or Teen per region; submit the certificate the portal asks for | UGC + communication features |
| **Supported Languages** | **English only** | The app is English-only; ticking 90 languages you don't ship invites a language-support rejection |
| **Privacy Policy URL** | `https://<your-domain>/privacy` (must be live before resubmitting) | The app already ships this page |
| **Support E-Mail** | `support@cybershop.ng` (or your live support inbox) | Must be monitored — reviewers may write to it |
| **Support URL** | `https://<your-domain>/contact` | The app ships a contact page |
| **Open Source URL** | Leave blank unless you publish the code | Optional |
| **YouTube URL** | Only a real 30–60s walkthrough URL (record the 8 shots in `docs/galaxy-store.md` as a screen recording) | Optional but directly answers "show the functions" |
| **Icon** | The existing 512×512 PNG (84KB, sharp) — do not upscale the 192 | Blurry icons trigger the same complaint |

## What NOT to do

- Don't reuse the old description that leads with the slogan and the
  "night market" metaphor — poetry is what got the "insufficient
  information" defect.
- Don't upload screenshots of the intro/logo screen, the empty states,
  or the old animated-phone homepage. Reviewers must see *functions*.
- Don't upload JPEGs, emulator-resized images, or screenshots taken
  through a messenger (WhatsApp recompresses them — a classic source of
  "blurred"). PNG at the device's native resolution only; validate with
  `scripts/store-screenshots/check_screenshots.py` before uploading.
