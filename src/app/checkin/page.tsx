import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db, checkins, events, eventAttendance, ensureMigrated } from "@/db";
import { and, eq } from "drizzle-orm";
import { todayAms, formatDayLong } from "@/lib/dates";
import { capacityForDay, checkInUser } from "@/lib/booking";
import { CheckinButtons, EventCheckinButtons } from "./checkin-buttons";
import { btnPrimary, btnSecondary, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

// The QR target. Deliberately minimal — no nav, huge tap targets, tiny page
// so it loads on bad wifi at the door.
export default async function CheckinPage() {
  await ensureMigrated();
  const user = await getCurrentUser();
  const today = todayAms();

  if (!user) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Welcome!</h1>
        <p className="text-slate-500 mt-2 mb-6">
          Log in to check in — it takes one tap after that.
        </p>
        <Link href="/login?next=/checkin" className={`${btnPrimary} w-full text-base py-3.5`}>
          Log in with email
        </Link>
        <p className="text-sm text-slate-500 mt-6">
          Looks like you&apos;re new — welcome!{" "}
          <Link href="/join" className="text-teal-700 font-medium">
            Request a first visit here
          </Link>
          .
        </p>
      </Shell>
    );
  }

  const [existing] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.date, today)));

  const todaysEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.date, today), eq(events.status, "confirmed")));
  const myEventCheckins = new Set(
    (
      await db
        .select()
        .from(eventAttendance)
        .where(
          and(
            eq(eventAttendance.userId, user.id),
            eq(eventAttendance.source, "checkin")
          )
        )
    ).map((a) => a.eventId)
  );

  const cap = await capacityForDay(today);
  const booked = cap.people.some((p) => p.id === user.id);

  // Booked and not yet checked in: check in right now, zero extra taps.
  let justCheckedIn = false;
  if (booked && !existing) {
    const res = await checkInUser(user.id, today);
    justCheckedIn = res.ok;
  }

  const checkedIn = !!existing || justCheckedIn;

  return (
    <Shell>
      {checkedIn ? (
        <>
          <Icon name="circle-check" className="text-6xl text-teal-600 mb-3" />
          <h1 className="text-2xl font-bold">
            {justCheckedIn ? "Checked in. Welcome!" : "You're already checked in"}
          </h1>
          <p className="text-slate-500 mt-2">
            {formatDayLong(today)} · have a great day, {user.name.split(" ")[0]}!
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Hi {user.name.split(" ")[0]}</h1>
          <p className="text-slate-600 mt-2 mb-5">
            You&apos;re not booked today — check in anyway?
            {cap.full && " The day is technically full, but you're here, so come on in."}
          </p>
          <CheckinButtons full={cap.full} />
        </>
      )}

      {todaysEvents.length > 0 && (
        <div className="mt-8 w-full">
          <p className="text-sm text-slate-500 mb-2">Here for an event?</p>
          <EventCheckinButtons
            events={todaysEvents.map((e) => ({
              id: e.id,
              title: e.title,
              done: myEventCheckins.has(e.id),
            }))}
          />
        </div>
      )}

      <p className="text-xs text-slate-400 mt-10">
        Checking in helps us show funders the office is being used. It&apos;s
        never required — nobody gets turned away.
      </p>
      <Link href="/" className={`${btnSecondary} mt-4`}>
        Go to the app
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-10 max-w-sm mx-auto">
      {children}
    </main>
  );
}
