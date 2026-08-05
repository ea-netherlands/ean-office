# Bringing the existing members across

Design for migrating the current member list (a few dozen regulars plus a long
tail of several hundred sign-ups) into the office app.

The guiding decision: **an import is not an approval.** Being on the old list
gets you an account that can receive a login link. It does not make you a
counted member, and it does not let you book until you've accepted the
guidelines once. Everything below follows from that.

## Why not just bulk-add everyone as active

Three things break if the import marks people `active` the way
`addMemberAction` does today:

1. **The EAIF figures.** `src/lib/reports.ts` counts members as
   `status === "active"`, and counts `newMembers` by `approvedAt` falling
   inside the reporting window. A bulk insert stamping `approvedAt: now`
   reports several hundred new members in one month, and every
   occupancy-per-member ratio afterwards runs against a denominator that is
   mostly people who have never visited.
2. **The consent record.** Nobody on the old list has accepted the guidelines
   in this system — `guidelinesAcceptedAt` would be null for all of them, with
   nothing prompting them to fix it.
3. **The no-show ladder.** Dormant accounts sitting in `active` are eligible
   for automated nudges they've done nothing to deserve.

## Member-facing flow

### 1. Import (silent)

Everyone lands as `status: "imported"` — a new dormant state, distinct from
`pending` (waiting on an admin) and `inactive` (deactivated by an admin).
Imported accounts are counted nowhere, emailed nothing, and prompted for
nothing. They exist only so that a login link will resolve.

`status` is a Drizzle `text()` column with a TypeScript-level enum, not a
Postgres enum, so adding `"imported"` needs no migration — only the new
columns below do.

### 2. Announcement (outside the app)

`src/lib/email.ts` sends one sequential Resend call per recipient with no
batching and no rate-limit handling. Resend's default is 2 requests/second and
the free tier caps at 100 emails/day, so several hundred `await`s inside a
Vercel function will hit the cap and time out. **The announcement goes through
whatever tool sends the EAN newsletter, not this app.**

Two tiers of outreach, which is where the regulars/long-tail split actually
lives — not in the schema:

- **Regulars** — a short personal email from a real person. "Booking has moved,
  here's the link, takes thirty seconds." Follow up individually with anyone
  who hasn't claimed after two weeks; there are few enough to do by hand.
- **Long tail** — one paragraph in the regular newsletter. No chasing. If they
  never claim, that's the correct outcome, not a failure.

### 3. Claim (one screen, no admin involvement)

They go to `/login`, get a magic link — this already works for any address in
the users table, so there's nothing to build on the auth side.

After login, if `guidelinesAcceptedAt IS NULL`, they land on `/welcome`
instead of the dashboard:

- Confirm name (prefilled, editable)
- Accept the office guidelines (required checkbox, same text as `/join`)
- How often do you expect to come (the existing `expectedFrequency` options)
- Anything we should know for accessibility (optional)

Submit sets `guidelinesAcceptedAt`, `claimedAt`, `status: "active"`, and
`approvedAt` (backdated — see below), then redirects to `/book`.

**Deliberately not on this screen:** the six M&E profile questions.
`src/actions/booking.ts:38` already prompts for those at first booking with a
skip limit that escalates to required, so the data backfills itself from
people who actually turn up — which is the population the report should
describe anyway. Stacking them onto the claim screen would cost conversion for
data you get for free a week later.

### 4. Enforcement

`isActiveMember` in `src/lib/auth.ts` currently gates `/book`, `/info`, and
`/events/propose`. The guidelines check is a separate condition from status:
add a helper that redirects to `/welcome` when `guidelinesAcceptedAt` is null,
and call it in the same three places. Keeping it separate from
`isActiveMember` means a lapsed member reactivated by an admin doesn't get
sent back through the claim screen.

## Admin-facing flow

### `/admin/import`

Paste CSV or upload a file. Then:

1. **Column mapping** — pick which column is name, email, and (if present)
   original join date. Don't hardcode Airtable's headers.
2. **Dry run** — a preview table before anything is written: new accounts,
   already-present accounts (and what would change), invalid emails,
   duplicates within the file, duplicates against existing rows.
3. **Commit** — upsert keyed on `lower(email)`, matching the existing
   `users_email_unique` index. Re-running after fixing a typo in the sheet must
   be safe.
4. **Never downgrade.** An existing admin, or an active member who has already
   claimed, is left untouched by an import that happens to include them.

### Members list at scale

`src/app/admin/members/page.tsx` selects every `trial`/`active`/`inactive` row
and renders them all. At several hundred rows that page becomes unusable, so
before the import it needs:

- Server-side search across name and email
- Status filter, including a "not yet claimed" filter
- Pagination (50/page)
- A claimed/unclaimed column, so uptake is visible at a glance

### Nudging the unclaimed

Same rate-limit problem as the announcement. Rather than building a batch
sender, `/admin/import` exports the unclaimed list as CSV and the reminder
goes out from the newsletter tool. If in-app sending is wanted later, queue it
through the existing daily cron in batches rather than sending inline.

### Rollback

Every imported row carries an `importBatch` id. A bad import is reversible in
one statement: delete where the batch matches and `claimedAt IS NULL` — which
by construction cannot touch anyone who has actually engaged.

## Schema changes

One migration (`npm run db:generate`), all on `users`:

| Column | Type | Purpose |
| --- | --- | --- |
| `source` | text | `"join"` / `"import"` / `"admin"` — provenance |
| `claimedAt` | timestamp | when they completed `/welcome`; null = never claimed |
| `importBatch` | text | groups an import run for rollback and reporting |

Plus `"imported"` added to the `status` enum (TypeScript only, no DDL).

## Reporting

- **Member count** needs no change: `"imported"` isn't `"active"`, so
  unclaimed accounts are excluded automatically.
- **`newMembers`** must exclude `source === "import"`. Where the old export has
  a join date, also backdate `approvedAt` to it so tenure stays honest; where
  it doesn't, the `source` exclusion is what keeps the figure clean.
- **Narrative note.** The member count will step down at migration and then
  climb as people claim. That's a real discontinuity in the series and the
  report should say so — `src/lib/reports.ts:296` already assembles a
  methodology note, so the sentence belongs there.

## GDPR

- **Don't import the old M&E answers into per-user fields.** Those were
  collected under an aggregate-only promise. Name, email, and join date are
  fine; cause area, funding, and gender are not, and the app re-collects them
  under the current consent at first booking anyway.
- **Unclaimed accounts need a retention limit.** The cron's purge
  (`src/app/api/cron/daily/route.ts:171`) only deletes old check-in rows, so
  imported-and-never-claimed records would otherwise be held forever. Add a
  rule that purges them after 12 months — a mailing-list address held
  indefinitely in a system the person never logged into is exactly the sort of
  thing the aggregate-only promise was meant to avoid.

## Build order

1. Migration + `"imported"` status + `/welcome` claim screen + the guidelines
   redirect. This is the part that must exist before a single row is imported.
2. Members list search, filters, pagination.
3. `/admin/import` with dry run, commit, and unclaimed CSV export.
4. Reports adjustments and the narrative note.
5. Unclaimed retention rule in the cron.

Import the regulars first as a live test of the claim flow — a few dozen
people, personally emailed, is a small enough blast radius to find out what's
confusing before the long tail sees it.
