# Draft messages for the office app launch

Four Slack drafts. Edit freely — they're written in your voice as best I can
guess it, but you know these people.

---

## 1. Dennis — website volunteer

Hi Dennis! We've built a proper booking system for the coworking office —
it's live at office.effectiefaltruisme.nl and replaces both the Airtable
signup form and the Google Sheet.

Could you make three small changes to the office page in Sanity when you get
a chance? No rush, but ideally before we announce it to members.

1. Both "Sign up for your first day" buttons currently point at the Airtable
   form (airtable.com/appEG9I1eZgf9DMfT/...). Please point them at
   https://office.effectiefaltruisme.nl/join instead.

2. Add a link for existing members somewhere near the first CTA — something
   like: "Already a member? Book a desk →" pointing at
   https://office.effectiefaltruisme.nl/book. At the moment there's no way
   for regulars to find the booking system from the page.

3. In "How it works", step 2 says we confirm within two working days. Could
   you change that to one working day? The new system flags requests to all
   admins after a day, so we can actually hold to that now.

Two questions while I have you: Marieke used to run website tasks through
Asana and I've never touched it — do you still use that board, and would you
rather I put requests there than in Slack? And do you know whose Vercel
account the website is hosted on? I noticed it isn't under any EAN account I
can find, and I'd like us to have access.

Thanks!

---

## 2. Merlijn — office volunteer / admin

Hi Merlijn! Quick heads up: the office has a new booking and check-in system,
live at office.effectiefaltruisme.nl. It replaces the Airtable form, the
approval emails, and the Google Sheet — all three in one place.

You're set up as one of three admins (you, me and Ricardo). Log in at
office.effectiefaltruisme.nl/login with your EAN address — no password, it
emails you a link.

What's different for you:

- New-visitor requests land in Admin → Requests instead of an email chain.
  Any of the three of us can approve, and cards turn amber after two working
  days so nothing gets lost. We're now promising people a decision within one
  working day, which is the main thing this fixes.
- First visits can only be booked on days we've said have host coverage
  (currently Mon–Thu, arriving 11:00 or 13:00), so nobody turns up on a day
  with no one to greet them.
- Admin → Today shows who's booked and who's actually checked in.
- Desks are numbered 1–8 now, and people can pick or swap a specific desk
  when they book. There's a floor plan in the app.

One thing I'd really appreciate your help with: getting people into the habit
of scanning the QR code when they arrive. I'll print stickers for the door,
the lunch table and each desk. The check-in numbers are what we report to
EAIF, and attendance can't be backfilled — every week without check-ins is a
permanent gap in the next funding application.

Have a click around and tell me what's confusing or annoying — easier to fix
now than later.

---

## 3. Ricardo — co-director

Hi Ricardo — the office booking system is live: office.effectiefaltruisme.nl.
Wanted to give you the short version plus a couple of things that need a
decision.

What it replaces: the Airtable signup form (which we can now cancel, ~$48/mo),
the email approval chain, and the shared Google Sheet. Members book desks
themselves, including recurring bookings, and check in by scanning a QR code
by the door.

Why I think it's worth the attention it'll cost us: it produces the EAIF
numbers automatically. Admin → Reports gives visits, unique visitors,
occupancy, events against our 2–4/month target, and the demographic splits —
and crucially it reports them both as % of people and % of desk-days, which
is a much stronger claim than the 21-person survey we've been using.

The uncomfortable bit worth knowing: the 62% occupancy figure we reported to
EAIF came from Marieke manually checking the booking sheet. That process
stopped when she left, so there's likely a gap in the current grant year. The
new system measures honestly from here, and reports both "booked" and
"attended" occupancy so we can show the difference rather than paper over it.
I'd suggest we say in the next report that measurement changed and why —
volunteering that reads as rigour.

Expect the new number to be lower than 62%. I think a defensible 60% beats an
unreproducible 75%.

Things I'd like from you:

1. You're set up as an admin — log in at office.effectiefaltruisme.nl/login
   and help clear the approval queue. Three admins is deliberate: single-admin
   is exactly the failure we're fixing.
2. The accounts (Vercel, Neon, Resend) are under info@ and the code is in a
   new ea-netherlands GitHub org. Everything's free tier — €0/month. Could
   you make sure the logins go in the shared password manager?
3. Separately: our main website is hosted on a Vercel account that doesn't
   seem to belong to EAN. Worth chasing down who controls it.

Happy to walk you through it whenever.

---

## 4. Office users — #general or the office channel

Hi all — the office has a new booking system:
**office.effectiefaltruisme.nl**

The Google Sheet is retired. To log in, enter your email and click the link
we send you — no passwords.

What's new:

- **Book any day in a couple of taps**, and see who else is coming.
- **Repeating bookings.** "Every Tuesday until December" is now one action
  instead of twelve rows in a spreadsheet.
- **Desks are numbered.** You can pick a specific desk from a floor plan, or
  just book and get assigned one — whatever you prefer. You can also grab a
  lunch-table spot the same way.
- **Cancelling takes one tap**, including straight from the reminder email,
  without logging in. Please do use it — with only eight desks, a held desk
  nobody uses is 12.5% of the office.

**Please scan the QR code when you arrive.** There's one by the door and one
on the lunch table. It takes two taps. We use it to show funders the office
is actually being used, which is what keeps it free — it's not about
monitoring anyone, and nobody is ever turned away for skipping it.

Optional: you can add a short profile (what you're working on, what to ask
you about) so people can see who's in on a given day. It's off by default —
turn it on from the "Me" page if you want it.

Practical info — address, wifi, phone booths, meeting rooms, hosting events
— has moved from Notion to office.effectiefaltruisme.nl/info.

Bugs, confusions, and "why does it do that" all welcome — send them my way.

---

## 5. Daniel — WhatsApp, about the website's Vercel account

Hey Daniel, hope you're well!

Quick question. I've just set up a Vercel account for a new office booking
app (office.effectiefaltruisme.nl), and while I was in there I noticed the
main website is hosted on a Vercel account I can't find under any EAN login.
I'm guessing that's yours from when you built it?

If so, totally fine — but I'd love to get EAN access, just so we're not stuck
if you're ever busy or unavailable. We've had a couple of things lately where
only one person could get in, and I'm trying to tidy that up.

Easiest is probably either transferring the project to our account
(info@effectiefaltruisme.nl) or adding us to it somehow. Happy to do the
fiddly bits myself if you can point me in the right direction. Same question
for Sanity, if that's under your account too.

Thanks again for building it — it looks great.
