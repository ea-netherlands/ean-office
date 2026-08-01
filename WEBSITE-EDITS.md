# Website edits for the office app launch

Hand this to whoever manages Sanity for effectiefaltruisme.nl. All edits are
on the office page (`/en/office` and its Dutch counterpart). Do them **after**
`office.effectiefaltruisme.nl` is live and pointing at the app.

## 1. Swap both sign-up CTAs (required)

The page has two "Sign up for your first day" buttons, both currently
pointing at the Airtable form:

- Old: `https://airtable.com/appEG9I1eZgf9DMfT/shru3iwGv0oV28AMw`
- New: `https://office.effectiefaltruisme.nl/join`

Button label can stay exactly as it is.

⚠️ Before cancelling the Airtable subscription, export the base to CSV
(every table). Existing members can be added to the app's roster from
`/admin/members` → "Add member manually".

## 2. Add a member entry point (recommended)

The page currently has no way for existing members to reach the booking
system. Two placements, pick either or both:

**Under the hero CTA**, as a quiet secondary link:

> Already a member? [Book a desk →](https://office.effectiefaltruisme.nl/book)

**In "How it works", step 4** — link the existing copy:

> After that, [book any day you like](https://office.effectiefaltruisme.nl/book)
> with our simple booking system.

## 3. Align the confirmation promise (pick one)

The site says "We confirm within **two** working days"; the app and its
acknowledgement email promise **one** working day, and the admin queue is
built to keep that promise (requests are flagged to all admins after one
day). Recommended edit, in "How it works" step 2:

- Old: "We confirm within two working days and agree your first day."
- New: "We confirm within one working day and agree your first day."

If you'd rather keep "two" on the site, tell James so the app's email copy
gets changed instead — the same person shouldn't get two different promises.

## 4. No other changes

- "See what's on" keeps pointing at the events page — the app deliberately
  doesn't do event promotion.
- The office page remains the single home for the pitch, photos, and FAQ.
  The app links back to the site for the code of conduct and only carries
  day-of practical info itself.
