import { verifyToken } from "@/lib/tokens";
import { ensureMigrated } from "@/db";
import { formatDayLong } from "@/lib/dates";
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
        <h1 className="text-xl font-bold">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          If you were at the office that day, just mention it to any admin and
          they&apos;ll fix the record.
        </p>
      </Shell>
    );
  }

  const date = verified.subject.split(":")[1];
  return (
    <Shell>
      <h1 className="text-xl font-bold">Were you at the office?</h1>
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
