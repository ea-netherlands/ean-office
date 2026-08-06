# EA Netherlands office app

Booking and check-in for the EAN coworking office in Amsterdam — 8 desks plus
a lunch table. Replaces the Airtable form, the email approval chain, and the
shared Google Sheet. Styled with the EAN design system (EA Teal + Slate,
Sentient + Atkinson Hyperlegible Next).

## Quick start

```bash
npm install
npm run db:seed     # migrate + load realistic demo data (stop the dev server first)
npm run dev         # http://localhost:3000
```

The seed prints a demo admin address to log in with — with no email provider
configured, the magic link is shown on screen after you submit the login
form (dev only). All demo email lands in `/admin/emails` instead of being
delivered. Create real admins with `npm run admin:add -- "Name" email`.

## How it works

- **Database** — Postgres via Drizzle. Locally it runs on embedded PGlite
  (`./data/office-db`, no install needed); in production set `DATABASE_URL`
  (Neon/Supabase free tier) and it uses node-postgres. Migrations live in
  `drizzle/` (`npm run db:generate` after schema changes; they auto-apply on
  boot in dev, run them once against prod before first deploy).
- **Auth** — magic links only, no passwords. 90-day sessions. ~150 lines in
  `src/lib/auth.ts`, no auth framework.
- **Email** — Resend when `RESEND_API_KEY` is set; otherwise logged to
  `email_log` and visible at `/admin/emails`. Cancel and retroactive check-in
  links are signed single-purpose tokens (`src/lib/tokens.ts`) that work
  without login and never grant a session.
- **Cron** — one daily job, `/api/cron/daily` (see `vercel.json`, 06:00 UTC ≈
  08:00 Amsterdam). Sends morning reminders, marks no-shows, runs the
  escalation ladder, expires stale requests, sends the Monday digest, and
  purges check-ins past the GDPR retention window. Idempotent. Protect it
  with `CRON_SECRET` in production.
- **Co-working days** — a member proposes one at `/coworking/propose`; an
  admin confirms it in the events queue. A confirmed one takes the whole
  office for that working day: general booking is refused (calendar, repeat
  bookings and `bookDay` alike), and the organiser curates the guest list at
  `/events/<id>/guests` from requests sent to `/events/<id>/rsvp`, which
  anyone can use without an account. Approving a guest books them a desk.
  People who had already booked that day are the admin's call at confirm
  time: **keep** (the default — they keep their desks, join the guest list as
  approved, and get an email saying what's happening) or **clear** (their
  bookings are cancelled, nothing is promoted off the waitlist, and each
  person gets one apology naming the day and linking both the calendar and
  the organiser's join link). Clearing can't be undone from the app. They're
  `events` rows of type `themed_coworking`, so the funder reports already
  count them.
- **Settings** — everything configurable (desk count, coverage days, no-show
  thresholds…) lives in the `settings` table, editable at `/admin/settings`.

## Environment

Copy `.env.example` to `.env.local`:

| Var | Required | Purpose |
|---|---|---|
| `APP_SECRET` | prod | Signs cancel/retro tokens |
| `APP_URL` | prod | Absolute links in emails (e.g. `https://office.effectiefaltruisme.nl`) |
| `DATABASE_URL` | prod | Postgres; omit locally for PGlite |
| `RESEND_API_KEY` | prod | Real email delivery |
| `EMAIL_FROM` | optional | Sender address |
| `CRON_SECRET` | prod | Guards `/api/cron/daily` |

## Deploying (Vercel + Neon, both free tier)

1. Create a Neon project, set `DATABASE_URL`.
2. Run migrations once: `DATABASE_URL=... npx tsx -e "import('./src/db/index.ts').then(m=>m.ensureMigrated())"`.
3. Set the env vars above in Vercel; deploy. `vercel.json` registers the cron.
4. Print the QR stickers from `/admin/qr` and put them by the door and on the
   lunch table.

## Deliberate deviations from the spec

- **Flex (lunch-table) bookings are full-day** with the 12:00–13:00 warning
  shown at booking time; the optional morning/afternoon split was skipped for
  simplicity and can be added later.
- **The 12-future-bookings cap applies to individually made bookings**; block
  bookings are bounded by the 12-week horizon and 50% cap instead (a
  two-day-a-week series alone would exceed 12).
- **Retroactive check-in links from the no-show email stay valid ~30 days**
  (the email itself is the authorisation); the end-of-next-day window applies
  to everything else.
- **"PDF export" is a print-styled one-page report** (`/admin/reports/print`
  → browser print → save as PDF) rather than a PDF library — one less
  dependency for software that must survive unmaintained months.
- **Cancel/retro email links land on a one-tap confirm page** rather than
  acting on GET, so email scanners that prefetch links can't cancel bookings.
