"use client";

import { useActionState, useState } from "react";
import { saveProfileAction, ProfileState } from "@/actions/profile";
import {
  CAUSE_AREAS,
  ROLE_CATEGORIES,
  EXPERIENCE_LEVELS,
  FUNDERS,
  GENDERS,
  GENDER_SELF_DESCRIBE,
} from "@/lib/profile-options";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";

/**
 * The five M&E questions. Used inline before a first booking, and on /me.
 * Answers are aggregate reporting data only — they never affect admission.
 */
export function ProfileForm({
  onDone,
  onSkip,
  skipsLeft,
  initial,
}: {
  onDone?: () => void;
  onSkip?: () => void;
  skipsLeft?: number;
  initial?: {
    causeArea?: string | null;
    causeAreaOther?: string | null;
    roleCategory?: string | null;
    experienceLevel?: string | null;
    eaFunding?: string | null;
    gender?: string | null;
    funders?: string[] | null;
  };
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    async (prev, fd) => {
      const res = await saveProfileAction(prev, fd);
      if (res.ok && onDone) onDone();
      return res;
    },
    {}
  );
  const [funding, setFunding] = useState(initial?.eaFunding || "");

  return (
    <form action={action} className="space-y-4">
      <ProfileFields initial={initial} funding={funding} setFunding={setFunding} />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.ok && !onDone && (
        <p className="text-sm text-teal-700">Saved — thank you!</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} className={btnSecondary}>
            Skip for now{typeof skipsLeft === "number" ? ` (${skipsLeft} left)` : ""}
          </button>
        )}
      </div>
    </form>
  );
}

/** Bare fields, reusable inside the /join form (no separate submit). */
export function ProfileFields({
  initial,
  funding,
  setFunding,
  namePrefix = "",
}: {
  initial?: {
    causeArea?: string | null;
    causeAreaOther?: string | null;
    roleCategory?: string | null;
    experienceLevel?: string | null;
    eaFunding?: string | null;
    gender?: string | null;
    funders?: string[] | null;
  };
  funding: string;
  setFunding: (v: string) => void;
  namePrefix?: string;
}) {
  const [cause, setCause] = useState(initial?.causeArea || "");
  const knownGender =
    initial?.gender && (GENDERS as readonly string[]).includes(initial.gender);
  const [gender, setGender] = useState(
    initial?.gender ? (knownGender ? initial.gender : GENDER_SELF_DESCRIBE) : ""
  );
  return (
    <>
      <div>
        <label className={labelCls}>
          Which broad cause area best describes your primary focus? *
        </label>
        <select
          name="causeArea"
          required
          className={inputCls}
          defaultValue={initial?.causeArea || ""}
          onChange={(e) => setCause(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {CAUSE_AREAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {cause === "Other" && (
          <input
            name="causeAreaOther"
            placeholder="Tell us more (optional)"
            defaultValue={initial?.causeAreaOther || ""}
            className={`${inputCls} mt-2`}
          />
        )}
      </div>
      <div>
        <label className={labelCls}>
          Which category best describes your current role? *
        </label>
        <select
          name="roleCategory"
          required
          className={inputCls}
          defaultValue={initial?.roleCategory || ""}
        >
          <option value="" disabled>
            Choose…
          </option>
          {ROLE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Level of experience in your cause area? *</label>
        <select
          name="experienceLevel"
          required
          className={inputCls}
          defaultValue={initial?.experienceLevel || ""}
        >
          <option value="" disabled>
            Choose…
          </option>
          {EXPERIENCE_LEVELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>
          Do you receive funding, directly or indirectly, from an EA-aligned
          funder? *
        </label>
        <select
          name="eaFunding"
          required
          className={inputCls}
          value={funding}
          onChange={(e) => setFunding(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="direct">Yes, directly</option>
          <option value="employer">Yes, my employer does</option>
          <option value="none">No</option>
          <option value="undisclosed">Prefer not to say</option>
        </select>
        {(funding === "direct" || funding === "employer") && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {FUNDERS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="funders"
                  value={f}
                  defaultChecked={initial?.funders?.includes(f)}
                />
                {f}
              </label>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Gender (optional)</label>
        <select
          name="gender"
          className={inputCls}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">Prefer not to answer</option>
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        {gender === GENDER_SELF_DESCRIBE && (
          <input
            name="genderSelfDescribe"
            maxLength={60}
            defaultValue={
              initial?.gender && !(GENDERS as readonly string[]).includes(initial.gender)
                ? initial.gender
                : ""
            }
            placeholder="In your own words"
            className={`${inputCls} mt-2`}
          />
        )}
      </div>
      <p className="text-xs text-slate-400">
        These answers are used only for aggregate reporting to funders — they
        never affect whether anyone is admitted, and no individual figures are
        ever shown to anyone.
      </p>
    </>
  );
}
