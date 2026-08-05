"use client";

import { useState, useActionState } from "react";
import { saveCommunityProfileAction, ProfileState } from "@/actions/profile";
import { CAUSE_AREAS } from "@/lib/profile-options";
import { Card, Badge, btnPrimary, inputCls, labelCls } from "@/components/ui";

export type CommunityProfile = {
  profileVisible: boolean;
  bio: string | null;
  expertise: string | null;
  publicCauseAreas: string[] | null;
  publicLink: string | null;
};

/**
 * Opt-in "who's-in" networking profile — deliberately separate from the
 * M&E reporting questions, which are never shown to anyone. Reused on
 * /me (where it starts collapsed) and /welcome (started expanded, since
 * that's the one guaranteed moment to actually get it seen).
 */
export function CommunityProfileCard({
  community,
  defaultOpen,
}: {
  community: CommunityProfile;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? community.profileVisible);
  const [visible, setVisible] = useState(community.profileVisible);
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    saveCommunityProfileAction,
    {}
  );

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2>
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
          <p className="text-sm text-slate-500">
            Entirely optional — makes it easier for other members to spot who
            else is working on what, and to strike up a conversation. Nothing
            here is shared unless you tick the box.
          </p>
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
