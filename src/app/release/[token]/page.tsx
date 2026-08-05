import { verifyToken } from "@/lib/tokens";
import { db, bookings, users, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";
import { formatDayLong } from "@/lib/dates";
import { asSlot } from "@/lib/slots";
import { getSettings } from "@/lib/settings";
import { Icon } from "@/components/ui";
import { ReleaseConfirm } from "./release-confirm";

export const dynamic = "force-dynamic";

// No-login target from the morning reminder: "only here this morning?". One
// confirmation tap (email link-prefetchers must not shorten bookings), then
// the desk is free from lunch for someone else.
export default async function ReleasePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await ensureMigrated();
  const { token } = await params;
  const verified = verifyToken(token, "release");

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">This link has expired</h1>
        <p className="text-slate-500 mt-2 text-sm">
          The booking day has probably passed. You can manage bookings any time
          at <a href="/me" className="text-teal-700">your bookings page</a>.
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
  const cfg = await getSettings();
  const slot = asSlot(booking.slot);

  if (booking.status === "cancelled") {
    return (
      <Shell>
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-2" />
        <h1 className="text-xl font-bold">That booking is already cancelled</h1>
        <p className="text-slate-500 mt-2 text-sm">
          {formatDayLong(booking.date)} is free again — thank you.
        </p>
      </Shell>
    );
  }

  if (slot === "am") {
    return (
      <Shell>
        <Icon name="circle-check" className="text-5xl text-teal-600 mb-2" />
        <h1 className="text-xl font-bold">Your afternoon is free</h1>
        <p className="text-slate-500 mt-2 text-sm">
          You have desk {booking.deskNumber} for the morning ({cfg.am_window})
          on {formatDayLong(booking.date)}. Someone else can take it from lunch.
        </p>
      </Shell>
    );
  }

  if (slot === "pm") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">That&apos;s an afternoon booking</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Nothing to free up. Can&apos;t make it at all? Cancel from{" "}
          <a href="/me" className="text-teal-700">your bookings page</a>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold">Only here this morning?</h1>
      <p className="text-slate-600 mt-2 mb-5 text-sm">
        {owner?.name} · <strong>{formatDayLong(booking.date)}</strong>
        <br />
        We&apos;ll keep{" "}
        {booking.seatType === "flex"
          ? "your lunch-table spot"
          : `desk ${booking.deskNumber}`}{" "}
        for you until lunch ({cfg.am_window}) and open it up for someone else
        after that.
      </p>
      <ReleaseConfirm token={token} />
      <p className="text-xs text-slate-400 mt-4">
        Changed your mind later? You can stretch it back to a full day from the
        booking page, space permitting.
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
