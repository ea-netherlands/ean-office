import { verifyToken } from "@/lib/tokens";
import { db, bookings, users, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";
import { formatDayLong } from "@/lib/dates";
import { asSlot, slotSuffix } from "@/lib/slots";
import { Icon } from "@/components/ui";
import { CancelConfirm } from "./cancel-confirm";

export const dynamic = "force-dynamic";

// No-login cancel target from emails. One confirmation tap (so that email
// link-prefetchers can't cancel bookings), then done.
export default async function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "cancel");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          The booking day has probably passed. You can manage bookings any
          time at <a href="/me" className="text-teal-700">your bookings page</a>.
        </p>
      </Shell>
    );
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, verified.subject));
  if (!booking) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Booking not found</h1>
      </Shell>
    );
  }
  const [owner] = await db.select().from(users).where(eq(users.id, booking.userId));

  if (booking.status === "cancelled") {
    return (
      <Shell>
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-2" />
        <h1 className="text-xl font-bold">Already cancelled</h1>
        <p className="text-slate-500 mt-2 text-sm">
          {formatDayLong(booking.date)} is free again. Thanks for freeing the desk!
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold">Cancel this booking?</h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        {owner?.name} · <strong>{formatDayLong(booking.date)}</strong>
        {slotSuffix(asSlot(booking.slot))}
        {booking.seatType === "flex" ? " (lunch table)" : ""}
      </p>
      <CancelConfirm token={token} />
      <p className="text-xs text-slate-400 mt-4">
        No reason needed — cancelling frees the desk for someone else.
      </p>
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
