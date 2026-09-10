# App Plan: Multi-Vendor Storefront with WhatsApp Checkout

## 0. Confirmed Decisions

- **Buyer accounts:** Optional. Anonymous browsing/purchase-click is fully supported; account creation adds saved favorites, order/inquiry history, and faster repeat checkout.
- **WhatsApp numbers per store:** Vendors can add **multiple WhatsApp numbers** (e.g. Sales, Support, a specific staff line) and assign a number per product/category. This is a **monetized feature** — e.g. free plan = 1 number, paid tiers unlock additional numbers.
- **Subscription model:** General fixed tiers (Free/Basic/Pro, etc., admin-defined) cover the default feature set. Anything beyond the tiers (extra WhatsApp numbers, extra media storage, featured placement, extra categories, custom domain, etc.) is **sold as individual add-ons**, priced and toggled by admin, independent of the base tier.
- **WhatsApp integration method:** `wa.me` deep-linking only (confirmed) — no WhatsApp Business API/Cloud API. This keeps cost at zero and requires no Meta approval; all "message previews" rely on Open Graph tags on the product page, as covered in Section 4.
- **Payments:** Dual method —
  1. **Manual bank transfer + proof upload** (existing flow), reviewed/approved by admin.
  2. **Paystack** hosted payment page as an automated alternative — vendor pays by card/bank via Paystack checkout, webhook confirms payment and can **auto-activate** the vendor/subscription/add-on without admin review (with manual proof still available as a fallback/for vendors who prefer bank transfer).
- **Feature suggestions:** All features listed in Section 10 are adopted into scope (see phase mapping in Section 11 for suggested build order — not everything needs to ship in Phase 1).

---

## 1. Core Concept

A platform where any vendor — regardless of technical skill — can run a digital storefront without needing to handle payments, shipping, or inventory logic themselves. Buyers browse a catalogue (products or services), and instead of a traditional cart/checkout, clicking "Purchase" opens WhatsApp with a pre-filled message containing full product details (name, price, variant, quantity, and a media link/preview) addressed to the vendor's WhatsApp number. The vendor then closes the sale manually, the way they already do today.

The platform itself is industry-agnostic: it supports multiple **store types/categories** (e.g. general retail, tech academy/courses, food, services, real estate, fashion, etc.), each with its own custom field set, chosen by the vendor at signup or from settings.

---

## 2. User Roles

| Role | Description |
|---|---|
| **Buyer** | No login required (or optional light login). Browses stores, clicks purchase, redirected to WhatsApp. |
| **Vendor** | Signs up, pays activation fee + uploads proof, manages own storefront/catalogue/dashboard, handles subscription. |
| **Admin (Super Admin + optional Staff Admins)** | Approves vendors, manages categories/fields, oversees payments, full CRUD across the platform. |

---

## 3. Dynamic Category System (the key architectural piece)

Since you don't want to hardcode an industry, the system needs a **category/template engine**:

- **Store Type / Category** (e.g. "Retail Products", "Courses/Academy", "Food & Restaurant", "Real Estate", "Fashion", "Services/Bookings", custom...).
- Each Category has a **Field Schema** defined by Admin — a set of custom fields (text, number, dropdown, image, video, multi-select, price, duration, location, etc.) that get attached to any Product/Item/Listing created under that category.
  - Example — *Tech Academy* category fields: Course Title, Duration, Mode (online/physical), Price, Curriculum PDF, Instructor, Start Date.
  - Example — *Retail Product* category fields: Product Name, Price, Sizes/Variants, Stock Qty, Images, Video.
  - Example — *Real Estate* category fields: Property Title, Price, Location, Bedrooms, Property Type, Images.
- Vendor picks one (or more, if you allow multi-category vendors) category at signup or store setup, and their "Add Item" form dynamically renders based on that schema.
- Admin has full CRUD over Categories and their Field Schemas — can add new industries anytime without a code deploy.

This is essentially a lightweight **EAV (Entity-Attribute-Value)** model or a JSON-schema-per-category approach — recommended: store category field definitions as JSON schema, and store each product's custom field values as JSON alongside standard fields (name, price, images, status).

---

## 4. WhatsApp Purchase Flow

1. Buyer views a product/listing page.
2. Clicks **"Purchase / Order via WhatsApp."**
3. App builds a `wa.me` deep link:
   `https://wa.me/{vendor_whatsapp_number}?text={url_encoded_message}`
4. The message is auto-composed from a **template** (editable by admin/vendor) inserting:
   - Product name, price, variant/quantity selected, category-specific fields
   - A direct link to the product/media (since WhatsApp text messages can't embed raw images, the message includes a **link** to the product page, which shows a rich preview — image/video — via Open Graph meta tags on that page). This is the realistic way to get "image preview from the link" inside WhatsApp — the product detail page needs proper OG tags (og:image, og:title, og:description) so WhatsApp auto-generates the preview card when the link is pasted/sent.
5. Vendor receives the message on their personal WhatsApp/WhatsApp Business app — no API costs, no WhatsApp Business API approval needed for MVP.
6. Optional: log every "click to purchase" as a **Lead/Inquiry** in the vendor's dashboard (even though the sale itself happens off-platform) so vendors can track interest and follow up — this also gives you analytics data.

> Note: This uses the free `wa.me` link method, not the paid WhatsApp Business Cloud API — appropriate here since you're not sending automated messages, just prefilling a message the *buyer* sends. If later you want the platform to also auto-notify vendors or send order confirmations, that requires the WhatsApp Business API (Meta approval + cost) — worth flagging as a future phase.

---

## 5. Vendor Journey

1. **Signup** — business/store name, category selection, WhatsApp number, email/phone, password.
2. **Activation Fee** — vendor pays via either:
   - **Bank transfer** + uploads payment proof (screenshot/receipt) → sits in "pending" until admin reviews and activates, or
   - **Paystack checkout** → webhook confirms payment → account **auto-activates** immediately, no admin wait.
3. **Pending Approval** — only applies to the manual-transfer path; Paystack path skips straight to active (still logged for admin visibility).
4. **Store Setup** — store name, logo, banner, description, **one or more WhatsApp numbers** (extra numbers beyond the plan's included quota are a paid add-on, purchased the same way — bank proof or Paystack), category(ies), operating info.
5. **Catalogue Management** — Add/Edit/Delete items using the dynamic category fields; assign each product (or category) to a specific WhatsApp number where the vendor has more than one; upload images/videos (via SFTP storage, see below).
6. **Subscription Management** — recurring plan (e.g. monthly/yearly) with reminders before expiry, auto-deactivation on non-renewal (grace period configurable by admin), renewal via bank-proof upload or Paystack. Add-ons (extra numbers, extra storage, featured placement, etc.) are purchased/renewed the same way and tracked separately from the base plan.
7. **Dashboard** — view store views/clicks, inquiry/lead log (who clicked purchase, on what item, when), catalogue stats, subscription status, payment history.
8. **Store visibility toggle** — vendor can pause their store without deleting it.

---

## 6. Admin Capabilities (Full CRUD everywhere relevant)

- **Vendors:** view/approve/reject/suspend/reactivate, view payment proofs, manual override activation, full CRUD on vendor accounts.
- **Categories & Field Schemas:** create/edit/delete industry categories and their custom fields.
- **Products/Listings:** oversight CRUD (e.g. remove policy-violating listings) across all vendors.
- **Subscriptions & Plans:** define plan tiers/pricing/duration/included quotas (e.g. WhatsApp numbers, storage), view all payments, approve/reject manual proofs, manually extend/revoke.
- **Add-ons Management:** define purchasable add-ons (extra WhatsApp number, extra storage, featured listing, extra category, custom domain, etc.), their prices, and durations.
- **Payments Queue:** unified view of both payment paths — manual proofs (pending/approved/rejected, with audit trail) and Paystack transactions (auto-logged from webhook, rarely need action but visible for reconciliation/refund handling).
- **Users/Buyers** (if buyer accounts exist): manage/suspend if needed.
- **Content moderation:** flag/remove inappropriate images/videos.
- **Analytics dashboard:** platform-wide stats — vendors count, active/inactive, revenue from subscriptions, top categories, click-to-WhatsApp conversion counts.
- **CMS-lite:** manage homepage banners, featured stores, WhatsApp message templates, terms/FAQ pages.
- **Staff/Sub-admin roles** with permission levels (optional, phase 2).
- **Notifications:** email/SMS/in-app alerts to vendors on approval, rejection, subscription expiry.
- **Audit Logs:** track admin actions for accountability.

---

## 7. File/Media Storage via SFTP

Since you're using your own web hosting (~100GB) instead of S3/Cloudinary:

- Use an **SFTP client library** in your backend (e.g. `ssh2-sftp-client` for Node.js, or `paramiko`/`pysftp` for Python) to upload vendor images/videos directly to your hosting server over SFTP when a vendor uploads media.
- **Recommended flow:**
  1. Vendor uploads file from dashboard → backend temporarily receives it (buffer/temp storage).
  2. Backend validates (file type, size limit, virus-scan if possible) and compresses/optimizes images (e.g. via `sharp`) before transfer, to save space across 100GB.
  3. Backend pushes file via SFTP to a structured path, e.g. `/media/vendors/{vendor_id}/products/{product_id}/filename.ext`.
  4. Store only the **resulting public URL/path** in your database (assuming your hosting serves that directory over HTTP/HTTPS too — you'll need the SFTP upload directory to also be a publicly web-accessible directory on the same hosting, or a subdomain like `media.yourapp.com` pointed at that folder).
  5. For WhatsApp OG-image previews to work, that media URL **must be a normal public HTTPS URL** (not requiring auth) — confirm your host serves static files properly with correct content-type headers.
- **Storage housekeeping:** build in file size limits per vendor/plan tier, image compression, and a cleanup job for orphaned files (deleted products) — 100GB will fill up fast with unoptimized video, so video size/duration limits are strongly recommended, or restrict video and prioritize images + short clips.
- **Backup consideration:** SFTP-only storage on a single host is a single point of failure — recommend at least a periodic backup/sync job (e.g. nightly rsync to a second location or cheap object storage) even if SFTP is primary.
- **Video specifically:** consider limiting to short vendor-uploaded videos or thumbnails only, since 100GB shared across many vendors + video can be consumed quickly — this should be a plan-tier-based quota (e.g. Free/Basic = images only, Pro = + video up to X MB).

---

## 8. Suggested Data Model (high-level)

- **Users** (admin, vendor, optionally buyer) — role, auth info
- **Vendors** — profile, status (pending/active/suspended), category_id(s), subscription_id
- **WhatsAppNumbers** — vendor_id, number, label (e.g. "Sales", "Support"), is_default, source (included/add-on)
- **Categories** — name, field_schema (JSON), icon
- **Products/Listings** — vendor_id, category_id, name, price, status, custom_fields (JSON), media[] (image/video refs), whatsapp_number_id (which number this item routes to)
- **Media** — file path on SFTP host, public URL, type, size, linked entity
- **Subscriptions/Plans** — name, price, duration, included quotas (numbers, storage, categories, etc.)
- **AddOns** — name, price, duration, type (extra_number/extra_storage/featured/custom_domain/etc.)
- **VendorAddOns** — vendor_id, addon_id, status, expiry
- **Payments** — vendor_id, subscription_id/addon_id, amount, **method (bank_transfer/paystack)**, proof_file (nullable, bank only), paystack_reference (nullable, paystack only), status (pending/approved/rejected/success), reviewed_by (nullable, auto for paystack)
- **Leads/Inquiries** — product_id, vendor_id, whatsapp_number_id, timestamp, (optional buyer info if captured)
- **WhatsApp Message Templates** — per category or global, editable variables
- **Audit Logs** — actor, action, entity, timestamp

---

## 9. Suggested Tech Stack

| Layer | Suggestion |
|---|---|
| Frontend (web) | React (Next.js recommended for SEO + OG meta tags per product page, crucial for WhatsApp link previews) |
| Backend | Node.js (Express/NestJS) or Laravel (PHP pairs well with typical shared web hosting) |
| Database | PostgreSQL or MySQL |
| File Storage | SFTP to your existing hosting (as above) |
| Auth | JWT-based, role-based access control (admin/vendor/buyer) |
| Mobile (optional later) | React Native / Flutter, reusing the same API |
| Hosting | Your existing web host for storage + a VPS/cloud instance for the app backend if your shared hosting can't run Node/PHP processes well |

Next.js (or any SSR framework) is specifically worth calling out because **WhatsApp link previews require server-rendered Open Graph tags** — a pure client-side SPA won't reliably produce previews when the link is shared, since WhatsApp's crawler doesn't execute JavaScript.

---

## 10. Feature Suggestions (all confirmed in-scope — see Section 11 for phasing)

- **Search & filters** across stores/products, filterable by category-specific fields.
- **Featured/Boosted listings** — vendors can pay extra to be featured (extra revenue stream).
- **Store analytics for vendors** — views, clicks, top products.
- **Multi-language support** if targeting non-English-first users.
- **Reviews/ratings** on stores (careful: since sales happen off-platform, ratings would be self-reported/optional).
- **Favorites/wishlist** for returning buyers (if you add light buyer accounts).
- **Share button** (share product link to other platforms too, not just WhatsApp).
- **QR code generator** per store — great for offline/physical vendors to put on flyers, leading straight to their online catalogue.
- **Expiry/renewal reminders** via email/SMS/WhatsApp to vendors before subscription lapses.
- **Referral program** — vendors referring vendors get discounts.
- **Bulk upload** (CSV/Excel import) for vendors with large catalogues.
- **Order/inquiry status tracking** — vendor can mark a lead as "Closed/Won" or "Lost" for their own tracking, even though the transaction itself is off-platform.
- **Custom domain / subdomain per vendor** (e.g. `storename.yourapp.com`) — phase 2, boosts vendor trust and branding.
- **Basic PWA support** — installable app-like experience without needing native app stores initially.

---

## 11. Suggested Build Phases

1. **Phase 1 (MVP):**
   - Vendor signup with both payment paths (bank transfer + proof upload, and Paystack checkout + webhook auto-activation)
   - Dynamic category system (start with 2–3 categories)
   - Catalogue CRUD, SFTP media upload
   - Public storefront pages with OG tags (for WhatsApp preview cards)
   - `wa.me` purchase button, single WhatsApp number per vendor to start
   - Basic admin panel: vendor approval, category management, unified payments queue (proofs + Paystack log)
   - Optional buyer accounts (basic signup/login, favorites)
2. **Phase 2:**
   - Multiple WhatsApp numbers per vendor + per-product/category routing (monetized add-on)
   - Add-ons system (extra storage, extra numbers, featured listings) with Paystack support
   - Subscription expiry reminders + grace period automation
   - Leads/analytics dashboard for vendors, search/filters, QR code per store
   - Bulk CSV upload, order/inquiry status tracking (Won/Lost)
3. **Phase 3:**
   - Sub-admin roles with granular permissions
   - Custom vendor subdomains
   - Referral program
   - Reviews/ratings, share-to-other-platforms
   - Mobile app (React Native/Flutter) or PWA polish
4. **Phase 4 (only if volume justifies it):**
   - WhatsApp Business Cloud API integration for automated order confirmations/notifications (separate from the deep-linking flow, which remains the default).

---

## 13. Production-Readiness Enhancements

That "master prompt" you pasted is written for a generic full production-hardening exercise (and defaults to a Vercel + Cloudflare Workers/D1/R2/KV stack). Two things worth flagging before pulling from it:

- **It assumes an existing repo to audit.** You're pre-build, so the relevant parts are the *standards/checklists*, not the "audit an existing codebase" workflow — those apply once you have code to review.
- **It conflicts with your storage decision.** Its default architecture pushes files to Cloudflare R2 and relational data to D1/KV, run on Workers. You've confirmed SFTP-to-your-own-hosting + a normal backend (PHP/Node) instead — that's a legitimate, simpler architecture for your scale and is what the rest of this plan is built around. I'm not switching you to Cloudflare; below I've pulled out the parts of that prompt that are genuinely useful regardless of hosting choice.

### 13.1 Security & Authorization Hardening
- **Server-side authorization on every write/action** — never trust a "vendor_id" or "role" sent from the client; always re-check against the logged-in session on the backend (prevents IDOR — e.g. Vendor A editing Vendor B's product by guessing an ID).
- **Auth basics:** hashed passwords (bcrypt/argon2), rate-limiting on login/signup/password-reset, session expiry, account lockout or throttling after repeated failed logins.
- **File upload hardening:** validate real MIME type (not just extension), enforce size limits per plan tier, strip EXIF/metadata from images, store uploads outside any web-executable path where possible, generate randomized filenames (don't trust user-supplied names).
- **Input validation:** validate everything server-side (product fields, prices, file types) — client-side validation is UX only, not security.
- **Admin routes:** separate auth guard from vendor/buyer routes; never reachable by role-guessing.
- **Payment integrity:** verify Paystack webhooks with the signature/secret (don't trust a client-side "payment successful" call); treat manual proof uploads as *claims* until admin approves — no auto-activation from an unverified upload.
- **Never log secrets** (API keys, passwords, tokens) in error logs or audit logs.

### 13.2 Reliability & Real-World Edge Cases
- Prevent **duplicate submissions** (e.g. vendor double-clicking "Add Product," or submitting the same payment proof twice) — use idempotency checks or disable-on-submit.
- Handle **expired sessions gracefully** (redirect to login with a clear message, not a blank page or cryptic error).
- Handle **failed SFTP uploads** — if the SFTP transfer fails mid-request, don't save a broken media record; retry or show a clear "upload failed, try again" state.
- Handle **subscription expiry mid-session** — a vendor whose plan just lapsed shouldn't be able to keep publishing new products until they renew.
- **Orphan cleanup** — deleting a product should also clean up (or schedule cleanup of) its associated files on the SFTP host, so storage doesn't silently fill up with dead files.

### 13.3 UI State Completeness
Every async action (upload, save, payment, login) should visibly handle: loading, success, empty (no products yet), validation error, network error, and server error — never a silent blank screen. This matters especially for your target vendor persona (low technical confidence) — clear, plain-language feedback is more important here than for a typical SaaS.

### 13.4 SEO (relevant since storefronts are public pages)
- Each product/store page needs a **unique title, meta description, and Open Graph tags** (you already need OG tags for WhatsApp preview cards — the same tags serve SEO).
- **Clean, descriptive URLs** per store and product (e.g. `/store/jane-fashion/product/red-ankara-dress`, not `/product?id=1234`).
- **Sitemap.xml** covering active stores/products; **robots.txt** disallowing admin/dashboard/auth routes.
- **noindex** pending/suspended/inactive vendor stores so dead pages don't get indexed.
- Server-rendered (not purely client-side JS) product pages if using React — this is the Next.js recommendation from Section 9, and it's *also* required for WhatsApp's crawler to read your OG tags, so it does double duty.
- Structured data (`schema.org/Product` or `LocalBusiness`) on store/product pages where genuinely accurate — never fabricate ratings/reviews you don't have.

### 13.5 Design & UX Baseline (right-sized, not maximal)
The source prompt pushes hard toward "immersive/cinematic" design — appropriate for premium consumer brands, not necessarily for a tool whose core user is a non-technical vendor who "only knows how to use WhatsApp." For this product, prioritize:
- **Clarity and simplicity over visual spectacle** — large tap targets, plain language, minimal steps to "Add Product," obvious primary actions (the WhatsApp buy button should visually stand out consistently everywhere).
- **A small, consistent design system**: consistent buttons/cards/forms/empty-states across storefront, vendor dashboard, and admin — so it feels like one coherent product, not three.
- **Mobile-first**, since both vendors (updating catalogue from a phone) and buyers (clicking through to WhatsApp) are very likely mobile users.
- Light, purposeful motion (hover/tap feedback, smooth loading states) is worth doing — full cinematic/parallax treatment isn't a good trade-off for this audience/use case.
- Respect accessibility basics: sufficient contrast, readable font sizes, alt text on product images, keyboard-navigable admin panel.

### 13.6 Testing & Observability (right-sized for a solo/small build)
- Prioritize testing the things that lose money or trust if broken: signup → payment proof/Paystack → activation flow, catalogue CRUD, the WhatsApp link generation itself (does it always produce a valid, correctly encoded link with the right product info?), and admin approve/reject actions.
- Basic structured logging (who did what, when) for admin actions and payment status changes — this doubles as your audit trail (already planned in Section 6/8).
- A simple error-tracking tool (e.g. Sentry, or even just structured log files you check) is worth adding early — cheap insurance for a live product handling money.

### 13.7 What NOT to adopt from that prompt
- The full Cloudflare Workers/D1/R2/KV/Durable Objects/Queues architecture — unnecessary complexity and cost for your scale, and directly conflicts with your SFTP/own-hosting decision.
- The "avant-garde/experimental/cinematic" design maximalism — the wrong design register for a tool built for low-tech-confidence vendors.
- Enterprise-scale processes (formal ADRs, multi-pass audit ceremonies, etc.) — good discipline in principle, but overkill to formalize for an early-stage solo/small-team build; the useful ideas (document key decisions, test critical paths, don't skip security) are already folded into this plan.



- **Tech stack:** Do you have existing backend experience (PHP/Laravel vs Node vs something else) that should drive the final choice, given your hosting setup and that Paystack has solid SDKs for both PHP and Node?


Yes. What you are describing is much more interesting than a normal e-commerce website.

I would position it as a **multi-vendor, WhatsApp-first commerce/service platform** where the platform provides the storefront, catalogue, discovery, business management and lead/order generation — while **WhatsApp remains the actual conversation and transaction channel**.

The key architectural decision I would make is to **not build the system around one industry**. Instead, build a **configurable business-type/vertical system** so the same platform can become a product shop, tech academy, salon, consultant, restaurant, fashion store, repair service, event business, real-estate service, etc., simply by selecting the appropriate business template.

Your supplied engineering master prompt fits this very well: particularly its emphasis on reconstructing the actual product, avoiding unnecessary complexity, treating security/data/storage as first-class concerns, and making the UI distinctive rather than a generic template. 

# 1. The Core Product

Think of it as:

> **"Create your own professional online storefront without needing to understand e-commerce — manage everything from a simple dashboard and let customers contact you on WhatsApp."**

A vendor could sign up and create:

```text
Business
   │
   ├── Storefront
   │
   ├── Products
   ├── Services
   ├── Courses
   ├── Packages
   ├── Events
   ├── Properties
   ├── Portfolio
   ├── Offers
   └── Custom catalogue items
```

The vendor chooses what applies to them.

For example:

### A fashion vendor

```text
Products
├── Dresses
├── Shoes
├── Bags
├── Accessories
├── Sizes
├── Colours
└── Variants
```

### A tech academy

```text
Courses
├── Course title
├── Duration
├── Price
├── Delivery mode
├── Curriculum
├── Requirements
├── Start date
├── Certification
└── Instructor
```

### A consultant

```text
Services
├── Service
├── Description
├── Starting price
├── Duration
├── Delivery method
├── Requirements
└── Booking/inquiry
```

### A real-estate business

```text
Properties
├── Property type
├── Location
├── Bedrooms
├── Bathrooms
├── Price
├── Purpose
├── Features
├── Gallery
└── Inspection request
```

The **underlying platform remains the same**.

---

# 2. The Big Architectural Idea: Vertical Templates

This is the part I think will make your idea substantially better.

Don't hard-code:

```text
Product
Product
Product
```

Instead build a **Catalogue Type Engine**.

A vendor chooses:

> What do you offer?

Then:

```text
Physical Products
Services
Courses
Appointments
Events
Properties
Digital Products
Subscriptions
Packages
Portfolio/Projects
Custom
```

Each type has a predefined schema.

But the system should also allow the administrator to create new catalogue types.

For example:

```text
Catalogue Type: Course

Core fields
├── Name
├── Description
├── Price
├── Images
├── Videos
└── WhatsApp CTA

Custom fields
├── Duration
├── Skill level
├── Certification
├── Delivery mode
├── Start date
└── Requirements
```

This means you don't have to redesign the application every time somebody says:

> "Can I use this for my business?"

You simply create/select another business configuration.

---

# 3. Business Profile

Every vendor gets a public business profile.

Something like:

```text
/business/abc-fashion

                 ABC FASHION
        Fashion • Port Harcourt

        [Logo]

        About
        Products
        Services
        Offers
        Gallery
        Reviews
        Contact
```

Possible profile information:

* Business name
* Username/slug
* Logo
* Cover image/video
* Description
* Business category
* Subcategories
* Phone
* WhatsApp numbers
* Email
* Website
* Address
* Service area
* Opening hours
* Social media
* Business registration information where applicable
* Verification badge
* Business policies
* Delivery information
* Payment information
* FAQs

---

# 4. Multiple WhatsApp Numbers

This should absolutely be a first-class feature.

For example:

```text
WhatsApp Numbers

+234 xxx xxx xxxx
General enquiries

+234 xxx xxx xxxx
Sales

+234 xxx xxx xxxx
Customer support

+234 xxx xxx xxxx
Admissions
```

The vendor can configure routing:

```text
Product → Sales number

Course → Admissions number

Service → General number

Support → Support number
```

And you can monetize this.

### Example

Free:

```text
1 WhatsApp number
```

Starter:

```text
2 numbers
```

Business:

```text
5 numbers
```

Enterprise:

```text
10+
```

Then:

> Additional WhatsApp number — paid add-on

This gives you a very clean recurring revenue opportunity.

---

# 5. The WhatsApp Purchase Flow

This is one of the most important parts.

Suppose someone sees:

**HP Laptop**

₦450,000

[ **Purchase / Enquire on WhatsApp** ]

When they click:

```text
https://wa.me/234XXXXXXXXXX?text=...
```

The generated message could conceptually be:

```text
Hello, I am interested in this product.

Product: HP Laptop
Price: ₦450,000
Product ID: HP-LAP-001

Quantity: 1

Product page:
https://platform.com/business/abc/product/hp-laptop

Please provide more information.
```

The user simply taps **Send**.

No WhatsApp Business API is required.

---

# 6. Important WhatsApp Limitation

I would **not design the system around trying to attach the product image through the WhatsApp deeplink**.

A WhatsApp click-to-chat URL can prefill text, but it doesn't give your website the ability to programmatically attach an image/file to the outgoing WhatsApp message.

Instead, use the **product URL**.

For example:

```text
https://yourplatform.com/p/abc-fashion/hp-laptop
```

That page should have excellent Open Graph metadata:

```text
og:title
og:description
og:image
og:url
```

So when WhatsApp generates a link preview, the product can potentially appear with its image.

Therefore your strategy becomes:

```text
Product
   ↓
Public product URL
   ↓
SEO / OpenGraph metadata
   ↓
WhatsApp deeplink
   ↓
Prefilled inquiry
```

That is much more robust.

---

# 7. Don't Call It an "Order" Internally Too Early

This is another architectural distinction I recommend.

Since the platform isn't actually processing the payment/order itself, don't pretend it is a full checkout system.

Instead model the action as:

```text
Customer Intent
```

or

```text
WhatsApp Inquiry
```

Then optionally allow the vendor to convert it into:

```text
Inquiry
↓
Negotiation
↓
Order
↓
Payment
↓
Fulfilled
↓
Completed
```

The platform doesn't need to know every WhatsApp conversation.

But it can record:

```text
Product viewed
CTA clicked
WhatsApp opened
Inquiry generated
```

This gives vendors useful analytics without requiring WhatsApp API integration.

---

# 8. Vendor Dashboard

The vendor dashboard should be extremely simple because your target customer may literally be someone who only understands WhatsApp.

This is critical.

Don't make it look like enterprise ERP software.

### Dashboard

```text
Good afternoon 👋

Your Store

[ + Add item ]

Today's activity
────────────────────
Product views       124
WhatsApp enquiries   18
Total catalogue      42

Quick actions
────────────────────
＋ Add Product
＋ Add Service
＋ Add Offer
📸 Manage Media
💬 WhatsApp Numbers
📊 View Analytics
```

---

# 9. Catalogue Manager

The catalogue section should have:

```text
Catalogue

[ Search ]

All | Active | Draft | Out of stock | Archived

┌──────────────────────┐
│ Product image        │
│ HP Laptop            │
│ ₦450,000             │
│ Active               │
│                      │
│ Edit  Duplicate More │
└──────────────────────┘
```

Features:

* Create
* Edit
* Delete
* Archive
* Duplicate
* Publish/unpublish
* Schedule publication
* Reorder
* Bulk actions
* Categories
* Tags
* Search
* Filters
* Sorting
* Stock status
* Featured items
* Offers
* Variants

---

# 10. Media Manager

Since you specifically want to use your **100GB SFTP hosting**, I would design the application around that rather than R2.

Your master prompt says to evaluate storage according to size, MIME validation, authorization, naming, metadata, deletion, orphan cleanup, download authorization, image processing and abuse prevention. 

For your particular situation:

```text
Frontend
   ↓
Cloudflare Worker API
   ↓
Upload Service
   ↓
SFTP
   ↓
Your 100GB Hosting
```

But there is an important technical issue:

### Cloudflare Workers should not be treated like a normal server with an SFTP client.

SFTP requires an appropriate SFTP-capable runtime/library or intermediary service, and Workers are not a conventional persistent Node server.

So I would use your cPanel/web-hosting environment as a **controlled media gateway**.

For example:

```text
Cloudflare Worker
       │
       │ authenticated upload request
       ▼
Hosting Upload Gateway
       │
       ▼
SFTP / local hosting storage
       │
       ▼
/media/
   ├── vendors/
   │    ├── vendor_001/
   │    │    ├── products/
   │    │    ├── services/
   │    │    ├── branding/
   │    │    └── documents/
```

The gateway should **never expose your SFTP credentials to the frontend**.

---

# 11. Media Architecture

I would actually create a dedicated media abstraction.

```text
Media Service

upload()
delete()
replace()
getUrl()
validate()
optimize()
generateThumbnail()
getMetadata()
```

Then the rest of the application doesn't care whether the storage is:

```text
SFTP
R2
local storage
another provider
```

Today:

```text
MediaService → SFTP
```

Later:

```text
MediaService → R2
```

without rewriting the entire application.

---

# 12. SFTP Storage Structure

I'd use something like:

```text
/app-storage/

    vendors/

        {vendor-id}/

            profile/

            branding/

            catalogue/

                products/

                    {product-id}/

                        original/
                        optimized/
                        thumbnails/

                services/

                courses/

                properties/

            documents/

            verification/

    platform/

        branding/

        system/

        exports/
```

The database stores metadata:

```text
media
-----
id
owner_id
entity_type
entity_id
storage_key
original_name
mime_type
extension
size
width
height
checksum
visibility
status
created_at
deleted_at
```

Never make the database responsible for storing the actual files.

---

# 13. Media Security

Uploads should go through server-side validation.

Check:

```text
MIME type
Extension
File signature
File size
Dimensions
Filename
Storage path
Ownership
Upload rate
```

And potentially:

```text
Image optimization
Thumbnail generation
EXIF stripping
Malware scanning where appropriate
```

The original filename should **not** become your storage filename.

Instead:

```text
8d92f2b7-4c5e-44a0-product.webp
```

This prevents collisions and reduces path manipulation problems.

---

# 14. Public Media vs Private Media

This distinction is very important.

### Public

Product images:

```text
/media/vendor123/products/product456/image.webp
```

These can be publicly accessible.

### Private

Payment proof:

```text
/vendor123/private/payment-proofs/...
```

These should **never be publicly accessible**.

Same for:

* identity/verification documents if you later support them
* invoices
* internal documents
* private exports
* subscription receipts

---

# 15. Vendor Registration

Registration should have a very simple flow.

```text
Create account
      ↓
Create business
      ↓
Choose business type
      ↓
Configure WhatsApp
      ↓
Choose subscription
      ↓
Payment
      ↓
Payment verification
      ↓
Account activated
```

Possible statuses:

```text
Pending registration
Pending payment
Payment submitted
Payment under review
Active
Suspended
Expired
Cancelled
Rejected
```

---

# 16. Manual Payment System

Since you currently want:

* bank transfer
* payment proof upload
* Paystack payment pages

build a **Payment Intent system**, not a payment-provider-specific system.

```text
Payment

id
vendor_id
subscription_id
amount
currency
method
reference
proof_media_id
status
submitted_at
verified_at
verified_by
rejection_reason
```

Payment methods:

```text
Bank Transfer
Paystack
Manual
```

Later you can add:

```text
Flutterwave
Moniepoint
OPay
Card
USSD
```

without redesigning the subscription system.

---

# 17. Payment Verification

Admin dashboard:

```text
Payment Review

Vendor:
ABC Fashion

Plan:
Business

Amount:
₦25,000

Method:
Bank Transfer

Proof:
[ View ]

Submitted:
10 Sep 2026

[ Approve ]
[ Reject ]
```

Approval should automatically:

```text
Payment → Verified
Subscription → Active
Vendor → Active
```

and generate an audit log.

---

# 18. Subscription Engine

Don't hard-code subscription rules.

Create:

```text
plans
plan_features
subscriptions
subscription_items
add_ons
usage_records
```

For example:

### Free

```text
1 catalogue
10 items
1 WhatsApp number
500MB media
Basic analytics
```

### Starter

```text
100 items
2 WhatsApp numbers
5GB media
Analytics
Custom branding
```

### Business

```text
Unlimited catalogue
5 WhatsApp numbers
20GB media
Advanced analytics
Offers
Custom domain
```

### Enterprise

```text
Custom
```

The exact prices can be decided later.

---

# 19. Usage-Based Monetization

This is where the platform becomes more powerful.

Don't monetize only subscriptions.

Track:

```text
Catalogue items
Storage
WhatsApp numbers
Staff accounts
Custom fields
Featured products
Custom domain
Analytics retention
Business locations
Automations
API access
```

Then:

> Base subscription + optional add-ons

For example:

```text
Business Plan
₦X/month

+ Extra WhatsApp number
+ Extra 10GB storage
+ Extra staff account
+ Custom domain
+ Featured listing
+ Advanced analytics
```

This is much more flexible.

---

# 20. Buyer Accounts

Buyer accounts should be **optional**.

A visitor should be able to use the platform without registration.

That's important.

### Guest

```text
Browse
↓
View product
↓
Click WhatsApp
```

No account required.

### Registered buyer

Gets:

```text
Favorites
Recently viewed
Saved businesses
Saved products
Inquiry history
Order/inquiry tracking
Notifications
Profile
```

But don't force buyer registration simply to contact a vendor.

---

# 21. Buyer Dashboard

Something like:

```text
My Account

❤️ Favorites

🏪 Saved businesses

💬 WhatsApp enquiries

🕘 Recently viewed

🔔 Notifications

⚙ Account settings
```

The buyer's WhatsApp number can optionally be associated with their account, but don't make that mandatory.

---

# 22. Discovery Marketplace

The platform itself can eventually become a marketplace.

Homepage:

```text
What are you looking for?

[ Search products, services, businesses... ]

Categories

Fashion
Technology
Education
Food
Beauty
Professional Services
Real Estate
Health
Events
Automotive
...
```

But these categories should be **administratively configurable**, not hardcoded.

---

# 23. Business Categories

Admin should be able to create:

```text
Category
Subcategory
Icon
Description
Catalogue types
Fields
SEO metadata
Status
Sort order
```

For example:

```text
Education

Allowed catalogue types:
✓ Courses
✓ Events
✓ Services
✓ Digital products
```

Or:

```text
Fashion

Allowed:
✓ Products
✓ Packages
✓ Offers
```

This is how you achieve your "usable for anything" requirement without making the database chaotic.

---

# 24. Dynamic Custom Fields

This is another major feature I recommend.

Suppose you create:

```text
Product
```

Core fields:

```text
Name
Description
Price
Images
WhatsApp CTA
```

Then an administrator can add:

```text
Color
Size
Material
Brand
Weight
Model
```

without changing the database schema every time.

Use a controlled custom-field system:

```text
field_definitions
field_options
entity_field_values
```

Supported field types:

```text
Text
Long text
Number
Currency
Boolean
Date
Time
Date/time
Select
Multi-select
Radio
Checkbox
URL
Email
Phone
Image
Video
File
Location
Rich text
```

But **validate these server-side**. Your master prompt explicitly emphasizes that client-side validation cannot replace backend validation. 

---

# 25. Catalogue Templates

The best architecture is:

```text
Business Type
      ↓
Catalogue Templates
      ↓
Fields
      ↓
Catalogue Items
```

For example:

```text
Business Type: Academy

Templates:

Course
Workshop
Bootcamp
Certification
Event
Instructor
```

Another:

```text
Business Type: Real Estate

Templates:

Property
Land
Rental
Commercial Space
Agent
```

This becomes a **configuration engine**, not just an e-commerce application.

---

# 26. Vendor Storefront Builder

Give vendors some control without turning this into Wix.

They could choose:

```text
Storefront style

Classic
Modern
Editorial
Minimal
Bold
Professional
```

Then configure:

```text
Logo
Cover
Colors
Typography
Sections
Featured items
About
Contact
Social links
```

Possibly:

```text
Drag sections

Hero
Featured Products
Categories
Services
Offers
About
Gallery
Testimonials
FAQ
Contact
```

---

# 27. Landing Page Sections

The vendor could activate/deactivate sections:

```text
✓ Hero
✓ Featured products
✓ Categories
✓ Services
✓ Courses
□ Testimonials
✓ Gallery
□ FAQ
✓ About
✓ Contact
✓ Location
```

This lets a **tech academy** look different from a **fashion store**.

---

# 28. Offers and Promotions

A vendor should be able to create:

```text
Discount
Bundle
Promotion
Limited-time offer
Featured product
New arrival
Clearance
```

For example:

```text
Web Development Course

₦100,000
₦75,000

Early registration ends:
30 September
```

The WhatsApp message can automatically include the offer.

---

# 29. Product Variants

For physical goods:

```text
Product
 ├── Size
 ├── Color
 ├── Material
 └── Variant
```

Example:

```text
T-Shirt

Black / Small
Black / Medium
Black / Large

White / Small
White / Medium
White / Large
```

The WhatsApp message can contain:

```text
Selected:
Colour: Black
Size: Large
Quantity: 2
```

---

# 30. Cart — But Not Traditional Checkout

I would actually consider a lightweight **WhatsApp Cart**.

A buyer can select:

```text
Laptop
Phone
Mouse
Keyboard
```

Then:

**Contact vendor on WhatsApp**

generates one message:

```text
Hello, I would like to enquire about these items:

1. HP Laptop × 1
2. Wireless Mouse × 2
3. Keyboard × 1

Estimated total: ₦XXX

Please confirm availability and final price.
```

That is extremely useful for WhatsApp-first commerce.

And still doesn't require WhatsApp Business API.

---

# 31. Vendor Lead Management

This is another feature worth adding.

Whenever somebody clicks WhatsApp:

```text
Lead generated
```

Vendor dashboard:

```text
WhatsApp Leads

New       14
Contacted 32
Interested 18
Converted 9
Lost       5
```

Vendor can manually mark:

```text
New
Contacted
Interested
Negotiating
Converted
Lost
```

This effectively gives vendors a lightweight CRM.

---

# 32. WhatsApp CTA Analytics

Track events such as:

```text
Product impression
Product view
WhatsApp button clicked
WhatsApp number selected
Cart created
WhatsApp cart clicked
```

Then:

```text
Product performance

HP Laptop
Views: 1,240
WhatsApp clicks: 87
Conversion to WhatsApp: 7%
```

Don't claim these are actual sales.

They are **platform-side engagement metrics**.

---

# 33. Vendor Analytics

Dashboard:

```text
Visitors
Catalogue views
Top products
Top services
WhatsApp clicks
Popular categories
Traffic sources
Device types
Location
```

Potentially:

```text
Today
7 days
30 days
90 days
Custom
```

---

# 34. Admin Panel

Admin should have broad CRUD, but permissions should still be granular.

Roles:

```text
Super Admin
Administrator
Finance Admin
Content Admin
Support Admin
Moderator
Analyst
```

Permissions:

```text
vendors.view
vendors.create
vendors.update
vendors.delete
vendors.suspend

catalogue.view
catalogue.moderate
catalogue.delete

payments.view
payments.verify
payments.reject

subscriptions.manage

categories.manage

settings.manage

analytics.view
audit_logs.view
```

Server-side authorization is mandatory; your master prompt specifically calls out IDOR, privilege escalation, ownership bypass and frontend-only authorization as things to audit. 

---

# 35. Admin Dashboard

```text
Platform Overview

Vendors
2,842

Active businesses
2,104

Buyers
18,420

Catalogue items
74,321

WhatsApp clicks
128,402

Revenue
₦X,XXX,XXX
```

Then:

```text
Pending

Payment verifications
Vendor approvals
Reported businesses
Reported products
Support tickets
Storage issues
```

---

# 36. Admin CRUD

Admin should be able to manage:

### Users

```text
Create
View
Edit
Suspend
Activate
Delete
Reset account state
```

### Vendors

```text
Create
Approve
Suspend
Activate
Edit
Delete
Impersonation/support access* 
```

If you implement impersonation, it must be heavily audited.

### Businesses

```text
Create
Edit
Verify
Suspend
Delete
```

### Catalogue

```text
Products
Services
Courses
Properties
Custom types
```

### Categories

Full CRUD.

### Plans

Full CRUD.

### Add-ons

Full CRUD.

### Payments

Full CRUD where appropriate.

### Subscriptions

Manage lifecycle.

### Reports

View and resolve.

### Platform settings

Full configuration.

---

# 37. Verification System

Businesses could have:

```text
Unverified
Pending verification
Verified
Rejected
Suspended
```

And potentially:

```text
Verified Business ✓
```

But don't allow arbitrary vendors to claim verification.

---

# 38. Reporting / Moderation

Users should be able to report:

```text
Business
Product
Service
Image
Content
Spam
Fraud
Misleading information
```

Admin gets:

```text
Reports

Open
Investigating
Resolved
Dismissed
```

---

# 39. Audit Logs

This is especially important because admins can manipulate payments, vendors and subscriptions.

Record:

```text
Actor
Action
Resource
Resource ID
Timestamp
IP/device metadata where appropriate
Before/after summary
```

Your master prompt similarly requires operational accountability through actor/action/resource/timestamp logging. 

---

# 40. Notification System

In-app notifications:

```text
Your payment has been approved.

Your subscription expires in 7 days.

Your business has been approved.

Your product was unpublished.

Your storage usage is almost full.
```

Possible future channels:

```text
Email
SMS
Push
```

But don't make these mandatory for V1.

---

# 41. Subscription Expiry

Automate:

```text
Active
   ↓
Expiring soon
   ↓
Expired
   ↓
Grace period
   ↓
Suspended
```

What happens to the storefront should be configurable.

For example:

### Expired

Public storefront:

```text
Business temporarily unavailable
```

rather than deleting everything.

This preserves data.

---

# 42. Data Lifecycle

Use proper states:

```text
Draft
Published
Unpublished
Archived
Deleted
```

Prefer soft deletion where appropriate.

Your supplied architecture guidance explicitly recommends thinking through creation → usage → modification → archival → deletion, including retention, recovery and orphan cleanup. 

---

# 43. Search

Global search:

```text
Search products
Search businesses
Search services
Search courses
Search categories
```

Filters:

```text
Category
Location
Price
Business
Catalogue type
Availability
Rating*
```

Don't add ratings until you actually have a legitimate review mechanism.

---

# 44. SEO

This application could have significant SEO potential because every public business and catalogue item can potentially have its own URL.

Example:

```text
/business/cyber-elias-academy

/business/abc-fashion

/business/abc-fashion/products/red-dress

/business/cyber-elias-academy/courses/web-development
```

Public pages should have:

* unique titles
* descriptions
* canonical URLs
* Open Graph
* structured data
* sitemap inclusion where appropriate
* optimized images
* breadcrumbs
* semantic HTML

Your master prompt treats SEO as a first-class architectural concern and specifically calls for legitimate Product, Service, Course, LocalBusiness, Organization and related structured data where appropriate. 

---

# 45. The Platform Should Be SEO-Aware of Catalogue Type

This is another advantage of the template architecture.

If:

```text
Catalogue Type = Product
```

generate Product schema where appropriate.

If:

```text
Catalogue Type = Course
```

generate Course schema.

If:

```text
Catalogue Type = Service
```

generate Service schema.

If:

```text
Catalogue Type = Event
```

generate Event schema.

Not every page should get every schema type.

---

# 46. Public Storefront vs Dashboard

I would treat them almost like two applications sharing the same backend.

```text
PUBLIC EXPERIENCE

/
├── Discover
├── Businesses
├── Categories
├── Products
├── Services
├── Courses
└── Business storefronts


VENDOR EXPERIENCE

/dashboard
├── Overview
├── Catalogue
├── Orders/Leads
├── WhatsApp
├── Media
├── Analytics
├── Storefront
├── Subscription
└── Settings


ADMIN EXPERIENCE

/admin
├── Overview
├── Users
├── Vendors
├── Catalogue
├── Categories
├── Payments
├── Subscriptions
├── Reports
├── Media
├── Analytics
├── Audit logs
└── Settings
```

---

# 47. Recommended Architecture

Given your stated preference, I would use:

```text
                 INTERNET
                     │
                     ▼
              ┌─────────────┐
              │   VERCEL    │
              │ React + Vite│
              │    MUI      │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ CLOUDFLARE  │
              │   WORKER    │
              │     API     │
              └──────┬──────┘
                     │
          ┌──────────┼───────────┐
          │          │           │
          ▼          ▼           ▼
        D1       Media API    KV*
     Database       │
                    ▼
               cPanel Hosting
                    │
                   SFTP
                    │
                    ▼
                 100GB
                STORAGE
```

This adapts the architecture in your master prompt rather than blindly copying its R2 recommendation. The prompt itself says to use only the infrastructure actually justified by the application. 

### Important:

I **would not introduce R2 just because the generic architecture recommends it**.

Your 100GB SFTP hosting is an explicit project requirement.

---

# 48. What I'd Actually Use from Cloudflare

### Workers

Definitely.

For:

* API
* authentication
* authorization
* business logic
* public API
* WhatsApp link generation
* payment verification endpoints
* media authorization
* analytics ingestion

### D1

Definitely.

For:

* users
* businesses
* catalogue
* categories
* subscriptions
* payments
* leads
* analytics summaries
* permissions
* settings

### KV

Optional.

Use only where there is a genuine caching/configuration need.

### Queues

Probably later.

Useful for:

```text
Media processing
Analytics aggregation
Notifications
Cleanup
```

### Cron

Useful.

For:

```text
Subscription expiry
Grace periods
Media cleanup
Analytics aggregation
Expired payment intents
Database maintenance
```

### Durable Objects

Probably **not needed initially**.

There is no reason to introduce them just because they exist.

---

# 49. Suggested Database Model

At the core:

```text
users
roles
permissions
user_roles

businesses
business_members
business_settings
business_categories

catalogue_types
catalogue_fields
catalogue_field_options

catalogue_items
catalogue_item_values
catalogue_categories
catalogue_media

media

whatsapp_numbers
whatsapp_routing_rules

plans
plan_features
subscriptions
subscription_addons
usage_records

payments
payment_proofs

buyers
favorites
recent_views

inquiries
inquiry_items
lead_statuses

offers
promotions

reviews
reports

notifications

audit_logs

analytics_events
analytics_daily

platform_settings
```

That gives you a strong foundation without turning everything into one giant `products` table.

---

# 50. Multi-Tenant Architecture

This should be multi-tenant from day one.

Conceptually:

```text
Platform
   │
   ├── Vendor A
   │      ├── Users
   │      ├── Catalogue
   │      ├── Media
   │      ├── WhatsApp
   │      └── Leads
   │
   ├── Vendor B
   │      ├── Users
   │      ├── Catalogue
   │      ├── Media
   │      ├── WhatsApp
   │      └── Leads
   │
   └── Vendor C
```

Every vendor-owned record must have proper ownership boundaries.

This is particularly important for preventing one vendor from accessing another vendor's data.

---

# 51. Vendor Team Members

Another feature I strongly recommend.

A business owner can eventually invite:

```text
Owner
Manager
Sales
Catalogue Manager
Support
Accountant
```

For example:

```text
Owner
 ├── Manager
 ├── Sales staff
 └── Catalogue staff
```

Each gets restricted permissions.

This becomes another monetizable feature:

> Additional staff accounts.

---

# 52. Custom Domain

Make this a premium feature.

Default:

```text
platform.com/business/abc
```

Premium:

```text
abc.com
```

or:

```text
shop.abc.com
```

This would make the product much more attractive to established businesses.

---

# 53. Vendor QR Code

Generate QR codes for:

```text
Business storefront
Product
Service
Course
Catalogue
WhatsApp contact
```

Example:

```text
Scan to view our catalogue
```

This is particularly useful for physical businesses.

---

# 54. Share Tools

Every public entity should have:

```text
Copy link
WhatsApp
Facebook
X
Telegram
Email
QR Code
```

The platform should also create attractive social preview metadata.

---

# 55. Vendor Import/Export

Very useful for real businesses.

Support:

```text
CSV import
CSV export
Catalogue export
Media export
```

Example:

> Upload 200 products from Excel.

The system validates them before importing.

---

# 56. Backup / Recovery

Admin should have:

```text
Database backups
Catalogue export
Business export
Configuration export
```

SFTP media backups should also be considered.

Don't make your 100GB storage the **only copy of irreplaceable business files** forever.

---

# 57. Storage Quotas

Because you have finite storage, the platform needs a quota system.

Example:

```text
Vendor:
Storage used: 4.2GB / 5GB
```

Warning:

```text
80% → Warning
90% → Critical
100% → Upload blocked
```

And admins can see:

```text
Total storage
Used
Available
Largest vendors
Orphaned files
Failed uploads
```

This becomes essential once you have many vendors.

---

# 58. Media Orphan Cleanup

Example:

Vendor uploads:

```text
image.jpg
```

Then abandons the product.

You shouldn't immediately delete the file because an upload may still be referenced.

Use:

```text
uploaded
↓
attached
↓
unused
↓
grace period
↓
cleanup
```

A scheduled cleanup process can remove genuinely orphaned media.

---

# 59. Vendor Onboarding Wizard

Since your target includes people who aren't technically sophisticated, I would make this one of the most polished parts of the product.

```text
STEP 1
Tell us about your business

STEP 2
What do you sell?

Products
Services
Courses
Appointments
Other

STEP 3
Add WhatsApp

STEP 4
Add your first item

STEP 5
Choose your storefront style

STEP 6
Publish
```

At the end:

> 🎉 Your storefront is live.

---

# 60. "Add Your First Product" Should Be Extremely Easy

Don't dump 40 fields on the user.

Start:

```text
Product name
Price
Photo
Description
WhatsApp number
```

Then:

**More options**

reveals:

```text
SKU
Category
Variants
Stock
Tags
SEO
Custom fields
```

This is especially important for the type of client you described.

---

# 61. AI Can Be Added Later

Don't make AI part of the core architecture yet.

But later:

```text
Write product description
Generate catalogue description
Improve title
Suggest category
Generate SEO metadata
Create WhatsApp message
```

could be excellent premium functionality.

---

# 62. "WhatsApp Message Builder"

This could actually become one of the platform's signature features.

Admin/vendor controls templates:

```text
Purchase enquiry
Service enquiry
Course registration
Booking enquiry
Property inspection
General enquiry
```

Then dynamic variables:

```text
{{business_name}}
{{item_name}}
{{price}}
{{quantity}}
{{variant}}
{{item_url}}
{{customer_name}}
```

Generated message:

```text
Hello {{vendor}}...

I'm interested in {{item}}...
```

---

# 63. Smart WhatsApp Routing

Eventually:

```text
Business
   │
   ├── Sales
   ├── Admissions
   ├── Support
   └── General
```

Rules:

```text
Category = Course
→ Admissions

Category = Product
→ Sales

Category = Support
→ Support
```

This makes the multiple-number monetization genuinely useful rather than artificial.

---

# 64. Buyer-to-Vendor Relationship

The platform should remain neutral.

The platform does **not** own the customer relationship.

The vendor owns:

```text
Business
Catalogue
WhatsApp numbers
Leads
Customers
```

The platform provides the infrastructure.

That is a strong value proposition.

---

# 65. Trust & Safety

Eventually add:

```text
Report vendor
Report product
Block vendor
Moderation
Verification
Suspension
Terms
Privacy
Content policy
```

And platform-level protections against:

* spam
* malicious uploads
* fake businesses
* abusive content
* fraudulent listings
* excessive automated requests

Your master prompt's security framework is directly relevant here, especially rate limiting for registration, uploads, public forms and sensitive APIs. 

---

# 66. Security Architecture

At minimum:

```text
Authentication
Authorization
Tenant isolation
RBAC
Rate limiting
CSRF protection where applicable
Secure cookies
Password hashing
Session management
Input validation
Upload validation
Path traversal protection
XSS protection
SQL injection protection
CORS policy
Audit logging
Webhook/payment verification
```

The platform should never trust:

```text
vendor_id
user_id
product_id
role
price
subscription status
```

coming from the browser.

The server determines those things.

---

# 67. Frontend Design Direction

I would **not** make this look like another generic Shopify clone.

The public experience should be:

```text
Modern
Immersive
Dynamic
Slick
Bespoke
Fast
Mobile-first
```

while the vendor dashboard should prioritize:

```text
Clarity
Simplicity
Speed
Confidence
```

Your supplied design guidance makes the same distinction: immersion should strengthen the product rather than distract from it, with usability, accessibility and performance taking priority. 

---

# 68. Public Homepage Concept

Something like:

```text
            DISCOVER
       BUSINESSES & SERVICES

     Find what you need.
     Talk directly to the business.

 [ Search products, services... ]

       Explore categories
```

Then visually dynamic business/catalogue discovery.

But don't overdo animation.

Your own design prompt correctly says the appropriate spectrum can range from minimal → polished → dynamic → immersive → cinematic → experimental depending on the product. 

For this platform I'd target:

> **Polished + Dynamic + Immersive**

rather than full cinematic.

---

# 69. Mobile Is Extremely Important

A huge portion of the target audience will likely access it through phones.

Therefore:

```text
Mobile-first
Touch-friendly
Fast-loading
Large WhatsApp CTA
Compressed images
Simple navigation
Sticky contact button
```

On a product page:

```text
[ Product gallery ]

HP Laptop
₦450,000

Available

Description...

[ 💬 Chat with vendor ]

Specifications...

[ 💬 Ask about this item ]
```

The WhatsApp action should be almost impossible to miss.

---

# 70. Accessibility

Don't let "immersive" become an excuse for bad usability.

Support:

* keyboard navigation
* semantic HTML
* focus states
* accessible forms
* contrast
* alt text
* reduced motion
* screen-reader labels

Your supplied design system explicitly requires these alongside immersive design. 

---

# 71. Recommended Product Architecture

I'd divide the system into these modules:

```text
IDENTITY
├── Authentication
├── Users
├── Roles
└── Permissions

BUSINESS
├── Businesses
├── Profiles
├── Team
├── Categories
└── Settings

CATALOGUE
├── Catalogue types
├── Fields
├── Items
├── Categories
├── Variants
├── Offers
└── Media

WHATSAPP
├── Numbers
├── Routing
├── Templates
├── Deeplinks
└── Analytics

BUYERS
├── Accounts
├── Favorites
├── Views
└── Inquiries

CRM
├── Leads
├── Lead statuses
├── Notes
└── Follow-up

BILLING
├── Plans
├── Subscriptions
├── Add-ons
├── Payments
└── Payment verification

ANALYTICS
├── Events
├── Views
├── WhatsApp clicks
├── Conversion metrics
└── Reports

MEDIA
├── Upload
├── SFTP
├── Processing
├── Metadata
└── Cleanup

ADMIN
├── Users
├── Businesses
├── Payments
├── Catalogue
├── Moderation
├── Reports
├── Settings
└── Audit

SEO
├── Metadata
├── Sitemap
├── Structured data
├── Canonicals
└── OpenGraph
```

---

# 72. MVP vs Full Platform

I wouldn't try to build everything simultaneously.

## Phase 1 — Core MVP

```text
✓ Vendor registration
✓ Authentication
✓ Business profile
✓ Subscription plans
✓ Manual payment
✓ Payment proof
✓ Admin approval
✓ Catalogue
✓ Dynamic catalogue types
✓ Product/service fields
✓ Media upload
✓ SFTP storage
✓ WhatsApp numbers
✓ WhatsApp deeplinks
✓ Public storefront
✓ Public product pages
✓ Basic buyer accounts
✓ Favorites
✓ Basic analytics
✓ Admin dashboard
✓ CRUD
✓ RBAC
✓ Audit logs
```

That's already a serious platform.

---

# 73. Phase 2

```text
✓ Multiple staff
✓ Lead management
✓ WhatsApp templates
✓ Smart routing
✓ WhatsApp cart
✓ Offers
✓ Variants
✓ Import/export
✓ Advanced analytics
✓ QR codes
✓ Reviews
✓ Reporting/moderation
✓ Better search
```

---

# 74. Phase 3

```text
✓ Custom domains
✓ Advanced storefront builder
✓ AI assistance
✓ More payment providers
✓ Automated billing
✓ Notifications
✓ Advanced CRM
✓ Vendor API
✓ Integrations
✓ Marketplace discovery
```

---

# 75. Phase 4

Eventually this could become:

```text
WhatsApp-first Business Platform

             PLATFORM
                 │
       ┌─────────┼─────────┐
       │         │         │
   Storefront   CRM    Discovery
       │         │         │
   Catalogue   Leads    Marketplace
       │         │         │
       └─────────┼─────────┘
                 │
              WhatsApp
```

That is much bigger than simply:

> "A website with a WhatsApp button."

---

# 76. One Particularly Important Product Decision

I would make the platform **catalogue-first rather than e-commerce-first**.

Because your client could be selling:

```text
a physical product
```

but another could be selling:

```text
a service
```

and another:

```text
a course
```

and another:

```text
an event
```

and another:

```text
a property
```

The common denominator is:

> **A business wants to publicly present something it offers and turn interest into a WhatsApp conversation.**

That is the real product.

---

# 77. The Core Data Relationship

The conceptual model becomes:

```text
USER
 │
 └── BUSINESS
       │
       ├── BUSINESS TYPE
       │
       ├── CATALOGUE
       │     │
       │     ├── ITEM
       │     │    ├── CORE FIELDS
       │     │    ├── CUSTOM FIELDS
       │     │    ├── MEDIA
       │     │    ├── VARIANTS
       │     │    └── OFFERS
       │     │
       │     └── ...
       │
       ├── WHATSAPP NUMBERS
       │
       ├── TEAM
       │
       ├── SUBSCRIPTION
       │
       └── ANALYTICS
```

And:

```text
BUYER
  │
  ├── VIEW
  ├── FAVORITE
  └── WHATSAPP INQUIRY
             │
             ▼
          BUSINESS
```

---

# 78. My Recommended Final Positioning

I wouldn't market it as:

> "An online store."

I'd make the underlying product:

> **A simple business storefront and catalogue platform that connects customers directly to businesses through WhatsApp.**

Then the industry disappears.

A vendor doesn't need to ask:

> "Is this an e-commerce platform?"

They simply select:

> **What do you offer?**

and the platform configures itself around their answer.

That is the architectural idea I think makes your concept genuinely scalable.

---

## 79. And Your Existing Master Prompt Should Become the Engineering Constitution

I would actually **reuse your uploaded master prompt as the engineering operating system for this project**, but modify the architecture-specific sections so that they don't blindly require R2 when you've deliberately chosen SFTP.

In particular, retain its principles around:

* evidence-driven engineering
* feature tracing
* full CRUD auditing
* server-side authorization
* security
* data lifecycle
* API contract governance
* performance
* accessibility
* SEO
* immersive design
* testing
* deployment validation
* documentation
* second/third-order analysis

Those principles are highly appropriate for this application. The prompt's execution order also explicitly calls for inventory → product reconstruction → architecture → security → UX → SEO → testing → re-audit → deployment validation, which is a very good development workflow for this project. 

### One change I'd make to it:

Replace the generic:

```text
OBJECT / FILE STORAGE
→ Cloudflare R2
```

with:

```text
OBJECT / FILE STORAGE
→ SFTP-backed media service
→ Existing 100GB hosting

Cloudflare R2
→ Optional future storage provider
→ Only introduce if justified
```

That keeps your architecture aligned with your actual business economics.

---

# 80. The Final Product in One Diagram

```text
                         PLATFORM
                            │
             ┌──────────────┼──────────────┐
             │              │              │
          BUYERS          VENDORS         ADMIN
             │              │              │
             │              │              │
          Discover       Dashboard       Control
             │              │              │
             │         ┌────┼────┐          │
             │         │    │    │          │
             │      Catalogue CRM Billing    │
             │         │    │    │          │
             │         └────┼────┘          │
             │              │              │
             └──────────────┼──────────────┘
                            │
                        STOREFRONT
                            │
                 ┌──────────┼──────────┐
                 │          │          │
              Products   Services   Courses
                 │          │          │
                 └──────────┼──────────┘
                            │
                       ITEM PAGE
                            │
                     [ BUY / ENQUIRE ]
                            │
                            ▼
                       WHATSAPP
                            │
                    Prefilled message
                            │
                    Product information
                            │
                    Product page URL
                            │
                            ▼
                         VENDOR
```

And underneath:

```text
                 CLOUDFLARE WORKER
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
            D1         KV*       APIs
                                  │
                                  ▼
                           MEDIA SERVICE
                                  │
                                  ▼
                              SFTP HOST
                                  │
                              100GB MEDIA
```

That, in my view, is the **right foundation** for what you're trying to build: not a niche store, not a conventional marketplace, and not a WhatsApp CRM, but a **configurable multi-tenant business storefront/catalogue SaaS with WhatsApp as the conversion channel**.

And importantly, it stays simple enough that the person you described — someone who barely knows anything beyond WhatsApp — can actually use it.
