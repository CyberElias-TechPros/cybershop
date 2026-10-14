/**
 * Help Centre content. One catalogue drives /help (index + search) and
 * /help/[slug] (article pages), so a guide is written once and linked
 * from the footer, menus, dashboard and onboarding.
 *
 * Honesty rules (same as the rest of the product): CyberShop has no
 * checkout and never holds buyers' money; sellers are paid directly.
 * "Verified ID" means the person's identity was checked; "Featured"
 * means a paid highlight. Guides must never promise otherwise.
 */

export type GuideAudience = 'buying' | 'selling' | 'account' | 'admin';

export interface GuideSection {
  heading: string;
  body?: string[];
  steps?: string[];
  tips?: string[];
  warning?: string;
}

export interface Guide {
  slug: string;
  title: string;
  icon: string;
  audience: GuideAudience;
  summary: string;
  minutes: number;
  keywords: string[];
  /** Deep link into the app this guide is about. */
  cta?: { label: string; href: string };
  sections: GuideSection[];
  related: string[];
}

export const GUIDE_GROUPS: { id: GuideAudience; title: string; blurb: string }[] = [
  { id: 'buying', title: 'Buying on CyberShop', blurb: 'Find things, talk to real sellers, and buy safely — no checkout, no surprises.' },
  { id: 'selling', title: 'Selling on CyberShop', blurb: 'Open a storefront, list what you sell, and turn chats into customers.' },
  { id: 'account', title: 'Your account', blurb: 'Account types, security, and the settings that keep you in control.' },
  { id: 'admin', title: 'Running CyberShop (admin)', blurb: 'Moderation, money and platform health for the team operating the marketplace.' },
];

export const AUDIENCE_LABEL: Record<GuideAudience, string> = {
  buying: 'Buyers',
  selling: 'Sellers',
  account: 'Everyone',
  admin: 'Admins',
};

export const GUIDES: Guide[] = [
  // ------------------------------------------------------------- BUYING
  {
    slug: 'getting-started',
    title: 'Getting started: how CyberShop works',
    icon: '👋',
    audience: 'buying',
    summary: 'The 2-minute tour: what CyberShop is, how buying actually happens, and what to do first.',
    minutes: 2,
    keywords: ['start', 'new', 'how it works', 'begin', 'tour', 'what is', 'marketplace'],
    cta: { label: 'Start shopping', href: '/listings' },
    related: ['finding-products', 'contacting-sellers', 'buying-safely'],
    sections: [
      {
        heading: 'The big idea',
        body: [
          'CyberShop is a marketplace of independent Nigerian stores. Unlike a normal online shop, there is no checkout and no CyberShop payment page: you browse here, then talk to the seller directly on WhatsApp and agree payment and delivery (or pickup) with them.',
          'That keeps things personal — you can ask questions, negotiate, confirm stock and agree how you will receive the item before any money moves.',
        ],
      },
      {
        heading: 'Your first five minutes',
        steps: [
          'Browse the shop or tap Categories in the top bar to see everything for sale.',
          'Open anything you like — every listing names the store selling it, its price and stock.',
          'Tap "Enquire on WhatsApp" (or add things to the WhatsApp cart) to start a chat with the seller.',
          'Agree price, delivery or pickup in the chat — then pay the seller directly.',
          'Come back and leave a review so the next buyer knows how it went.',
        ],
        tips: ['You can browse everything without an account. An account only adds saved items, alerts and an enquiry history.'],
      },
      {
        heading: 'The three badges, honestly',
        steps: [
          '✓ Verified ID — that person\'s identity has been checked by CyberShop.',
          'Featured — the seller paid to highlight that listing. It says nothing about quality.',
          '★ Rating — shown only when real buyers have left reviews. No reviews, no stars.',
        ],
        warning: 'CyberShop never holds your money and cannot refund you. Always follow the buying-safely guide before paying a seller.',
      },
    ],
  },
  {
    slug: 'finding-products',
    title: 'Finding products: search, categories & filters',
    icon: '🔎',
    audience: 'buying',
    summary: 'Search the whole market, browse categories, and narrow results by price, city and stock.',
    minutes: 3,
    keywords: ['search', 'browse', 'categories', 'filter', 'sort', 'price', 'city', 'find'],
    cta: { label: 'Search all listings', href: '/listings' },
    related: ['getting-started', 'saved-and-alerts', 'contacting-sellers'],
    sections: [
      {
        heading: 'Three ways to look',
        steps: [
          'Search — the search bar on the shop page (or the 🔎 icon) looks across every listing and store.',
          'Categories — the Categories menu groups the market (fashion, food, gadgets, courses, property and more). Inside a category you see its listings first, then its stores.',
          'Businesses — the Businesses page lists every storefront if you prefer to shop store-by-store.',
        ],
      },
      {
        heading: 'Narrow it down',
        body: ['On the listings page you can filter by category, city, price range and availability, and sort by newest or price. "In stock only" hides anything the seller has marked out of stock — though it is still worth asking on WhatsApp, as sellers sometimes restock faster than they update.'],
        tips: ['Prices here are the seller\'s listed price. Final price, delivery fees and discounts are agreed in the WhatsApp chat.'],
      },
      {
        heading: 'Can\'t find it?',
        body: ['Try fewer or different words ("shoes" finds more than "red Italian leather shoes"), check another city, or save the search — CyberShop can alert you when a match appears. See the saved items & alerts guide.'],
      },
    ],
  },
  {
    slug: 'contacting-sellers',
    title: 'Contacting sellers & enquiries',
    icon: '💬',
    audience: 'buying',
    summary: 'Start a WhatsApp chat, send an enquiry, and keep track of every conversation.',
    minutes: 3,
    keywords: ['whatsapp', 'enquire', 'enquiry', 'message', 'chat', 'contact', 'seller', 'reply'],
    cta: { label: 'Browse listings', href: '/listings' },
    related: ['getting-started', 'whatsapp-cart', 'buying-safely'],
    sections: [
      {
        heading: 'Start a chat',
        steps: [
          'Open the listing (or the store) and tap "Enquire on WhatsApp".',
          'CyberShop prepares a message naming the exact item — you can edit it before sending.',
          'Send it. The conversation continues in your WhatsApp with the seller directly.',
        ],
        body: ['Sellers often also share quick offers and answers in their CyberShop inbox, so an enquiry can continue in either place.'],
      },
      {
        heading: 'Keep track of enquiries',
        body: [
          'If you enquired without an account, keep the private inbox link CyberShop gives you — it is your key to that conversation thread, so do not share it publicly.',
          'With a free buyer account, every enquiry is listed under Account → Enquiries, alongside anything you have saved.',
        ],
        tips: ['Ask about stock, final price, delivery options and timing before paying. A good seller answers clearly — vague answers are a warning sign.'],
      },
      {
        heading: 'No reply?',
        body: ['Give it a little time (sellers may be with customers), then try another store selling the same thing. Never send money to "hold" an item for a seller who has gone quiet — see buying safely.'],
      },
    ],
  },
  {
    slug: 'whatsapp-cart',
    title: 'The WhatsApp cart: ask about everything at once',
    icon: '🧺',
    audience: 'buying',
    summary: 'Collect items from one store and send a single tidy WhatsApp message instead of five separate chats.',
    minutes: 2,
    keywords: ['cart', 'basket', 'multiple', 'items', 'order', 'checkout'],
    cta: { label: 'Open your cart', href: '/cart' },
    related: ['contacting-sellers', 'saved-and-alerts', 'buying-safely'],
    sections: [
      {
        heading: 'How it works',
        steps: [
          'As you browse, add items to the cart — each item remembers which store sells it.',
          'Open the cart from the top bar. Items are grouped by store.',
          'For each store, tap the WhatsApp button once: one message lists everything you want from that store.',
          'Agree prices, delivery and payment with each seller in their chat.',
        ],
      },
      {
        heading: 'Good to know',
        body: [
          'The cart is not a checkout: nothing is reserved and nothing is paid on CyberShop. Stock and final prices are confirmed by the seller in chat.',
          'Your cart is saved on this device, so you can build it over a few visits.',
        ],
        tips: ['Buying several things from one store? The cart message is the fastest way to ask for a bundle price.'],
      },
    ],
  },
  {
    slug: 'saved-and-alerts',
    title: 'Saved items, saved stores & search alerts',
    icon: '🔖',
    audience: 'buying',
    summary: 'Bookmark things you love, follow stores, and get alerted when a saved search finds a match.',
    minutes: 3,
    keywords: ['save', 'saved', 'bookmark', 'favourite', 'alert', 'alerts', 'notify', 'follow'],
    cta: { label: 'View saved items', href: '/saved' },
    related: ['finding-products', 'your-account', 'reviews'],
    sections: [
      {
        heading: 'Save anything',
        steps: [
          'Tap the save/bookmark on any listing to keep it.',
          'On a store page, save the store itself to find it again quickly.',
          'Everything you save lives under Saved (top bar) and in your account.',
        ],
      },
      {
        heading: 'Alerts for things that don\'t exist yet',
        steps: [
          'Run a search on the listings page.',
          'Tap "Save search" and give it a name if you like.',
          'When a new listing matches, it appears under Account → Alerts.',
        ],
        tips: ['Alerts work best with a free buyer account, so they survive across devices. Guest saves live on this device only.'],
      },
    ],
  },
  {
    slug: 'reviews',
    title: 'Reviews & ratings: how they work',
    icon: '⭐',
    audience: 'buying',
    summary: 'Leave a review after you buy, and read ratings the honest way.',
    minutes: 2,
    keywords: ['review', 'rating', 'stars', 'feedback', 'rate'],
    cta: { label: 'Your enquiries', href: '/account/enquiries' },
    related: ['buying-safely', 'grow-with-reviews', 'contacting-sellers'],
    sections: [
      {
        heading: 'Leave a review',
        steps: [
          'Buy (or seriously enquire) first — reviews are tied to real interactions.',
          'Open the store or find it in your enquiries and choose to review.',
          'Pick a star rating, say what actually happened, submit.',
        ],
      },
      {
        heading: 'Reading ratings',
        body: [
          'A store only shows stars once real reviews exist — "no reviews yet" is information too, not a red flag by itself. A new, careful seller may simply be new.',
          'Read the words, not just the number: how the seller communicated, whether the item matched its photos, and how delivery went.',
        ],
        tips: ['Reviews help good sellers grow and warn others away from bad ones. Two honest sentences beat ten empty words.'],
      },
    ],
  },
  {
    slug: 'buying-safely',
    title: 'Buying safely on CyberShop',
    icon: '🛡️',
    audience: 'buying',
    summary: 'The short safety routine: talk first, verify second, pay last — and never pay to "hold" an item.',
    minutes: 4,
    keywords: ['safe', 'safety', 'scam', 'fraud', 'deposit', 'pay', 'payment', 'verify', 'trust'],
    cta: { label: 'Read the full safety guide', href: '/safety' },
    related: ['getting-started', 'contacting-sellers', 'jobs'],
    sections: [
      {
        heading: 'The routine: talk, verify, pay — in that order',
        steps: [
          'Talk first: ask real questions on WhatsApp. Scammers dodge specifics.',
          'Verify second: check for the ✓ Verified ID badge, read reviews, and prefer pickup or a public meetup for expensive items.',
          'Pay last: only once you are confident — ideally on delivery or in person.',
        ],
      },
      {
        heading: 'Never do these',
        steps: [
          'Never pay a "deposit to hold" an item to someone you have not verified.',
          'Never move the conversation off WhatsApp into secrecy, or rush because "someone else is about to pay".',
          'Never pay CyberShop — we have no checkout. Anyone asking you to pay "CyberShop" directly is impersonating us.',
        ],
        warning: 'CyberShop does not hold money, offer escrow, or guarantee refunds. Money goes from you to the seller, so the verify step is the protection.',
      },
      {
        heading: 'Something went wrong?',
        body: ['Report the store or listing (report links are on every store and the contact page), keep your chat screenshots, and contact Support. Reports go to the admin moderation queue.'],
      },
    ],
  },
  {
    slug: 'jobs',
    title: 'Finding jobs (and spotting job scams)',
    icon: '💼',
    audience: 'buying',
    summary: 'Browse genuine openings and recognise the fake ones instantly.',
    minutes: 3,
    keywords: ['jobs', 'work', 'hiring', 'vacancy', 'career', 'apply'],
    cta: { label: 'Browse jobs', href: '/jobs' },
    related: ['buying-safely', 'contacting-sellers'],
    sections: [
      {
        heading: 'How jobs work here',
        body: ['Businesses on CyberShop post openings on the Jobs page. Applying works like buying: open the post, then contact the business on WhatsApp to introduce yourself and share your CV.'],
        steps: [
          'Open Jobs and find a role that fits.',
          'Check the business behind it — has a storefront, reviews, a Verified ID badge?',
          'Message them on WhatsApp with a short introduction.',
        ],
      },
      {
        heading: 'The job-scam checklist',
        steps: [
          'A real employer never charges you a "registration", "form" or "training" fee.',
          'Salaries far above market for vague duties are bait.',
          'Interviews happen on calls or in person — not by buying gift cards or crypto.',
        ],
        warning: 'If a "job" asks you to pay anything at any point, stop and report it. Legitimate employers pay you — never the reverse.',
      },
    ],
  },

  // ------------------------------------------------------------ SELLING
  {
    slug: 'open-storefront',
    title: 'Open your storefront (seller onboarding)',
    icon: '🏪',
    audience: 'selling',
    summary: 'From zero to a live store: create the account, pick a plan, and publish your first stall.',
    minutes: 5,
    keywords: ['sell', 'register', 'vendor', 'open', 'store', 'start', 'onboarding', 'plan', 'sign up seller'],
    cta: { label: 'Open a storefront', href: '/register' },
    related: ['plans-and-billing', 'storefront-design', 'add-products'],
    sections: [
      {
        heading: 'Step by step',
        steps: [
          'Tap "Sell on CyberShop" (or Open a storefront) and register as a seller: business name, what you offer, your WhatsApp number, email and password.',
          'Verify your email if asked — it keeps your account recoverable.',
          'Onboarding asks you to choose a plan. The Free plan needs no payment at all; paid plans can be activated instantly or by bank transfer with proof.',
          'While a paid plan is being verified, your dashboard shows the waiting state — you can still prepare your catalogue.',
          'Once active, add your first items and share your store link everywhere.',
        ],
        tips: ['Your WhatsApp number is how buyers reach you — use the number you actually answer on.'],
      },
      {
        heading: 'What you get',
        body: ['Every plan includes your storefront page, catalogue, WhatsApp enquiries and leads inbox. Paid plans raise listing limits and unlock extras like featured listings, recorded deposits and custom domains. The full comparison lives on the Sell page and in the plans & billing guide.'],
      },
    ],
  },
  {
    slug: 'storefront-design',
    title: 'Design your storefront: theme, logo & story',
    icon: '🎨',
    audience: 'selling',
    summary: 'Pick a theme that matches your trade, add your logo and cover, set hours and answer questions before they are asked.',
    minutes: 4,
    keywords: ['theme', 'design', 'logo', 'cover', 'brand', 'hours', 'faq', 'sections', 'storefront', 'settings'],
    cta: { label: 'Open storefront settings', href: '/dashboard/settings' },
    related: ['open-storefront', 'media-library', 'add-products'],
    sections: [
      {
        heading: 'Choose your theme',
        steps: [
          'Go to Dashboard → Settings → Storefront.',
          'Leave the theme on Auto and CyberShop matches it to your trade — or pick one yourself: Boutique, Kitchen, Gadget Hub, Academy, Property or General Store.',
          'Your explicit choice always wins over Auto.',
        ],
        body: ['Themes change your hero glow, colours and even the catalogue heading ("The Menu", "Courses & Programmes", "The Collection"…). The platform header, trust badges and the WhatsApp button never change colour — buyers should always recognise them.'],
      },
      {
        heading: 'Logo, cover and story',
        steps: [
          'Upload a clear logo (square works best) and a cover photo that shows your best work.',
          'Write a short description: what you sell, where you are, and why buyers choose you.',
          'Add opening hours so buyers know when to expect a reply.',
          'Turn on store sections and FAQs to answer "do you deliver?" before it is asked.',
        ],
        tips: ['Real photos of your real products beat stock images every time — buyers are one tap from asking you about them.'],
      },
    ],
  },
  {
    slug: 'add-products',
    title: 'Add products & services to your catalogue',
    icon: '📦',
    audience: 'selling',
    summary: 'List what you sell with photos, honest prices and stock — the way buyers actually browse.',
    minutes: 4,
    keywords: ['add', 'product', 'listing', 'catalogue', 'catalog', 'item', 'price', 'stock', 'photos', 'service', 'course'],
    cta: { label: 'Open your catalogue', href: '/dashboard/catalog' },
    related: ['open-storefront', 'media-library', 'leads-and-inbox'],
    sections: [
      {
        heading: 'Add an item',
        steps: [
          'Dashboard → Catalogue → New item.',
          'Name it the way a buyer would search for it ("Ankara gown — ready made", not "Product 12").',
          'Add clear photos, a real price, and your stock level.',
          'Write a short description: sizes, colours, what is included, delivery options.',
          'Save — it appears on your storefront and in the market immediately.',
        ],
      },
      {
        heading: 'Keep it trustworthy',
        steps: [
          'Mark items out of stock instead of deleting them — buyers can still ask, and your store looks alive.',
          'Update prices when they change; a chat that starts with "price has changed" loses sales.',
          'Use segments (sections) if you sell different kinds of things, so your catalogue stays browsable.',
        ],
        tips: ['Listings with photos and a price get contacted. Listings with "DM for price" mostly get scrolled past.'],
      },
    ],
  },
  {
    slug: 'leads-and-inbox',
    title: 'Leads, inbox & offers: turning chats into sales',
    icon: '📥',
    audience: 'selling',
    summary: 'Every enquiry is a lead. See them, reply fast, and make offers that close the sale.',
    minutes: 4,
    keywords: ['leads', 'inbox', 'enquiries', 'reply', 'offers', 'discount', 'customers', 'messages'],
    cta: { label: 'Open your leads', href: '/dashboard/leads' },
    related: ['whatsapp-for-business', 'analytics', 'grow-with-reviews'],
    sections: [
      {
        heading: 'Where enquiries land',
        body: ['When a buyer enquires, it becomes a lead in Dashboard → Leads and a thread in your Inbox; the chat itself continues on WhatsApp. The badge on Leads shows how many are waiting — treat it like a shop bell.'],
        steps: [
          'Check Leads daily; newest and unanswered sit at the top.',
          'Open a lead to see exactly which item they asked about.',
          'Reply on WhatsApp from the lead, and keep the thread tidy in the Inbox.',
        ],
      },
      {
        heading: 'Make an offer',
        steps: [
          'Dashboard → Offers → set an amount off and publish.',
          'Share the offer with a lead who is hesitating, or feature it on your store.',
          'Offers are your words to honour — only publish discounts you will actually give.',
        ],
        tips: ['Speed is the whole game: the first seller to answer clearly usually makes the sale. Templates (next guide) make that effortless.'],
      },
    ],
  },
  {
    slug: 'whatsapp-for-business',
    title: 'WhatsApp numbers & message templates',
    icon: '📱',
    audience: 'selling',
    summary: 'Add the numbers buyers can reach, and save reply templates so every answer is fast and consistent.',
    minutes: 3,
    keywords: ['whatsapp', 'number', 'templates', 'quick reply', 'message', 'phone'],
    cta: { label: 'WhatsApp settings', href: '/dashboard/whatsapp' },
    related: ['leads-and-inbox', 'open-storefront'],
    sections: [
      {
        heading: 'Your numbers',
        steps: [
          'Dashboard → WhatsApp → add each number buyers may message, with a label like "Sales" or "Support".',
          'The first/primary number is the one enquiry buttons use.',
          'Changed phones? Update here first — every button on your store follows.',
        ],
      },
      {
        heading: 'Templates',
        body: ['Templates are pre-written answers to the questions you get daily — greeting, price confirmation, delivery info, closing thanks. Create them under Dashboard → Templates; you can target one to a type of item or keep it general. When a lead comes in, start from the template and personalise one line.'],
        tips: ['Write templates the way you actually talk. Buyers can smell a robot, and on WhatsApp, trust is the product.'],
      },
    ],
  },
  {
    slug: 'plans-and-billing',
    title: 'Plans, add-ons & billing',
    icon: '💳',
    audience: 'selling',
    summary: 'What each plan includes, paying by card or transfer, receipts, and add-ons like Featured and deposits.',
    minutes: 4,
    keywords: ['plan', 'billing', 'price', 'pay', 'subscription', 'receipt', 'upgrade', 'addon', 'featured', 'deposit'],
    cta: { label: 'Plan & billing', href: '/dashboard/billing' },
    related: ['open-storefront', 'custom-domain', 'get-verified'],
    sections: [
      {
        heading: 'Plans in one breath',
        body: ['Start Free — no payment, a real storefront. Paid plans raise your listing limits and unlock add-ons. Live prices are always on the Sell page and in Dashboard → Plan & billing; this guide will never quote a number that can go stale.'],
        steps: [
          'Compare plans under Plan & billing (or /sell before you register).',
          'Pay by card (instant) or bank transfer (upload proof; activation follows verification).',
          'Download receipts for every payment from the same page.',
        ],
      },
      {
        heading: 'Add-ons worth knowing',
        steps: [
          'Featured listings — pay to highlight an item. Honest label: buyers see it is Featured, and it is purely visibility.',
          'Recorded deposits (add-on) — when a buyer pays you a deposit directly, record it under Deposits so both sides have a paper trail. CyberShop never touches that money.',
          'Custom domain (add-on) — your store on your own web address. See the custom domain guide.',
        ],
        warning: 'CyberShop is not a bank and never holds deposits or buyer payments. Deposits are paid to you and merely recorded here.',
      },
    ],
  },
  {
    slug: 'get-verified',
    title: 'Get the ✓ Verified ID badge',
    icon: '✅',
    audience: 'selling',
    summary: 'Verify your identity once and every ad you post carries the badge buyers look for.',
    minutes: 3,
    keywords: ['verified', 'verification', 'id', 'badge', 'identity', 'trust', 'kyc'],
    cta: { label: 'Start verification', href: '/dashboard/verification' },
    related: ['buying-safely', 'grow-with-reviews', 'plans-and-billing'],
    sections: [
      {
        heading: 'How it works',
        steps: [
          'Dashboard → Verification.',
          'Submit your ID details and a note for reviewers (ID type, full name exactly as on the ID).',
          'Reviewers check it; track the request status on the same page.',
          'Once approved, the ✓ Verified ID badge appears on your ads and storefront.',
        ],
      },
      {
        heading: 'What the badge does (and doesn\'t) mean',
        body: ['It means CyberShop checked that you are who you say you are — the single strongest trust signal on the platform. It does not guarantee any individual sale; your reviews and how you handle chats still do that work.'],
        tips: ['Make sure the name on your ID, your account and your store tell the same story. Mismatches slow reviews down.'],
      },
    ],
  },
  {
    slug: 'grow-with-reviews',
    title: 'Reviews & ratings for sellers',
    icon: '🌟',
    audience: 'selling',
    summary: 'Earn stars the only way they exist here: real buyers, real experiences.',
    minutes: 3,
    keywords: ['reviews', 'ratings', 'stars', 'reputation', 'feedback'],
    cta: { label: 'Your reviews', href: '/dashboard/reviews' },
    related: ['reviews', 'get-verified', 'leads-and-inbox'],
    sections: [
      {
        heading: 'How your rating is built',
        body: ['Buyers review you after enquiring or buying. Your store shows stars only when reviews exist — no reviews means no rating, never a fake one. Dashboard → Reviews shows everything said about you.'],
      },
      {
        heading: 'Earn more (and better) reviews',
        steps: [
          'After a successful sale, politely ask the buyer to leave a review — happy customers usually just need the nudge.',
          'Ship/deliver what the photos promised; most bad reviews are about surprises.',
          'Answer every review, including the unfair ones, calmly and briefly. Future buyers read your replies.',
        ],
        tips: ['Never buy or fake reviews. A wiped rating costs far more than a slow, honest one earns.'],
      },
    ],
  },
  {
    slug: 'analytics',
    title: 'Read your analytics: from views to WhatsApp',
    icon: '📊',
    audience: 'selling',
    summary: 'See what buyers look at, what they tap, and where interest dies — then fix the right thing.',
    minutes: 3,
    keywords: ['analytics', 'stats', 'views', 'clicks', 'traffic', 'performance', 'seen'],
    cta: { label: 'Open analytics', href: '/dashboard/analytics' },
    related: ['add-products', 'leads-and-inbox', 'storefront-design'],
    sections: [
      {
        heading: 'The one funnel that matters',
        body: ['Your analytics follow buyers from viewing a listing to tapping WhatsApp. Each drop-off point tells a different story:'],
        steps: [
          'Views but no taps → photos, title or price are not convincing. Improve those first.',
          'Taps but no sales → the chat experience: reply speed, clarity, delivery offer.',
          'No views at all → your titles do not match what buyers search for; rename like a buyer.',
        ],
      },
      {
        heading: 'Make it a habit',
        body: ['Glance weekly, change one thing at a time, and watch the next week. Small, steady fixes compound — that is the entire secret of the stores at the top of your category.'],
      },
    ],
  },
  {
    slug: 'team-and-staff',
    title: 'Team & staff access',
    icon: '👥',
    audience: 'selling',
    summary: 'Invite staff to help run the store without sharing your password.',
    minutes: 3,
    keywords: ['team', 'staff', 'invite', 'member', 'access', 'help', 'assistant'],
    cta: { label: 'Manage your team', href: '/dashboard/team' },
    related: ['security-2fa', 'your-account'],
    sections: [
      {
        heading: 'Invite your people',
        steps: [
          'Dashboard → Team → invite by email.',
          'They accept from the invite link and get their own login.',
          'Pending invites sit on the same page until accepted — resend or revoke anytime.',
        ],
      },
      {
        heading: 'Stay in control',
        body: ['Everyone signs in as themselves, so you always know who did what, and removing someone ends their access instantly without a password change circus. Your account stays the owner account — guard it with two-factor authentication.'],
        warning: 'Never share your owner password with staff. If you have already, change it and turn on 2FA today (see the security guide).',
      },
    ],
  },
  {
    slug: 'custom-domain',
    title: 'Put your store on your own domain',
    icon: '🌐',
    audience: 'selling',
    summary: 'With the Custom domain add-on, your storefront answers to your own web address.',
    minutes: 4,
    keywords: ['domain', 'custom domain', 'website', 'url', 'address', 'www'],
    cta: { label: 'Custom domain settings', href: '/dashboard/domain' },
    related: ['plans-and-billing', 'storefront-design'],
    sections: [
      {
        heading: 'Before you start',
        steps: [
          'Buy the Custom domain add-on under Dashboard → Plan & billing.',
          'Own (or buy) a domain name from any registrar.',
          'Know how to edit that domain\'s DNS records — your registrar\'s help pages cover it.',
        ],
      },
      {
        heading: 'Connect it',
        steps: [
          'Dashboard → Domain → enter your domain.',
          'Add the DNS record CyberShop shows you, at your registrar.',
          'Wait for DNS to propagate (minutes to a few hours), then verify on the same page.',
        ],
        tips: ['Your CyberShop address keeps working alongside your domain — old links and shared chats never break.'],
      },
    ],
  },
  {
    slug: 'media-library',
    title: 'Media library: photos that sell',
    icon: '🖼️',
    audience: 'selling',
    summary: 'Upload once, reuse everywhere — logos, covers and listing photos, organised.',
    minutes: 2,
    keywords: ['media', 'photos', 'images', 'upload', 'logo', 'cover', 'gallery'],
    cta: { label: 'Open media library', href: '/dashboard/media' },
    related: ['storefront-design', 'add-products'],
    sections: [
      {
        heading: 'How it works',
        steps: [
          'Dashboard → Media → upload photos.',
          'Pick them again later for logos, covers or new listings without re-uploading.',
          'Delete what you no longer use to keep the library tidy.',
        ],
      },
      {
        heading: 'Photos that get tapped',
        steps: [
          'Natural light, plain background, the whole item in frame.',
          'First photo = the best photo; it is the shop window.',
          'Show scale and detail: one close-up beats three blurry wides.',
        ],
        warning: 'Only upload photos you own or have permission to use. Listings with stolen photos are removed when reported.',
      },
    ],
  },

  // ------------------------------------------------------------ ACCOUNT
  {
    slug: 'your-account',
    title: 'Your account: buyer, seller & settings',
    icon: '👤',
    audience: 'account',
    summary: 'The two account types, what each can do, and the settings worth knowing.',
    minutes: 3,
    keywords: ['account', 'profile', 'settings', 'buyer', 'seller', 'register', 'sign up', 'type'],
    cta: { label: 'Open your account', href: '/account' },
    related: ['security-2fa', 'saved-and-alerts', 'open-storefront'],
    sections: [
      {
        heading: 'Two kinds of account',
        steps: [
          'Buyer account (free, quiet): save items and stores, save searches for alerts, keep an enquiry history, leave reviews.',
          'Seller account: everything a buyer has, plus a storefront, catalogue, leads inbox and the full dashboard.',
          'One email, one account — sellers can still buy from other stores like anyone else.',
        ],
      },
      {
        heading: 'Your account pages',
        steps: [
          'Account → Enquiries: every conversation you started.',
          'Account → Saved: your bookmarked listings and stores.',
          'Account → Alerts: saved searches and their newest matches.',
          'Account → Settings: your details and preferences.',
        ],
        tips: ['Selling later? You do not need a new account to open a storefront — start from Sell on CyberShop.'],
      },
    ],
  },
  {
    slug: 'security-2fa',
    title: 'Security: passwords, 2FA & staying signed in safely',
    icon: '🔐',
    audience: 'account',
    summary: 'Lock your account properly — especially the one that runs your business.',
    minutes: 4,
    keywords: ['security', 'password', '2fa', 'two factor', 'authenticator', 'login', 'hacked', 'forgot'],
    cta: { label: 'Security settings', href: '/account/security' },
    related: ['your-account', 'team-and-staff'],
    sections: [
      {
        heading: 'Turn on two-factor authentication',
        steps: [
          'Account → Security → Two-factor authentication.',
          'Scan the QR code with any authenticator app (or type the key manually).',
          'Enter the 6-digit code to confirm.',
          'Next sign-in: password first, then a code from your phone.',
        ],
        body: ['If your account ever asks for a code during sign-in and you were not signing in — change your password immediately and contact Support.'],
      },
      {
        heading: 'Password hygiene',
        steps: [
          'Use a password you do not reuse anywhere else; at least 8 characters, longer beats fancier.',
          'Forgot it? Use "Forgot password" on the sign-in page — the reset link goes to your email.',
          'Staff should have their own logins (Team), never your password.',
        ],
        warning: 'CyberShop staff will never ask for your password or a 2FA code — on WhatsApp, email, or anywhere. Anyone who does is a scammer.',
      },
    ],
  },

  // -------------------------------------------------------------- ADMIN
  {
    slug: 'admin-moderation',
    title: 'Admin: moderation — verifications, reports, listings, reviews',
    icon: '🧭',
    audience: 'admin',
    summary: 'How the trust machinery runs day to day, and the order to work the queues.',
    minutes: 5,
    keywords: ['admin', 'moderation', 'verify', 'reports', 'listings', 'reviews', 'vendors', 'users', 'categories'],
    cta: { label: 'Open admin', href: '/admin' },
    related: ['admin-money-system', 'get-verified'],
    sections: [
      {
        heading: 'The daily queues',
        steps: [
          'Verifications — approve or reject ID requests; the name must match the ID exactly. Decisions immediately show/hide the ✓ badge.',
          'Reports — buyer and seller reports on stores, listings and jobs. Work oldest first; job-fee scams are same-day urgent.',
          'Listings & reviews — remove content-policy violations and fake reviews; leave honest negative reviews alone, always.',
          'Vendors & users — store status changes and account actions; every action lands in the audit log.',
        ],
      },
      {
        heading: 'House rules',
        steps: [
          'Categories are curated from Admin → Categories; a messy taxonomy breaks buyer browsing, so merge rather than multiply.',
          'Templates (global WhatsApp templates) are managed from Admin → Templates.',
          'If you would not want it screenshotted in a dispute, do not do it — the audit log is forever.',
        ],
      },
    ],
  },
  {
    slug: 'admin-money-system',
    title: 'Admin: payments, reconciliation & system health',
    icon: '💰',
    audience: 'admin',
    summary: 'Plan payments, bank-transfer proofs, subscriptions, and keeping the platform itself healthy.',
    minutes: 5,
    keywords: ['admin', 'payments', 'reconciliation', 'bank', 'proof', 'subscriptions', 'plans', 'health', 'audit', 'settings', 'domains'],
    cta: { label: 'Open payments', href: '/admin/payments' },
    related: ['admin-moderation', 'plans-and-billing'],
    sections: [
      {
        heading: 'Money flow',
        steps: [
          'Payments — every plan payment and add-on purchase, by method and status.',
          'Bank transfers arrive as "submitted" with proof; verify against the account before activating (see below).',
          'Reconciliation — match submitted proofs to real credits; only confirmed money activates plans.',
          'Subscriptions — who is on what plan, renewal state, and plan edits (Admin → Plans) take effect for new purchases.',
        ],
        warning: 'Never activate a paid plan on a screenshot alone. Confirm the credit in the bank first — reconciliation exists precisely for this.',
      },
      {
        heading: 'System',
        steps: [
          'Health — service status at a glance; check here first when "the site is down" reports arrive.',
          'Audit — the immutable trail of admin actions.',
          'Settings & domains — platform-wide settings and custom-domain approvals live here.',
        ],
      },
    ],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidesByAudience(audience: GuideAudience): Guide[] {
  return GUIDES.filter((g) => g.audience === audience);
}
