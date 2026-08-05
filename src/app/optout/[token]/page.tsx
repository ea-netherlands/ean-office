import { verifyToken } from "@/lib/tokens";
import { ensureMigrated } from "@/db";
import { TokenConfirm } from "@/components/token-confirm";
import { optoutByTokenAction } from "@/actions/tokens";

export const dynamic = "force-dynamic";

export default async function OptoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "optout");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          You can change email preferences any time from your profile page.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl">Stop check-in emails?</h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        We won&apos;t email you about missed check-ins again. (You can turn
        them back on from your profile page.)
      </p>
      <TokenConfirm
        token={token}
        action={optoutByTokenAction}
        label="Yes, stop these emails"
        doneTitle="Done"
        doneText="You won't get check-in emails anymore."
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
