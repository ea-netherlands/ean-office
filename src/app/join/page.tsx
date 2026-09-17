import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import {
  addDays,
  formatDay,
  isWorkingDay,
  isoWeekday,
  todayAms,
  WEEKDAY_NAMES,
} from "@/lib/dates";
import { adminsAway } from "@/lib/away";
import { AwayNotice } from "@/components/away-notice";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await getCurrentUser();
  const cfg = await getSettings();
  const away = adminsAway(cfg.admin_back_on);

  // Only days with host coverage appear, and only future working days —
  // this is the entire fix for "someone has to be there at 09:00". The chips
  // cover the next few weeks; anything further out goes through the date
  // field, which the same rules validate on submit.
  const today = todayAms();
  const horizon = addDays(today, cfg.join_horizon_days);
  const slots: { date: string; label: string }[] = [];
  for (
    let d = addDays(today, 1);
    slots.length < cfg.join_quick_days && d <= horizon;
    d = addDays(d, 1)
  ) {
    if (!isWorkingDay(d)) continue;
    if (!cfg.host_coverage_days.includes(isoWeekday(d))) continue;
    slots.push({ date: d, label: formatDay(d) });
  }
  const coverageNames = cfg.host_coverage_days
    .map((d) => WEEKDAY_NAMES[d - 1])
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Request a first visit</H1>
        <Sub>
          Tell us a little about yourself, pick a day, and{" "}
          {away
            ? "we'll confirm once we're back"
            : "we'll confirm within one working day"}
          . That first visit is a trial day — come see if it&apos;s a good
          fit, and we&apos;ll follow up afterwards about joining properly.
        </Sub>
        <AwayNotice away={away} className="mb-5" />

        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-5 text-sm text-slate-700 space-y-2">
          <p className="font-medium text-slate-900">
            You&apos;re warmly welcome if at least one of these describes you:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>You work in a high-impact job or project</li>
            <li>
              You&apos;re exploring or pursuing opportunities based on the{" "}
              <a
                href="https://www.centreforeffectivealtruism.org/core-principles"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                principles that unite the EA community
              </a>{" "}
              — including starting something yourself
            </li>
            <li>You&apos;re a student directing your studies toward a high-impact career</li>
            <li>You volunteer for an EA-aligned organisation</li>
          </ul>
          <p>
            That covers a lot of ground on purpose. Researching global
            health, upskilling in policy, planning your donations,
            job-hunting in animal advocacy, running an EA project on the side
            of your day job — all of it belongs here.
          </p>
        </div>

        <JoinForm
          away={away}
          days={slots}
          arrivals={cfg.arrival_slots}
          lastDate={horizon}
          firstDate={addDays(today, 1)}
          coverageNames={coverageNames}
        />
        <p className="text-xs text-slate-400 mt-6 max-w-prose">
          Privacy: we store only what you enter here, use it to run the office
          and report aggregate (never individual) usage statistics to our
          funder, and delete it on request. Questions:
          office@effectiefaltruisme.nl.
        </p>
      </Page>
    </>
  );
}
