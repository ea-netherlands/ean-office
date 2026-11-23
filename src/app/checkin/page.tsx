import Link from "next/link";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { db, checkins, events, eventAttendance, ensureMigrated } from "@/db";
import { and, eq } from "drizzle-orm";
import { todayAms, formatDayLong } from "@/lib/dates";
import { capacityForDay, checkInUser } from "@/lib/booking";
import { CheckinButtons, EventCheckinButtons } from "./checkin-buttons";
import { btnPrimary, btnSecondary, Card, Icon } from "@/components/ui";
import { SurveyCard } from "@/components/survey-card";
import { PeopleList } from "@/components/people";
import { newFaceIds, NewFacesNote, ProfilePrompt } from "@/components/meet-people";

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
        <h1 className="text-2xl">Welcome!</h1>
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

  // Who else is here. The door is where a bio pays off the same day: you're
  // about to sit next to these people, and seeing that they've said what
  // they do is the best argument for saying what you do.
  const seen = new Set<string>([user.id]);
  const others = cap.people.filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  const described = others.filter((p) => !!p.profile?.bio).length;
  const newFaces = checkedIn
    ? await newFaceIds(user.id, others.map((p) => p.id), today)
    : new Set<string>();

  return (
    <Shell>
      {checkedIn ? (
        <>
          <Icon name="circle-check" className="text-6xl text-teal-600 mb-3" />
          <h1 className="text-2xl">
            {justCheckedIn ? "Checked in. Welcome!" : "You're already checked in"}
          </h1>
          <p className="text-slate-500 mt-2">
            {formatDayLong(today)} · have a great day, {user.name.split(" ")[0]}!
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl">Hi {user.name.split(" ")[0]}</h1>
          {isActiveMember(user) ? (
            <>
              <p className="text-slate-600 mt-2 mb-5">
                You&apos;re not booked today — check in anyway?
                {cap.full && " The day is technically full, but you're here, so come on in."}
              </p>
              <CheckinButtons full={cap.full} />
            </>
          ) : (
            <p className="text-slate-600 mt-2 mb-5">
              You don&apos;t have a desk booked today, and checking in without
              one is for members. Here for an event? Tap it below.
            </p>
          )}
        </>
      )}

      {checkedIn && others.length > 0 && (
        <Card className="mt-8 w-full text-left">
          <h2>In today</h2>
          <p className="text-sm text-slate-600 mt-1 mb-3">
            {others.length === 1
              ? "1 other person is booked today."
              : `${others.length} other people are booked today.`}
            {described > 0 &&
              ` ${described === others.length ? (others.length === 1 ? "They've" : "All of them have") : `${described} of them have`} said what they're working on — tap a name to read it.`}
          </p>
          <PeopleList
            people={others.map((p) => ({
              id: p.id,
              name: p.name,
              seatType: p.seatType,
              deskNumber: p.deskNumber,
              slot: p.slot,
              avatarUrl: p.avatarUrl,
              profile: p.profile,
              isNew: newFaces.has(p.id),
            }))}
          />
          <NewFacesNote
            names={others.filter((p) => newFaces.has(p.id)).map((p) => p.name)}
            total={others.length}
          />
        </Card>
      )}

      {checkedIn && (
        <ProfilePrompt user={user} othersCount={others.length} className="mt-4 w-full" />
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

      <SurveyCard className="mt-8 w-full" />

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
