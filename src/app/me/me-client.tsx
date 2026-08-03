"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelBookingAction,
  cancelSeriesAction,
} from "@/actions/booking";
import {
  updatePrefsAction,
  saveCommunityProfileAction,
  ProfileState,
} from "@/actions/profile";
import { logoutAction } from "@/actions/auth";
import { ProfileForm } from "@/components/profile-form";
import { CAUSE_AREAS } from "@/lib/profile-options";
import { Card, Badge, btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/ui";

type BookingRow = {
  id: string;
  date: string;
  dateLabel: string;
  seatType: string;
  status: "booked" | "waitlisted";
  seriesId: string | null;
};

export function MeClient({
  upcoming,
  user,
}: {
  upcoming: BookingRow[];
  user: {
    name: string;
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
  const [prefsState, prefsAction] = useActionState<ProfileState, FormData>(
    updatePrefsAction,
    {}
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing booked. <a href="/book" className="text-teal-700 font-medium">Book a desk →</a>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((b) => (
              <li key={b.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium">{b.dateLabel}</span>{" "}
                  {b.seatType === "flex" && <Badge tone="amber">lunch table</Badge>}
                  {b.status === "waitlisted" && <Badge tone="amber">waitlist</Badge>}
                  {b.seriesId && <Badge>repeating</Badge>}
                </div>
                <div className="flex gap-1.5">
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
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CommunityProfileCard community={user.community} />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Your profile</h2>
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
        <h2 className="font-semibold mb-3">Preferences</h2>
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

function CommunityProfileCard({
  community,
}: {
  community: {
    profileVisible: boolean;
    bio: string | null;
    expertise: string | null;
    publicCauseAreas: string[] | null;
    publicLink: string | null;
  };
}) {
  const [open, setOpen] = useState(community.profileVisible);
  const [visible, setVisible] = useState(community.profileVisible);
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    saveCommunityProfileAction,
    {}
  );

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          Who&apos;s-in profile{" "}
          {community.profileVisible ? (
            <Badge tone="teal">visible to members</Badge>
          ) : (
            <Badge>off</Badge>
          )}
        </h2>
        <button
          className="text-sm text-teal-700 font-medium cursor-pointer"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {!open && (
        <p className="text-sm text-slate-500 mt-1">
          Optional: let other members tap your name on the booking calendar to
          see what you work on. Completely separate from the reporting
          questions below, which are never shown to anyone.
        </p>
      )}
      {open && (
        <form action={action} className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="profileVisible"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="mt-0.5"
            />
            <span>Show my profile to other members on the booking calendar</span>
          </label>
          <div>
            <label className={labelCls}>What I&apos;m working on</label>
            <textarea
              name="bio"
              rows={2}
              maxLength={500}
              defaultValue={community.bio ?? ""}
              className={inputCls}
              placeholder="e.g. Researching pandemic preparedness policy at Utrecht University."
            />
          </div>
          <div>
            <label className={labelCls}>Ask me about</label>
            <input
              name="expertise"
              maxLength={300}
              defaultValue={community.expertise ?? ""}
              className={inputCls}
              placeholder="e.g. biosecurity, grant writing, career switching from consultancy"
            />
          </div>
          <div>
            <label className={labelCls}>Cause areas I&apos;m interested in</label>
            <div className="grid grid-cols-2 gap-1">
              {CAUSE_AREAS.filter((c) => c !== "Other").map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="publicCauseAreas"
                    value={c}
                    defaultChecked={community.publicCauseAreas?.includes(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>
              Link (LinkedIn, site, EA Forum, LessWrong)
            </label>
            <input
              name="publicLink"
              type="text"
              inputMode="url"
              maxLength={300}
              defaultValue={community.publicLink ?? ""}
              className={inputCls}
            />
          </div>
          {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </Card>
  );
}
