# Adapting this for your office

This app runs the EA Netherlands coworking office in Amsterdam. It was written
for one specific room, but nothing about it is secret and most of what makes it
"ours" is either a database setting or a single file. If you run a similar
space, forking it should take an afternoon rather than a rebuild.

Fork it, don't submit pull requests upstream — your office's rules will diverge
from ours, and that's fine. If you fix something that isn't office-specific,
we'd love the patch back.

## Start here

```bash
git clone https://github.com/<you>/<your-fork>.git
cd <your-fork>
npm install
cp .env.example .env.local
npm run db:seed     # migrate + load demo data (31 fake members, ~4 months of history)
npm run dev
```

The seed prints a demo admin address. With no email provider configured the
magic link appears on screen after you submit the login form, and every email
the app would have sent lands in `/admin/emails` instead. Click through the
whole thing with the demo data before you change a line — it's the fastest way
to see what the app assumes about how an office runs.

Everything below is roughly in order of how much it matters.

## 1. Things you change in the admin UI, not the code

Most of the office-shaped numbers live in the `settings` table and are editable
at `/admin/settings` — no deploy needed. Defaults are in `src/lib/settings.ts`;
change those if you want a clean install to start right.

| Setting | Ours | What it means |
|---|---|---|
| `desk_count` | 8 | Bookable desks |
| `flex_count` | 5 | Lunch-table (flex) seats |
| `am_window` / `pm_window` | 9:00–13:30 / 12:30–19:00 | Half-day hours |
| `arrival_slots` | 11:00, 13:00 | Times a first visit can arrive |
| `host_coverage_days` | Mon–Thu | Days a host is in; the rest are unhosted |
| `join_horizon_days` | 180 | How far ahead a first visit can be requested |
| `block_horizon_weeks` / `block_max_share` | 12 / 0.5 | Limits on recurring bookings |
| `max_future_bookings` | 12 | Cap on self-made future bookings |
| `noshow_threshold` / `noshow_window_days` | 3 / 60 | When the no-show ladder escalates |
| `checkin_retention_months` | 24 | GDPR purge horizon for check-in rows |
| `office_address` | HNK Houthavens… | Shown in emails and on `/info` |
| `luma_ics_url` | our Luma calendar | Events sync; see §5 |

The `/info` page (public and members-only halves) is admin-editable markdown at
`/admin/info`. Door codes, wifi, kitchen rules, and how to find the place all
go there — not in source.

## 2. Branding

- `src/app/globals.css` — the whole palette. We override Tailwind's `teal-*`
  ramp with EA Teal (`#16879C`) so brand colour flows through existing
  utilities. Swap the eleven hex values for yours and most of the UI follows.
  Font families are `--font-sans` (Atkinson Hyperlegible Next, body) and
  `--font-serif` (Sentient, headings).
- `src/app/layout.tsx` — the font `<link>` tags (Fontshare + Google Fonts) and
  the page metadata description.
- `public/ean-logo-mark.svg` — replace it; it's referenced once, in
  `src/components/nav.tsx`.
- Icons are Tabler outline via a webfont, imported at the top of `globals.css`.
  Deliberately no emoji anywhere.

## 3. Place and time

- `src/lib/dates.ts` — `TZ = "Europe/Amsterdam"`. Change this one constant and
  the whole app moves. Everything is stored in UTC; every user-facing date is
  an office-local calendar date, so don't work around it elsewhere.
- `vercel.json` — the daily cron runs at 06:00 UTC because that's 08:00 in
  Amsterdam. Adjust for your timezone, and remember UTC doesn't observe summer
  time: pick whichever hour you'd rather have drift.
- `src/lib/ics.ts` — calendar invites embed a `VTIMEZONE` block with Amsterdam
  DST rules. Update it to match your timezone or invites land an hour off half
  the year.

## 4. Wording and identity

The app writes a lot of email, and the copy names us. Search for
`EA Netherlands` and `effectiefaltruisme.nl` — around a dozen files:

- `src/lib/email.ts` — the `EMAIL_FROM` default and the footer line.
- `src/actions/admin.ts` — the from-address fallback and the `uid` domain on
  calendar invites.
- `src/actions/join.ts`, `src/app/join/`, `src/app/welcome/`,
  `src/app/events/[id]/rsvp/` — the code-of-conduct links point at our
  website. Point them at yours; every one of these is a real link a member
  will click.
- `src/app/page.tsx`, `src/app/layout.tsx` — the front-door description.

There is no i18n layer. Everything is English. If you need German, French, or
Italian, you'll be editing strings in place — they're all colocated with the
components and emails that use them, not in a bundle.

## 5. Things you may not want at all

- **Luma events sync.** `/admin/events` pulls from a public Luma ICS feed, no
  API key. If you don't use Luma, clear `luma_ics_url` and the sync stays
  quiet; admins can still create events by hand.
- **Funder reports.** `/admin/reports` emits the figures our EAIF grant asks
  for — occupancy as a percentage of desks, booked and attended counted
  separately, trials and conversions. The shape is in `src/lib/reports.ts`.
  Your funder will want something else.
- **The trial-visit flow.** A first visit is a trial day; afterwards an admin
  admits or declines the person, and until they do the member can't book
  anything further. If your office lets people book freely from day one, this
  is the flow to cut.
- **The no-show ladder.** Three no-shows in 60 days escalates to a human
  conversation. Tune it in settings or ignore it.

## 6. The floor plan

`src/components/desk-map.tsx` is a hand-built CSS grid of *our* room — a 7/8
island, door on the left, kitchen and lunch table against the left wall,
lounge behind a divider on the right. It is the one file that can't be
configured, only redrawn. The comment at the top explains the grid tracks; a
photo of your office and an hour will do it. Desk numbers are 1..`desk_count`
and must stay contiguous, because bookings store a desk number and unique
indexes enforce one person per desk per half-day.

## 7. Deploying

**[GOING-LIVE.md](GOING-LIVE.md) is the full walkthrough** — four free
accounts, connected, with a subdomain pointed at the result. It assumes no
prior deployment experience, takes about an hour of real work, and costs
nothing at this scale. It's written as instructions to one specific person
setting up one specific office, so read past the names: GitHub org, Neon
project (pick a region near you, not Frankfurt), Resend domain verification,
Vercel env vars, the CNAME record, and bootstrapping your first admin with
`npm run admin:add` all apply unchanged.

What to substitute as you follow it:

- Your own domain and subdomain throughout, and your `APP_URL`.
- Your admins in step 6 — the app nags until there are three, deliberately, so
  the office doesn't depend on one person's inbox.
- Skip the Airtable and Notion migration in steps 6–7 and the Sanity website
  edits (`WEBSITE-EDITS.md`); those are our old tooling.
- Step 2 says run `npm run db:migrate` against the new database. You can, but
  you don't have to — see below.

Two things the walkthrough doesn't stress:

- **Migrations apply themselves.** `ensureMigrated()` runs at the top of the
  home page, in `getSettings()`, and in every token route, so the first request
  after a deploy applies anything pending. There's no migration step in your
  deploy pipeline, and a fresh Neon database will build itself on first hit.
- **Never run `npm run db:seed` against production.** That's the fake demo
  data. Locally the database is embedded PGlite at `./data/office-db` — no
  Postgres to install — and only one process can hold it at a time, so stop
  the dev server before seeding.

Anywhere that runs Next.js and can reach a Postgres database will work;
Vercel + Neon is just what we happen to run.

## Questions

Open an issue on the upstream repo, or mail
[office@effectiefaltruisme.nl](mailto:office@effectiefaltruisme.nl). We'd
genuinely like to hear from anyone running this — especially about the bits
that turned out to be more Amsterdam-shaped than we realised.
