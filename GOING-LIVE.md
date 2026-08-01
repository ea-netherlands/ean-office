# Going live — a walkthrough for James

No prior deployment experience assumed. Total time: roughly an hour, most of
it waiting for signups and DNS. Everything is on free tiers; the app costs
€0/month to run.

You'll create three free accounts (GitHub, Vercel, Neon), connect them
together, and point a subdomain at the result. Claude Code can drive most of
the terminal parts — this doc is so you understand what's happening and can
redo any step yourself.

---

## The mental model

- **GitHub** holds the code (like Google Drive for code, with history).
- **Vercel** runs the app. Every time the code on GitHub changes, Vercel
  rebuilds and republishes it automatically. It also runs the daily 08:00 job.
- **Neon** holds the database (who's a member, who booked what). It's
  Postgres, the same thing the app uses on this laptop, just hosted.
- **Resend** sends the emails (magic links, reminders, approvals).
- **DNS** is one record that makes `office.effectiefaltruisme.nl` point at
  Vercel.

## Step 1 — GitHub (10 min)

1. Create an account at github.com (or use EAN's if one exists).
2. Create a new **private** repository called `ean-office`. Don't add a
   README — the code already has one.
3. Push the code up. From a terminal in the `ean-office` folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/ean-office.git
git push -u origin main
```

(It will ask you to log in the first time.)

## Step 2 — Neon, the database (10 min)

1. Sign up at neon.tech (free tier — comfortably enough for this forever).
2. Create a project, call it `ean-office`, pick region **Frankfurt (eu-central-1)**.
3. It shows a **connection string** — a long address starting with
   `postgresql://…`. Copy it somewhere; that's your `DATABASE_URL`.
4. Create the tables by running the migrations once, from the `ean-office`
   folder:

```bash
DATABASE_URL="paste-the-connection-string-here" npx tsx -e "import('./src/db/index.ts').then(m=>m.ensureMigrated()).then(()=>{console.log('migrated');process.exit(0)})"
```

5. Do **not** run the seed script against this database — that's fake demo
   data. The real roster gets added through the app (step 6).

## Step 3 — Resend, the email (10 min)

1. Sign up at resend.com (free tier: 100 emails/day — plenty).
2. Add and verify the domain `effectiefaltruisme.nl` under **Domains**. It
   gives you 2–3 DNS records to add wherever your DNS is managed (same place
   as step 5 — likely your domain registrar or Cloudflare). This proves you
   own the domain so emails don't land in spam.
3. Create an **API key** and copy it.

## Step 4 — Vercel, the hosting (15 min)

1. Sign up at vercel.com **with your GitHub account** (that's the connection
   that makes deploys automatic).
2. **Add New → Project**, import the `ean-office` repository. Before hitting
   Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `RESEND_API_KEY` | the Resend key |
| `APP_SECRET` | a long random string — run `openssl rand -base64 32` in a terminal to make one |
| `APP_URL` | `https://office.effectiefaltruisme.nl` |
| `EMAIL_FROM` | `EA Netherlands Office <office@effectiefaltruisme.nl>` |
| `CRON_SECRET` | another random string (same `openssl` command) |

3. Hit **Deploy**. Two minutes later you get a working URL like
   `ean-office-xxxx.vercel.app`. The daily job is registered automatically
   (it's in `vercel.json`).

## Step 5 — the subdomain (5 min + DNS wait)

1. In the Vercel project: **Settings → Domains → Add** →
   `office.effectiefaltruisme.nl`.
2. Vercel shows you a **CNAME record**. Add it wherever
   effectiefaltruisme.nl's DNS lives (ask whoever set up the website —
   likely Cloudflare or the registrar): name `office`, value
   `cname.vercel-dns.com`.
3. Wait for it to go green in Vercel (minutes to a few hours).

## Step 6 — first login and setup (15 min)

1. Open `https://office.effectiefaltruisme.nl`. The database is empty, so
   there's no admin yet. Add yourself by running this once from your laptop:

```bash
DATABASE_URL="the-neon-connection-string" npx tsx -e "
import('./src/db/index.ts').then(async (m) => {
  const { newId } = await import('./src/lib/ids.ts');
  await m.ensureMigrated();
  await m.db.insert(m.users).values({ id: newId('usr'), name: 'James Herbert', email: 'james@effectiefaltruisme.nl', role: 'admin', status: 'active', approvedAt: new Date() });
  console.log('admin created'); process.exit(0);
});"
```

2. Log in on the site with that email — the magic link now arrives as a real
   email.
3. From **Admin → Members**, add Ricardo and Merlijn (then promote them to
   admin), and add the existing members from the Airtable export.
4. **Admin → Settings**: check desk count, coverage days, wifi password,
   office address. The Luma feed is pre-filled.
5. **Admin → Events → Sync from Luma**, then walk the list once setting the
   right type on past events (this is what makes the historical
   events-per-month numbers in Reports correct).
6. **Admin → QR**: print the stickers. Door, lunch table, desks.

## Step 7 — flip the website (5 min)

Hand `WEBSITE-EDITS.md` to whoever manages Sanity: the two CTA swaps, the
"already a member" link, the one-working-day copy. Export the Airtable base
to CSV, then cancel the subscription.

## Afterwards

- **Code changes**: any change pushed to GitHub redeploys automatically.
- **Something looks broken**: Vercel dashboard → the project → **Logs**.
- **Checking the cron ran**: Vercel → Settings → Cron Jobs shows the last runs.
- **Backups**: Neon keeps point-in-time restore on the free tier. The
  reports CSV export is also a de-facto data backup — download one monthly.
