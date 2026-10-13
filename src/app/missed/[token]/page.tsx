import Link from "next/link";
import { verifyToken } from "@/lib/tokens";
import { ensureMigrated } from "@/db";
import { formatDayLong } from "@/lib/dates";
import { openMissedDays } from "@/lib/noshow";
import { MissedDaysForm } from "@/components/missed-days-form";
import { answerMissedByTokenAction } from "@/actions/tokens";

export const dynamic = "force-dynamic";

// Every missed check-in on one page, from the check-in email. No login
// needed: the link only lets you answer for your own missed days.
export default async function MissedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "missed");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          You can still tell us which days you were in from{" "}
          <Link href="/me" className="text-teal-700 underline">
            your bookings
          </Link>
          , or mention it to any of us and we&apos;ll fix the record.
        </p>
      </Shell>
    );
  }

  // The live list, not the one in the email: anything answered since (here,
  // on /me, or by an admin) has already dropped off.
  const dates = [
    ...new Set((await openMissedDays(verified.subject)).map((e) => e.date)),
  ];

  if (dates.length === 0) {
    return (
      <Shell>
        <h1 className="text-xl">All sorted</h1>
        <p className="text-slate-500 mt-2 text-sm">
          There are no missed check-ins left to answer. Thanks for keeping the
          record straight.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl">Which days were you in?</h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        You had a desk booked on {dates.length === 1 ? "this day" : "these days"}{" "}
        but no check-in. Tick the ones you came and we&apos;ll record you as
        present.
      </p>
      <MissedDaysForm
        days={dates.map((d) => ({ date: d, label: formatDayLong(d) }))}
        action={answerMissedByTokenAction.bind(null, token)}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-10 max-w-md mx-auto w-full">
      {children}
    </main>
  );
}
