"use client";

import { useActionState, useEffect, useState } from "react";
import { submitJoinRequest, JoinState } from "@/actions/join";
import { ProfileFields } from "@/components/profile-form";
import { DESCRIPTORS, FREQUENCIES, GENDER_SELF_DESCRIBE } from "@/lib/profile-options";
import { list, str } from "@/lib/form-values";
import { useFormDraft } from "@/components/form-draft";
import { btnPrimary, inputCls, labelCls, Card, Icon } from "@/components/ui";

export function JoinForm({
  days,
  arrivals,
}: {
  days: { date: string; label: string }[];
  arrivals: string[];
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(
    submitJoinRequest,
    {}
  );
  const v = state.values;
  const attempt = state.attempt ?? 0;
  const { ref, clear } = useFormDraft("join", attempt);
  const [funding, setFunding] = useState(str(v, "eaFunding"));
  const [pickedDay, setPickedDay] = useState(str(v, "requestedDate"));

  // Nothing is lost on a rejected submit, but people still need to be shown
  // where the problem is — a long form scrolled to the bottom hides it.
  useEffect(() => {
    if (!attempt || !state.field) return;
    const field = ref.current?.querySelector<HTMLElement>(
      `[name="${state.field}"]`
    );
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  }, [attempt, state.field, ref]);

  useEffect(() => {
    if (state.ok) clear();
  }, [state.ok, clear]);

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="confetti" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl">Request received!</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          We&apos;ve sent you an automatic acknowledgement now. A real person
          then reads your request — usually{" "}
          <strong>within one working day</strong> — and you&apos;ll get an
          email either way once they have.
        </p>
      </Card>
    );
  }

  // Re-keyed on every rejected submit: React resets an uncontrolled form once
  // its action resolves, and only a fresh mount picks up the echoed defaults.
  // `!` because inputCls already sets a border colour and a background, and
  // Tailwind resolves the tie by stylesheet order, not by class order.
  const bad = (field: string) =>
    state.field === field ? `${inputCls} border-red-400! bg-red-50!` : inputCls;

  return (
    <form key={attempt} ref={ref} action={action} className="space-y-6">
      <Card className="space-y-4">
        <h2>About you</h2>
        <div>
          <label className={labelCls}>Name *</label>
          <input
            name="name"
            required
            defaultValue={str(v, "name")}
            className={bad("name")}
            autoComplete="name"
          />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={str(v, "email")}
            className={bad("email")}
            autoComplete="email"
          />
          <FieldError state={state} field="email" />
        </div>
        <div>
          <label className={labelCls}>Which best describes you? *</label>
          <select
            name="descriptor"
            required
            className={bad("descriptor")}
            defaultValue={str(v, "descriptor")}
          >
            <option value="" disabled>
              Choose…
            </option>
            {DESCRIPTORS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>A link that tells us who you are *</label>
          <input
            name="profileUrl"
            type="text"
            inputMode="url"
            required
            defaultValue={str(v, "profileUrl")}
            className={bad("profileUrl")}
          />
          <FieldError state={state} field="profileUrl" />
          <p className="text-xs text-slate-400 mt-1">
            LinkedIn, a personal site, your EA Forum or LessWrong profile —
            whatever gives us a sense of your work. If you don&apos;t have any
            of those, link to a PDF of your CV (Google Drive, Dropbox, and so
            on — just check the link is viewable by anyone).
          </p>
        </div>
        <div>
          <label className={labelCls}>
            What are you working on, and how did you come across us? *
          </label>
          <textarea
            name="about"
            required
            rows={3}
            defaultValue={str(v, "about")}
            className={bad("about")}
          />
          <p className="text-xs text-slate-400 mt-1">
            Two or three sentences is plenty.
          </p>
        </div>
        <div>
          <label className={labelCls}>
            How often do you expect to use the space? *
          </label>
          <select
            name="expectedFrequency"
            required
            className={bad("expectedFrequency")}
            defaultValue={str(v, "expectedFrequency")}
          >
            <option value="" disabled>
              Choose…
            </option>
            {FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Anything that would make your first day easier?
          </label>
          <textarea
            name="accessibilityNotes"
            rows={2}
            defaultValue={str(v, "accessibilityNotes")}
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1">
            Accessibility needs, dietary things at lunch, arriving late —
            anything.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="guidelines"
            required
            defaultChecked={str(v, "guidelines") === "on"}
            className="mt-0.5"
          />
          <span>
            I&apos;ve read the{" "}
            <a
              href="https://effectiefaltruisme.nl/en/legal/code-of-conduct"
              target="_blank"
              rel="noreferrer"
              className="text-teal-700 underline"
            >
              office guidelines
            </a>{" "}
            *
          </span>
        </label>
      </Card>

      <Card className="space-y-4">
        <h2>When would you like to come?</h2>
        <p className="text-sm text-slate-500">
          First visits happen on days a host is around, arriving at{" "}
          {arrivals.join(" or ")}, so someone can welcome you properly.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {days.map((d) => (
            <label
              key={d.date}
              className={`border rounded-xl px-2 py-2.5 text-center text-sm cursor-pointer ${
                pickedDay === d.date
                  ? "border-teal-600 bg-teal-50 font-medium"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="requestedDate"
                value={d.date}
                required
                defaultChecked={str(v, "requestedDate") === d.date}
                className="sr-only"
                onChange={() => setPickedDay(d.date)}
              />
              {d.label}
            </label>
          ))}
        </div>
        <div>
          <label className={labelCls}>Arrival time *</label>
          <div className="flex gap-2">
            {arrivals.map((a) => (
              <label
                key={a}
                className="flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-2.5 text-sm cursor-pointer has-checked:border-teal-600 has-checked:bg-teal-50"
              >
                <input
                  type="radio"
                  name="requestedArrival"
                  value={a}
                  required
                  defaultChecked={str(v, "requestedArrival") === a}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2>A little about your work</h2>
        <p className="text-sm text-slate-500">
          Five quick questions we report only in aggregate — they never affect
          whether you&apos;re admitted.
        </p>
        <ProfileFields
          funding={funding}
          setFunding={setFunding}
          initial={{
            causeArea: str(v, "causeArea"),
            causeAreaOther: str(v, "causeAreaOther"),
            roleCategory: str(v, "roleCategory"),
            experienceLevel: str(v, "experienceLevel"),
            eaFunding: str(v, "eaFunding"),
            funders: list(v, "funders"),
            // Self-describers are stored as their own words; keep the option
            // selected even when they hadn't typed them yet.
            gender:
              str(v, "gender") === GENDER_SELF_DESCRIBE
                ? str(v, "genderSelfDescribe") || GENDER_SELF_DESCRIBE
                : str(v, "gender"),
          }}
        />
      </Card>

      {state.error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
        >
          {state.error} Nothing else you typed has been lost.
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full py-3.5 text-base`}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

/** The same message the banner carries, next to the field that caused it. */
function FieldError({ state, field }: { state: JoinState; field: string }) {
  if (state.field !== field || !state.error) return null;
  return <p className="text-xs text-red-700 mt-1">{state.error}</p>;
}
