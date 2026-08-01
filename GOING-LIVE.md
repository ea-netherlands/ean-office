# Going live — a walkthrough for James

No prior deployment experience assumed. About an hour of actual work, most
of the rest is waiting for DNS. Everything runs on free tiers; the app costs
€0/month at this scale.

You'll create four free accounts, connect them, and point a subdomain at the
result. Claude Code can run every terminal step for you — the accounts and
the DNS record are the parts that need to be you.

---

## The mental model

- **GitHub** holds the code (like Drive for code, with history).
- **Vercel** runs the app and the daily 08:00 job. Every push to GitHub
  redeploys automatically.
- **Neon** holds the database — who's a member, who booked what.
- **Resend** sends the email (magic links, reminders, approvals).
- **DNS** — one record makes `office.effectiefaltruisme.nl` point at Vercel.

## Before you start: a password manager

Put every login below in EAN's shared password manager, and store the
two-factor codes there too — not only on your phone. The whole reason this
project exists is that a process died with one person's departure; don't
recreate that with the accounts.

Use `info@effectiefaltruisme.nl` (or a `tech@` alias) for **Vercel, Neon and
Resend**. GitHub is the exception — accounts there are personal by design.

## Step 1 — GitHub (10 min)

1. You and Ricardo each create a personal account at github.com.
2. Create a free **organisation** (e.g. `ea-netherlands`) with both of you as
   owners, so the code outlives either of you.
3. In the org, create a **private** repository called `ean-office`. Don't add
   a README — the code has one.
4. Push the code. In a terminal, from the `ean-office` folder:

```bash
git remote add origin https://github.com/ea-netherlands/ean-office.git && git push -u origin main
```

## Step 2 — Neon, the database (10 min)

1. Sign up at neon.tech with the info@ address (free tier is plenty forever
   at this size).
2. Create a project called `ean-office`, region **Frankfurt (eu-central-1)**.
3. Copy the **connection string** it shows — a long address starting
   `postgresql://`. That's your `DATABASE_URL`.
4. Create the tables (paste your real connection string in place of the
   placeholder):

```bash
DATABASE_URL="postgresql://…" npm run db:migrate
```

⚠️ Never run `npm run db:seed` against this database — that's fake demo data.

## Step 3 — Resend, the email (10 min)

1. Sign up at resend.com with the info@ address (free tier: 100 emails/day,
   comfortably enough).
2. **Domains → Add** `effectiefaltruisme.nl`. It gives you 2–3 DNS records to
   add wherever the domain's DNS lives — this is what keeps the office emails
   out of spam. Same place you'll add the record in step 5.
3. Create an **API key** and copy it.

## Step 4 — Vercel, the hosting (15 min)

1. Sign up at vercel.com **with email** (info@), not "Continue with GitHub" —
   that would tie the account to one person's GitHub. Connect GitHub
   afterwards when it asks.
2. **Add New → Project → Import** the `ean-office` repo.
3. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `RESEND_API_KEY` | the Resend key |
| `APP_SECRET` | a long random string — `openssl rand -base64 32` |
| `APP_URL` | `https://office.effectiefaltruisme.nl` |
| `EMAIL_FROM` | `EA Netherlands Office <office@effectiefaltruisme.nl>` |
| `CRON_SECRET` | another `openssl rand -base64 32` |

4. **Deploy.** Two minutes later you have a working URL like
   `ean-office-xxxx.vercel.app`. The daily job registers itself from
   `vercel.json`; Vercel passes `CRON_SECRET` automatically.

## Step 5 — the subdomain (5 min + DNS wait)

1. Vercel project → **Settings → Domains → Add** →
   `office.effectiefaltruisme.nl`.
2. Vercel shows a **CNAME record**. Add it where effectiefaltruisme.nl's DNS
   is managed (ask whoever set up the website): name `office`, value
   `cname.vercel-dns.com`.
3. Wait for Vercel to show it as valid — minutes, occasionally a few hours.

## Step 6 — first login and setup (20 min)

The database is empty, so there's no admin yet. Bootstrap yourself once:

```bash
DATABASE_URL="postgresql://…" npm run admin:add -- "James Herbert" james@effectiefaltruisme.nl
```

Then, on the live site:

1. **Log in** at `/login` with that address — the magic link now arrives as a
   real email. (If it doesn't, check Resend's dashboard for the domain
   verification status.)
2. **Admin → Members** — add Ricardo and Merlijn, then promote both to admin.
   The app warns until there are three. Add existing members from the
   Airtable export here too ("Add member manually").
3. **Admin → Settings** — check desk count, coverage days (Mon–Thu), arrival
   slots, office address, and the wifi password. Consider changing the wifi
   password itself: the old one sat on a public Notion URL.
4. **Admin → Info page** — read it through; it's pre-filled from the Notion
   content. The Notion page can then be archived.
5. **Admin → Events → Sync from Luma** — pulls your calendar in. Walk the
   past events once and set the right type on each (talk, social, themed
   coworking day…), since that's what the events-per-month figures in
   Reports are built from.
6. **Admin → QR** — print the stickers. One by the door, one on the lunch
   table, small ones on the desks.
7. **Admin → Reports** — should look sane and mostly empty. Real numbers
   start accumulating from day one of check-ins.

## Step 7 — switch the website and tell people (15 min)

1. Hand `WEBSITE-EDITS.md` to whoever manages Sanity: the two CTA swaps, the
   "already a member" link, and the one-working-day wording.
2. Export the Airtable base to CSV (every table), then cancel the
   subscription — but check the anonymous feedback form first, it's also on
   Airtable and is linked from the info page.
3. Announce it to members. Worth mentioning: booking moved off the Google
   Sheet, desks are now numbered so you can pick or move seats (or just book
   and get one assigned), the QR code by the door is how attendance gets
   counted, and profiles are optional.

## Afterwards

- **Code changes** — push to GitHub, Vercel redeploys itself.
- **Something looks broken** — Vercel dashboard → project → **Logs**.
- **Did the cron run?** — Vercel → Settings → Cron Jobs shows recent runs.
  You can also open `/admin/emails` to see everything the app has sent.
- **Backups** — Neon has point-in-time restore on the free tier. Downloading
  the reports CSV monthly is a decent second copy.
- **First month to watch** — the check-in rate on `/admin/reports`. Below
  ~70% is a problem to fix in the room (a nudge at lunch, a bigger sticker),
  not in the code.
