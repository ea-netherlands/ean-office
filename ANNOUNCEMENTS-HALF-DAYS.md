# Bringing everyone across + announcing half days

Drafts for the member migration and the half-day change. Same deal as
`ANNOUNCEMENTS.md` — written in your voice as best I can guess it, edit freely.

Sequencing matters here: **import first, then email.** The claim link only
works once the account exists, and the whole design of the import is that it's
silent until someone hears from a human ([MEMBER-IMPORT.md](MEMBER-IMPORT.md)).

Per `MEMBER-IMPORT.md`, these go out through **whatever tool sends the EAN
newsletter, not the app** — `src/lib/email.ts` sends one Resend call per
recipient with no batching, and Resend's free tier caps at 100/day.

---

## 1. Regulars — personal email, one to one

For the couple of dozen people who actually use the office. Worth sending
individually (or at least mail-merged) rather than as a blast, because these
are the people whose bookings you're moving and who'll notice if it's cold.

> **Subject:** Your office bookings have moved (and half days are a thing now)
>
> Hi {first name},
>
> Two bits of office news, both of which should make your life slightly
> easier.
>
> **The booking sheet is gone.** Desk booking now lives at
> office.effectiefaltruisme.nl — no more scrolling to find today's row. There's
> no password: put your email in and it sends you a link.
>
> I've already moved your existing bookings across, so have a look and check
> I got them right. If something's off, cancelling and rebooking takes one tap.
>
> **You can now book half days.** Morning, afternoon, or the whole day. You
> were already doing this by hand in the sheet — writing "(afternoon)" next to
> your name — so the app now does it properly: two people can share one desk,
> and the handover is lunch. If you have the morning, pack up by the end of it.
> If you have the afternoon, the desk is yours once lunch clears. Nobody has to
> negotiate anything.
>
> Why we bothered: there are eight desks. Someone booking a full day and
> leaving at one o'clock costs a desk that another person could have used, and
> nobody was going to feel good about policing that. Now you can just book what
> you'll actually use. There's also a link in the morning reminder that hands
> back your afternoon in one tap if plans change.
>
> First time you log in it'll ask you to confirm your name and tick the office
> guidelines. Thirty seconds, once.
>
> Any of this behaving oddly, tell me — it's new enough that I'd rather hear
> about it twice than not at all.
>
> {your name}

---

## 2. Long tail — one paragraph in the newsletter

For everyone who's ever signed up but doesn't come regularly. No chasing, no
follow-up. Per `MEMBER-IMPORT.md`: if they never claim, that's the correct
outcome, not a failure.

> **Coworking office: new booking system**
>
> Desk booking for the Amsterdam office has moved from the Google Sheet to
> office.effectiefaltruisme.nl. If you've been to the office or signed up
> before, you already have an account — enter your email and it'll send you a
> login link, no password. You can book a full day or just a morning or
> afternoon, which is new: two people can share a desk across the lunch
> handover, so a half day no longer costs a whole one. There are only eight
> desks, so this genuinely helps. Everything about the space — address, wifi,
> guidelines, what's on — is at office.effectiefaltruisme.nl/info.

---

## 3. Existing app users — short note

For anyone who already claimed an account before this change, so they don't
get the "your bookings have moved" framing they won't recognise.

> **Subject:** Half-day desk bookings
>
> Hi {first name},
>
> Small addition to the office app: you can now book a desk for just a morning
> or just an afternoon, instead of only whole days.
>
> The handover is lunch — morning bookings pack up by the end of it, afternoon
> bookings start once it's cleared — so two people can share a desk without
> having to coordinate. With eight desks, that's the difference between a half
> day costing a desk and costing half of one.
>
> The morning reminder email also has a one-tap link to hand back your
> afternoon if you're only in for half the day after all.
>
> office.effectiefaltruisme.nl/book — the day panel now has Full day / Morning
> / Afternoon at the top.
>
> {your name}

---

## 4. Slack — #general or the office channel

> Desk booking now does half days. Morning, afternoon, or the full day —
> the handover is lunch, so two people can share a desk without negotiating
> it. Handy given there are only eight. office.effectiefaltruisme.nl/book
>
> If you used to write "(afternoon)" next to your name in the old sheet: that
> now exists as an actual booking.

---

## Notes on what I did and didn't assume

**"Onboard everyone" needs a list I don't have.** The hotdesk spreadsheet has
first names only — one email address in the entire workbook, and that one
incidental. `/admin/import` needs name + email per row. Wherever the real
member list lives (Airtable, the newsletter tool, the old signup form), that's
the file to feed it.

**I didn't import anything from the "Setup" sheet.** It has a name/gender
table. Gender in the app is a self-reported M&E field collected under an
aggregate-only promise — backfilling it from a spreadsheet would put data in
people's profiles that they didn't give the app, so it stays out.

**Desk numbers didn't come across.** The sheet's desk columns are positional
and don't correspond to the app's floor plan, so the app assigns desks itself.
"Work café" entries became lunch-table (flex) bookings.

**Seven entries need your call** — four "James S. maybe" and three "Sjir
maybe". Pencilled-in, not booked. They're marked `review` in the CSV and
skipped unless you pass `--include-review`.
