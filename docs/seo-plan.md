# SEO and AI discovery implementation

Applied locally from the supplied AI SEO skill (pinned commit 73573e94a06a39965978b3fa1f9c1eace8cebc7c) and the user-supplied Paul Vengeons article. Their claims are guidance, not site measurements or instructions to post, buy services, connect accounts or publish changes.

## Implemented

- Homepage title targets the existing offering/location: “Kursus Elektrik di Port Dickson | Ehsan TVET Institute”. This is a content-based intent hypothesis, not a measured highest-volume keyword.
- Three crawlable, distinct program pages under `/program/`, one per existing course, with their actual code, requirements, listed fee, PDF, contact details and links to related programs. No city doorway pages, rankings, fake reviews or competitor claims.
- Homepage course cards and contact information are present in HTML before JavaScript; course titles link to public program pages. Existing program dialog and interest flow remain enhancements.
- Canonical links, social metadata, Malay language, organization/course/FAQ structured data, public robots rules and XML sitemap. Sitemap omits invented modification dates. Admin/API paths are excluded from crawling; this is not an authorization mechanism.
- Direct font loading, prioritized hero image and lazy/async noncritical images with dimensions. No traffic uplift or performance score claimed.
- `npm run build` regenerates program pages, homepage course cards/schema and sitemap from **versioned** `public/content.json`; it deliberately does not read private runtime `data/`. Sync reviewed CMS content into the public publishing source before a static deployment. Local CMS changes are not automatically published to Vercel. Metadata and FAQ visible copy must be reviewed together when editing facts.
- No llms.txt/OKF bundle added: these are optional experiments, not prerequisites or proven ranking improvements. Public, accessible content takes priority. No fabricated author bio, student outcome, instructor qualification, accreditation statement, rating or statistical result.

## Owner data needed

1. Connect or export Google Search Console for this domain: last 90 days, page + query, country + device, clicks, impressions, CTR and average position. Filter branded vs non-branded searches, sort relevant high-impression/low-click pairs, then prioritize three actual opportunities. No data is currently connected, so all metrics are unknown.
2. Check the live Malaysian results for candidate intents: kursus elektrik Port Dickson, SKM elektrik satu fasa Negeri Sembilan, kursus elektrik tiga fasa, syarat kursus elektrik Ehsan TVET, yuran Ehsan TVET. These are research prompts, not verified search volumes or ranking opportunities.
3. Verify ownership and consistent institute name/address/phone on the actual TVET listing and Google Business Profile; verify map coordinates before publishing. Do not create profiles or solicit reviews without owner direction.
4. Track five buyer questions across search/AI products with repeated samples: course availability, SKM entry requirements, fee/duration, location, application process. Record date, exact prompt, locale, named institutes and cited URLs. One answer is not a visibility baseline.
5. Compare page/query cohorts after enough fresh data, typically an initial 28-day window and a longer 90-day comparison when volume permits. A universal “90-day ranking reset” is not established and must not prevent fixing errors or unsafe code.

## Change log

| Date | Page | Change | Target intent | Baseline/result |
|---|---|---|---|---|
| 2026-11-24 | `/` | Crawlable courses/contacts; metadata; schema | Electrical training in Port Dickson | Unknown; Search Console not connected |
| 2026-11-24 | `/program/satu-fasa` | Existing SKM Tahap 2 facts as HTML | Satu Fasa program details | New local page; unpublished |
| 2026-11-24 | `/program/tiga-fasa` | Existing SKM Tahap 3 facts as HTML | Tiga Fasa program details | New local page; unpublished |
| 2026-11-24 | `/program/mikro` | Existing MCU-12 facts as HTML | Short course details | New local page; unpublished |

Source: https://github.com/coreyhaines31/marketingskills/tree/73573e94a06a39965978b3fa1f9c1eace8cebc7c/skills/ai-seo . Core workflow read in full. Optional local reference companions were unavailable in the downloaded single-file skill; no claim is made to have read them. No Search Console traffic, search volume or ranking figure was invented.

## Programme discovery

The homepage, comparison table, individual programme pages and sitemap use the same clean URLs. Build the static site with `npm run build`; run `node --test tests/seo.test.mjs` to check published links, titles, canonical URLs and visible FAQ consistency. The comparison page derives fees and eligibility from the versioned catalogue. The institute's Instagram profile is linked in the organisation metadata.

The technical SEO and internal-linking workflows in [Illyism/seo-skills](https://github.com/Illyism/seo-skills) informed these changes. Search Console query data is needed to prioritise further title changes by impressions or measure enquiry traffic from search.
