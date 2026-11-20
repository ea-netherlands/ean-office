"use client";

import { useState, useActionState } from "react";
import {
  saveCommunityProfileAction,
  publishCommunityProfileAction,
  ProfileState,
} from "@/actions/profile";
import { CAUSE_AREAS } from "@/lib/profile-options";
import { AvatarUpload } from "@/components/avatar-upload";
import { Card, Badge, Icon, Notice, btnPrimary, inputCls, labelCls } from "@/components/ui";

export type CommunityProfile = {
  profileVisible: boolean;
  bio: string | null;
  expertise: string | null;
  publicCauseAreas: string[] | null;
  publicLink: string | null;
};

/**
 * What they told us when they applied — the "about" answer and the link the
 * join form requires. Offered as an editable starting point, never published
 * without them pressing the button: it was written for the people approving
 * applications, not for other members.
 */
export type ProfileDraft = { bio: string | null; link: string | null };

/** Live to other members, with something to read. */
export function isProfileLive(c: CommunityProfile): boolean {
  return c.profileVisible && !!c.bio?.trim();
}

/**
 * What's still missing, in the order it's worth filling in. Used for the
 * nudge line — naming the one or two things left is what gets a profile
 * finished; "complete your profile" on its own never has.
 */
export function communityProfileGaps(
  community: CommunityProfile,
  hasPhoto: boolean
): string[] {
  const gaps: string[] = [];
  if (!hasPhoto) gaps.push("a photo");
  if (!community.bio) gaps.push("what you're working on");
  if (!community.expertise) gaps.push("what to ask you about");
  return gaps;
}

/** "a photo and what you're working on" */
export function listGaps(gaps: string[]): string {
  if (gaps.length <= 1) return gaps[0] ?? "";
  return `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}`;
}

/**
 * One sentence, one link, one button. The full form asks six things behind
 * "Edit" and a checkbox people miss; this asks two, starts them filled in
 * from the application, and the button itself is the opt-in.
 */
export function QuickPublishForm({
  bio,
  link,
  fromApplication,
  onMore,
  snoozeAction,
}: {
  bio: string | null;
  link: string | null;
  /** The bio text came from their application rather than their profile. */
  fromApplication: boolean;
  /** Opens the full form, for "ask me about" and cause areas. */
  onMore?: () => void;
  /** Adds a "Not now" that runs this (the check-in prompt). */
  snoozeAction?: () => Promise<void>;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    publishCommunityProfileAction,
    {}
  );

  if (state.ok) {
    return (
      <Notice tone="ok" className="mt-3">
        You&apos;re visible to members. Anyone booked on the same day can tap
        your name to read this.{" "}
        <a href="/me" className="font-medium underline">
          Add what to ask you about
        </a>
      </Notice>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 text-left">
      {snoozeAction && <input type="hidden" name="from" value="checkin" />}
      <div>
        <label className={labelCls} htmlFor="quick-bio">
          What you&apos;re working on
        </label>
        <textarea
          id="quick-bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={bio ?? ""}
          className={inputCls}
          placeholder="e.g. Researching pandemic preparedness policy at Utrecht University."
        />
        {fromApplication && (
          <p className="text-xs text-slate-500 mt-1">
            We started this from your application. Have a read and make it
            sound like you before you share it.
          </p>
        )}
      </div>
      <div>
        <label className={labelCls} htmlFor="quick-link">
          LinkedIn or another link
        </label>
        <input
          id="quick-link"
          name="publicLink"
          type="text"
          inputMode="url"
          maxLength={300}
          defaultValue={link ?? ""}
          className={inputCls}
          placeholder="linkedin.com/in/yourname"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Sharing…" : "Show to members"}
        </button>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="text-sm text-teal-700 font-medium cursor-pointer"
          >
            More options
          </button>
        )}
        {snoozeAction && (
          <button
            type="submit"
            formAction={snoozeAction}
            className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Not now
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Only logged-in members see it, and you can hide it again from your
        profile page.
      </p>
    </form>
  );
}

/**
 * Opt-in "who's-in" networking profile — deliberately separate from the
 * M&E reporting questions, which are never shown to anyone. Reused on
 * /me (where it starts collapsed) and /welcome (started expanded, since
 * that's the one guaranteed moment to actually get it seen).
 */
export function CommunityProfileCard({
  community,
  draft,
  defaultOpen,
  name,
  avatarUrl,
}: {
  /** What's saved. Gaps and "live" are judged on this, never the draft. */
  community: CommunityProfile;
  draft?: ProfileDraft;
  defaultOpen?: boolean;
  name: string;
  avatarUrl: string | null;
}) {
  const live = isProfileLive(community);
  const [open, setOpen] = useState(defaultOpen ?? live);
  const [visible, setVisible] = useState(community.profileVisible);
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    saveCommunityProfileAction,
    {}
  );
  const gaps = communityProfileGaps(community, !!avatarUrl);
  const startBio = community.bio || draft?.bio || null;
  const startLink = community.publicLink || draft?.link || null;

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
      {/* The photo sits outside the form and saves on pick: it's the one
          thing people actually want to add, and burying it behind "Edit"
          then "Save" is how it stays unadded. */}
      <div className="mt-3">
        <AvatarUpload name={name} src={avatarUrl} />
        <p className="text-xs text-slate-500 mt-2">
          Your photo shows next to your name on the booking calendar, so
          people can match a face to the person two desks over. Members only —
          it never leaves the app.
        </p>
      </div>
      {!open && !live && (
        <>
          <p className="text-sm text-slate-600 mt-4">
            Most conversations in the office start with &ldquo;what are you
            working on?&rdquo; Add a sentence so people already know, and
            can tap your name on the booking calendar to find you.
          </p>
          <QuickPublishForm
            bio={startBio}
            link={startLink}
            fromApplication={!community.bio && !!draft?.bio}
            onMore={() => setOpen(true)}
          />
        </>
      )}
      {!open && live && (
        <>
          <p className="text-sm text-slate-500 mt-3">
            Members can tap your name on the booking calendar to see what you
            work on. Completely separate from the reporting questions below,
            which are never shown to anyone.
          </p>
          {gaps.length > 0 && (
            <p className="text-sm text-teal-800 mt-2 flex items-start gap-1.5">
              <Icon name="sparkles" className="mt-0.5 text-teal-600" />
              <span>
                Still missing: {listGaps(gaps)}. It takes a minute, and
                it&apos;s what makes the who&apos;s-in list worth tapping.
              </span>
            </p>
          )}
        </>
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
              defaultValue={startBio ?? ""}
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
              defaultValue={startLink ?? ""}
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
