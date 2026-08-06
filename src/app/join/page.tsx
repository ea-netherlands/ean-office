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
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await getCurrentUser();
  const cfg = await getSettings();

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
          Tell us a little about yourself, pick a day, and we&apos;ll confirm
          within one working day.
        </Sub>
        <JoinForm
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
