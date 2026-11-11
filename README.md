# BEAUTE&NUTRIE

Website for BEAUTE&NUTRIE, a cosmetics boutique on the ground floor of VR Chennai in Anna Nagar, Chennai. The site is a single static page: hand written HTML, CSS and JavaScript. There is no backend, no framework, no cookies, no analytics and no tracking. Every contact action on the page goes straight to the shop: WhatsApp, a phone call, or Google Maps directions.

Live site: https://beauteandnutrie.com (hosted on Vercel)

Shop details used across the page: Shop No. G-30, Ground Floor, VR Mall #44, Pillaiyar Koil Street, Jawaharlal Nehru Salai, Anna Nagar, Chennai 600040. Phone +91 93555 91909. Open daily, closes 10 PM.

## How it is built

- `index.html` holds the whole site: markup, CSS and the site module. The 3D and interaction code lives in `js/`.
- Libraries are self-hosted in `vendor/`, so the page requests nothing from a CDN: three.js 0.186.1, GSAP 3.12.5 with ScrollTrigger, and Lenis 1.1.14 for smooth scrolling. Each library is guarded; the page still works when one fails to load.
- Fonts are self-hosted woff2 files: Cormorant Garamond for display, DM Sans for body, Noto Sans/Serif Tamil for the Tamil toggle. The Tamil fonts only download when Tamil text is actually on screen (unicode-range).
- The hero products are GLB models in `models/`, built with `tools/build-models.mjs` and meshopt compressed.
- `404.html`, `sitemap.xml`, `robots.txt`, `site.webmanifest`, a favicon set in `icons/`, and a downloadable contact card (`beaute-nutrie.vcf`) round out the static files.
- A JSON-LD block describes the shop as a HealthAndBeautyBusiness / Store / LocalBusiness with its address, phone and photos.

## What visitors get

- An intro overlay that flies through the shop's red arch in 3D. It can be skipped, plays a 500ms crossfade under prefers-reduced-motion, falls back to a CSS animation when WebGL is missing, and returns straight to the hero on repeat visits in the same tab.
- A hero with a live 3D product stage. A poster image paints first over a blurred placeholder, then the models load and fade in. Phones, small tablets and low-memory devices get a lite mode: CSS intro, native scrolling, 3D deferred.
- Product chips that open WhatsApp with a ready-made question about that shelf.
- A collections carousel (CSS scroll snap, works without JavaScript) with 3D tilt cards. The card art is illustrative and each card labels it as such.
- A shelf guide quiz that sends the answers to the shop on WhatsApp.
- An open-now chip computed from the closing time, the real review figures (4.9 from 1,716 Google reviews), three review cards, an enquiry form that composes a WhatsApp message, a map, and a Tamil language toggle.

## Quick start

```bash
npm install
node tools/serve.mjs 4173
```

Open http://localhost:4173. The local server mimics Vercel: it applies the headers from `vercel.json`, compresses responses, and rejects wrong-case paths (Windows ignores case, Vercel does not). Run `PROD=1 node tools/serve.mjs 4174` to see the production cache headers instead of `no-store`.

The Playwright scripts use the Chrome or Edge already installed on the machine, they do not download a browser. Python is only needed for image prep (3.11 with Pillow).

## Rebuilding assets

| Command | What it does |
| --- | --- |
| `node tools/build-models.mjs` | Rebuilds the GLB product models in `models/` from Three.js geometry generators, then compresses them with glTF Transform and meshopt. Scale: 1 unit = 10 cm. |
| `python scripts/prepare-images.py` | Cleans and re-encodes the three real shop photos: paints out the GST number, crops the storefront, writes the WebP files and the tiny LQIP placeholders. |
| `node tools/build-static.mjs` | Regenerates `beaute-nutrie.vcf` and the favicon set in `icons/` (needs installed Chrome). |

## Checking changes

| Command | What it does |
| --- | --- |
| `node verify_transition.cjs` | Intro transition suite: frame captures at 390, 768 and 1440 px, desktop and 4x CPU-throttled mobile frame timings, keyboard tests, skip and Escape paths, reduced-motion and no-WebGL fallbacks, returning-visitor reload, and a post-transition audit. Writes `verification_report.json` and `verification_frames/`. |
| `node scripts/verify.mjs` | Section-by-section screenshots through installed Edge, PASS/FAIL per section into `screenshots/`. |
| `node tools/qa.mjs` | Reference and file-case check, layout fit, overlap, contrast, network isolation, console errors. Needs both servers running (4173, and 4174 with `PROD=1`). Writes `.work/qa/report.json`. |

Append `?debug=1` to the URL for the transition timeline scrubber.

## Editing content

Every editable spot is marked with `EDIT:` in `index.html`:

1. The `SITE` config near the bottom: WhatsApp number (digits only), opening and closing times.
2. Copy inside the sections.
3. The JSON-LD block near the top: domain, URL, images, hours. The opening time is not asserted anywhere because the shop only publishes its closing hour; add `openingHours` only once the real opening time is known.
4. The canonical URL and the Open Graph URLs when the domain changes.

## Repo layout

```
index.html            the whole site (markup, CSS, site module)
404.html
js/                   3D stage, materials, scene, i18n, extras
models/               GLB product models and previews
vendor/               self-hosted three.js, GSAP + ScrollTrigger, Lenis
fonts/  icons/  images/
tools/                local server, QA, asset builders, screenshot scripts
scripts/              image prep, verify, focus debug, intro and venom modules
verification_frames/  screenshots/  .lighthouse/  .work/   generated check output
vercel.json           security headers, CSP, caching
sitemap.xml  robots.txt  site.webmanifest  beaute-nutrie.vcf  favicon.ico
```

## Deploying

The site deploys to Vercel as static files, nothing to build. `vercel.json` already sets:

- Security headers and a strict CSP on every route.
- Immutable caching for `models/`, `vendor/`, `fonts/` and `icons/`, 30-day caching for `images/`.
- The correct `Content-Type` for `.glb` files and for the vCard download.
- `noindex` for `/tools`.

## Notes

- The only external requests the page makes are the Google Maps iframe in the Visit section and the outbound contact links (wa.me, tel, Google Maps). Everything else is same-origin.
- The three photos in `images/` are the only real photographs of the shop; the `card-*.jpg` files are illustrative art, not stock photos. Never display an image above its native pixel width.
- `package.json` lists `three`, `gsap` and `motion`: the npm `three` package is used by `tools/build-models.mjs`, the site itself loads its copies from `vendor/`, and nothing imports the npm `motion` package today.
