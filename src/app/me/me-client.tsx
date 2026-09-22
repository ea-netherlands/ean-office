"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelBookingAction,
  cancelSeriesAction,
  changeSlotAction,
} from "@/actions/booking";
import { updatePrefsAction, ProfileState } from "@/actions/profile";
import { logoutAction } from "@/actions/auth";
import { ProfileForm } from "@/components/profile-form";
import { CommunityProfileCard } from "@/components/community-profile-card";
import { Card, Badge, Icon, Notice, btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/ui";
import { Slot, SLOT_LABEL } from "@/lib/slots";

type BookingRow = {
  id: string;
  date: string;
  dateLabel: string;
  seatType: string;
  deskNumber: number | null;
  deskWhere: string;
  slot: Slot;
  status: "booked" | "waitlisted";
  seriesId: string | null;
  calendarUrl: string | null;
};

export function MeClient({
  upcoming,
  windows,
  user,
}: {
  upcoming: BookingRow[];
  windows: { am: string; pm: string };
  user: {
    name: string;
    avatarUrl: string | null;
    noshowEmailOptOut: boolean;
    community: {
      profileVisible: boolean;
      bio: string | null;
      expertise: string | null;
      publicCauseAreas: string[] | null;
      publicLink: string | null;
    };
    profile: {
      causeArea: string | null;
      roleCategory: string | null;
      experienceLevel: string | null;
      eaFunding: string | null;
      gender: string | null;
      funders: string[] | null;
    };
    profileStale: boolean;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showProfile, setShowProfile] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [prefsState, prefsAction] = useActionState<ProfileState, FormData>(
    updatePrefsAction,
    {}
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing booked. <a href="/book" className="text-teal-700 font-medium">Book a desk →</a>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-sm font-medium">{b.dateLabel}</span>{" "}
                    {b.slot !== "day" && <Badge tone="teal">{SLOT_LABEL[b.slot]}</Badge>}
                    {b.status === "waitlisted" && <Badge tone="amber">waitlist</Badge>}
                    {b.seriesId && <Badge>repeating</Badge>}
                    {/* Which seat, and where it is. The desk number on its own
                        means nothing until about your fifth visit. */}
                    {b.status === "booked" && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {b.seatType === "flex" ? (
                          "Lunch-table spot, by the kitchen"
                        ) : b.deskNumber ? (
                          <>
                            Desk {b.deskNumber}
                            {b.deskWhere ? `, ${b.deskWhere}` : ""}
                          </>
                        ) : (
                          "Desk to be assigned"
                        )}
                        {b.slot !== "day" && ` · ${windows[b.slot]}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {b.calendarUrl && (
                      <a
                        href={b.calendarUrl}
                        className="text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1"
                        title="Download this day as a calendar invite"
                      >
                        <Icon name="calendar-plus" />
                        Calendar
                      </a>
                    )}
                    <button
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await cancelBookingAction(b.id);
                          router.refresh();
                        })
                      }
                      className="text-xs text-red-700 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    {b.seriesId && (
                      <button
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await cancelSeriesAction(b.seriesId!);
                            router.refresh();
                          })
                        }
                        className="text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"
                        title="Cancel all remaining days in this series"
                      >
                        Cancel series
                      </button>
                    )}
                  </div>
                </div>
                {/* Handing back half a day you won't use. The morning reminder
                    already offers this for the afternoon; people asked for the
                    morning too, and for somewhere other than that one email. */}
                {b.status === "booked" && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(["day", "am", "pm"] as Slot[])
                      .filter((s) => s !== b.slot)
                      .map((s) => (
                        <button
                          key={s}
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setSlotError(null);
                              const res = await changeSlotAction(b.id, s);
                              if (res.error) setSlotError(res.error);
                              router.refresh();
                            })
                          }
                          className="text-xs text-teal-700 border border-teal-200 bg-teal-50/60 rounded-lg px-2.5 py-1 hover:bg-teal-50 cursor-pointer disabled:opacity-50"
                        >
                          {s === "day"
                            ? "Make it a full day"
                            : s === "am"
                              ? "Morning only"
                              : "Afternoon only"}
                        </button>
                      ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {slotError && (
          <Notice tone="error" className="mt-3">
            {slotError}
          </Notice>
        )}
      </Card>

      <CommunityProfileCard
        community={user.community}
        name={user.name}
        avatarUrl={user.avatarUrl}
      />

      <Card>
        <div className="flex items-center justify-between">
          <h2>Your profile</h2>
          <button
            className="text-sm text-teal-700 font-medium cursor-pointer"
            onClick={() => setShowProfile((v) => !v)}
          >
            {showProfile ? "Close" : user.profile.causeArea ? "Update" : "Complete it"}
          </button>
        </div>
        {user.profileStale && user.profile.causeArea && (
          <p className="text-sm text-orange-700 mt-1">
            It&apos;s been over a year — mind checking your answers are still
            right? Cause areas and funding change.
          </p>
        )}
        {!user.profile.causeArea && !showProfile && (
          <p className="text-sm text-slate-500 mt-1">
            Five questions that power the office&apos;s funder reports. Takes
            30 seconds.
          </p>
        )}
        {showProfile && (
          <div className="mt-4">
            <ProfileForm initial={user.profile} onDone={() => { setShowProfile(false); router.refresh(); }} />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3">Preferences</h2>
        <form action={prefsAction} className="space-y-3">
          <div>
            <label className={labelCls}>Name</label>
            <input name="name" defaultValue={user.name} className={inputCls} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="noshowEmailOptOut"
              defaultChecked={user.noshowEmailOptOut}
              className="mt-0.5"
            />
            <span>
              Don&apos;t email me about missed check-ins. (We&apos;ll still
              gently mention it in person if it keeps happening.)
            </span>
          </label>
          {prefsState.ok && <p className="text-sm text-teal-700">Saved.</p>}
          {prefsState.error && <p className="text-sm text-red-700">{prefsState.error}</p>}
          <button type="submit" className={btnSecondary}>
            Save preferences
          </button>
        </form>
      </Card>

      <form action={logoutAction}>
        <button type="submit" className={btnDanger}>
          Log out
        </button>
      </form>
    </div>
  );
}

