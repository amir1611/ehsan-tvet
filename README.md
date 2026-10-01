# Ehsan TVET

Malay landing page and a working single-admin CMS, added to the supplied `admin-panel` branch. The original property website and its Next.js admin remain intact; this self-contained TVET app is in `tvet/` and does not depend on the property database.

## Run

Requires Node.js 22 or newer. No package installation or build step is needed.

```sh
cd tvet
npm start
```

Landing page: http://localhost:4180. Admin: http://localhost:4180/admin.

On the first run a random admin password is printed once. Set `ADMIN_PASSWORD` before the first run to choose it. Only a salted scrypt hash is saved. Runtime data lives in `data/` (ignored by Git). Sessions expire after eight hours and are cleared on restart.

## Brand

Primary burgundy: `#4a0a08`. Accent gold: `#cb8920`. Shared across landing page, admin, controls and favicon.

## Features

- Responsive Malay landing page, course filtering and detail dialogs, PDF downloads, video, FAQ and WhatsApp link.
- Contact form saves enquiries to the server; no email service is configured.
- Authenticated admin edits headline, introduction, contact details and three supplied programs.
- Enquiry inbox with status updates, filtering and CSV export.
- Unsaved-change warnings, validation, session protection, basic request rate limiting and same-origin write checks.
- Uses supplied photos, video and course PDFs; the commercial quotation is not published.

## Design and motion

The landing page uses a mobile-first editorial layout in `public/design.css`, an arched hero image, staggered desktop cards, a mobile action bar, and native dialog bottom sheets. `public/motion.js` adds one-time viewport reveals, opening transitions, scroll progress, active navigation and FAQ transitions. Motion respects `prefers-reduced-motion`; animations finish when the tab is hidden. Content is visible without motion JavaScript.

## Content verification

Both full-certificate PDFs list one month in one section and twelve months in another. Duration therefore reads “Hubungi penyelaras”. Fees follow supplied screenshots and remain subject to institute confirmation. Marketing copy is draft copy. Existing supplied posters are used as training imagery, not independently verified photographs.

## Validation

`npm test` runs isolated integration tests for login, protected editing, enquiry validation, concurrent submissions, status updates, cross-origin rejection, restart persistence and logout. Tests use a temporary data directory and leave real content untouched.

## Deployment

Run one Node process behind an HTTPS reverse proxy to localhost:4180. Set `NODE_ENV=production` for secure cookies. Keep `DATA_DIR` on a private persistent volume, restrict access and back it up. This file-backed app is for a single instance; use a transactional database before scaling to multiple processes. The included project has not been deployed publicly or connected to the existing property admin database.
