import Link from "next/link";
import { verifyToken } from "@/lib/tokens";
import { ensureMigrated } from "@/db";
import { formatDayLong } from "@/lib/dates";
import { missedPath } from "@/lib/noshow";
import { TokenConfirm } from "@/components/token-confirm";
import { retroByTokenAction } from "@/actions/tokens";

export const dynamic = "force-dynamic";

// "Were you actually there?" — one tap fixes the record, no login needed.
export default async function RetroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "retro");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          If you were at the office that day, you can still say so from{" "}
          <Link href="/me" className="text-teal-700 underline">
            your bookings
          </Link>
          , or mention it to any of us and we&apos;ll fix the record.
        </p>
      </Shell>
    );
  }

  const [userId, date] = verified.subject.split(":");
  // Emails sent before the one-page version link here a day at a time. Offer
  // the rest from the same tap rather than another trip back to the inbox.
  const allDays = missedPath(userId);
  return (
    <Shell>
      <h1 className="text-xl">Were you at the office?</h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        <strong>{formatDayLong(date)}</strong> — one tap and we&apos;ll record
        you as present. Thanks for fixing our data!
      </p>
      <TokenConfirm
        token={token}
        action={retroByTokenAction}
        label="Yes, I was there"
        doneTitle="Record fixed"
        doneText="You're marked as present. Thanks — this keeps our usage numbers honest."
      />
      <Link
        href={allDays}
        className="text-sm text-teal-700 underline mt-5"
      >
        Missed more than one? Answer for them all on one page
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 max-w-sm mx-auto">
      {children}
    </main>
  );
}
