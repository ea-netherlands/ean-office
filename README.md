# EA Netherlands office app

Booking and check-in for the EAN coworking office in Amsterdam — 8 desks plus
a lunch table. Replaces the Airtable form, the email approval chain, and the
shared Google Sheet. Styled with the EAN design system (EA Teal + Slate,
Sentient + Atkinson Hyperlegible Next).

Running a coworking space somewhere else? See **[ADAPTING.md](ADAPTING.md)**
— what's configurable, what's Amsterdam-shaped, and what you'll want to cut.
MIT licensed, so fork it freely.

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
- **Calendar invites** — every booking email carries the day as an `.ics`,
  attached and linked (`/calendar/<token>.ics`, a signed single-purpose token
  like the cancel links). A full day is an all-day entry marked
  `TRANSP:TRANSPARENT`, so it sits at the top of the day rather than blocking
  ten hours of your calendar; half days are timed entries with a 30-minute
  alarm. A repeat booking sends one file holding every day — VEVENTs, not an
  `RRULE`, because the series skips full days and the recurrence rule would
  quietly put them back. See `src/lib/booking-calendar.ts`.
- **Which desk, and where it is** — booking and reminder emails name the desk
  and place it in the room ("desk 7, against the top wall"). The hints in
  `src/lib/desks.ts` only assert what the floor plan in
  `components/desk-map.tsx` actually encodes, and go quiet for any desk count
  other than the real room's eight — a confidently wrong direction sends
  someone to somebody else's desk.
- **Events take sign-ups through one shareable link** — `/events/<id>/rsvp`,
  usable without an account, for evening events as well as co-working days.
  The two differ in one respect, and it follows from desks: a co-working day
  takes the whole office, so the organiser curates it; an evening event runs
  after hours with nothing to ration, so a sign-up lands approved and the
  organiser just gets a list at `/events/<id>/guests`. Luma wins wherever an
  event has a Luma page. See `src/lib/event-join.ts`.
- **Undoing a sign-up** — every sign-up email carries a one-tap "can't make
  it" link (`/leave/<token>`, signed and single-purpose like the booking
  cancel links), and logged-in people get the same thing on the event page.
  Signing up in one tap and needing an email to undo it is what leaves a room
  set out for twelve with six people in it. On a co-working day it also hands
  the desk back and moves the waitlist — but only the desk *we* gave them, so
  someone who booked that day before the takeover keeps their own booking.
  The organiser is emailed with the new headcount. A withdrawal is recorded
  as `decidedBy = "self_withdrawn"` rather than a plain decline, because
  "they dropped out" and "I removed them" read very differently on a guest
  list, and signing up again afterwards reuses the row. See
  `src/lib/leave-event.ts`.
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
- **Cancelling an event** — any confirmed event, evening or co-working, can be
  called off by an admin (`/admin/events`) or by its organiser (`/me`, or
  their guest list). The row stays as `status = "cancelled"` with a reason
  rather than being deleted, so the funder counts — which only ever include
  `confirmed` — don't change shape retroactively. Cancelling emails everyone
  who signed up, releases the desks that were handed to approved guests,
  reopens the day for booking, and tells anyone whose booking was cleared for
  that day that the space is theirs again (`events.displaced_user_ids`, set
  when the day was cleared). Deleting is still available, but only for events
  that have already happened.
- **One person, two addresses** — people sign up again with their work email
  and end up as two members with half a history each. `/admin/members` flags
  same-name pairs and merges them: bookings, check-ins, event records and
  profile answers move to the account you keep, same-day duplicates are
  cancelled or dropped, and the losing address is kept in `user_emails` so it
  still logs in. Every email lookup goes through `findUserByEmail`
  (`src/lib/users.ts`), which is what makes an alias behave like the real
  thing — don't query `users.email` directly.
- **Profiles and photos** — the opt-in community profile now takes a photo.
  The browser centre-crops and shrinks it to a 256px JPEG (~20KB) before
  upload, so it lives in `user_avatars` rather than needing a file store, and
  `users.avatar_updated_at` is what pages read and what cache-busts
  `/avatar/<id>`. That route is members-only: a face is a bigger thing to hand
  out than a name. Each member gets one "your profile is bare" email, ever
  (`users.profile_nudge_sent_at` is both the record and the opt-out), and only
  after two actual visits.
- **Settings** — everything configurable (desk count, coverage days, no-show
  thresholds, how far ahead a first visit can be requested…) lives in the
  `settings` table, editable at `/admin/settings`.

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

## Hosting

Everything runs on free tiers, so the app costs €0/month at this scale.

| Piece | Where | Notes |
|---|---|---|
| Code | GitHub (org `ea-netherlands`, private repo `ean-office`) | Push to `main`, Vercel redeploys automatically |
| App + daily cron | Vercel | `vercel.json` registers `/api/cron/daily` at 06:00 UTC; served at `office.effectiefaltruisme.nl` (CNAME → `cname.vercel-dns.com`), with a `*.vercel.app` fallback URL |
| Database | Neon (Postgres, Frankfurt region) | `DATABASE_URL` env var; PGlite locally instead |
| Email | Resend | `RESEND_API_KEY`; domain `effectiefaltruisme.nl` verified via DNS records; logs to `/admin/emails` when unset |
| DNS | wherever effectiefaltruisme.nl is managed | one CNAME record for the `office` subdomain |

Logs and cron history live in the Vercel dashboard (project → Logs / Settings
→ Cron Jobs). Neon has point-in-time restore for backups.

First time setting this up? See **[GOING-LIVE.md](GOING-LIVE.md)** — a full,
no-experience-assumed walkthrough of creating the four accounts and wiring
them together.

## Deploying (once hosting is set up)

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

## Licence

MIT — see [LICENSE](LICENSE).
