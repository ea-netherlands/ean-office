"use client";

import { useActionState, useState } from "react";
import { submitJoinRequest, JoinState } from "@/actions/join";
import { ProfileFields } from "@/components/profile-form";
import { DESCRIPTORS, FREQUENCIES } from "@/lib/profile-options";
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
  const [funding, setFunding] = useState("");
  const [pickedDay, setPickedDay] = useState("");

  if (state.ok) {
    return (
      <Card className="text-center py-10">
        <Icon name="confetti" className="text-5xl text-teal-600 mb-3" />
        <h2 className="text-xl font-bold">Request received!</h2>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          We&apos;ve sent you an automatic acknowledgement now. A real person
          then reads your request — usually{" "}
          <strong>within one working day</strong> — and you&apos;ll get an
          email either way once they have.
        </p>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="font-semibold">About you</h2>
        <div>
          <label className={labelCls}>Name *</label>
          <input name="name" required className={inputCls} autoComplete="name" />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            name="email"
            type="email"
            required
            className={inputCls}
            autoComplete="email"
          />
        </div>
        <div>
          <label className={labelCls}>Which best describes you? *</label>
          <select name="descriptor" required className={inputCls} defaultValue="">
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
            className={inputCls}
          />
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
          <textarea name="about" required rows={3} className={inputCls} />
          <p className="text-xs text-slate-400 mt-1">
            Two or three sentences is plenty.
          </p>
        </div>
        <div>
          <label className={labelCls}>
            How often do you expect to use the space? *
          </label>
          <select name="expectedFrequency" required className={inputCls} defaultValue="">
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
          <textarea name="accessibilityNotes" rows={2} className={inputCls} />
          <p className="text-xs text-slate-400 mt-1">
            Accessibility needs, dietary things at lunch, arriving late —
            anything.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="guidelines" required className="mt-0.5" />
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
        <h2 className="font-semibold">When would you like to come?</h2>
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
                <input type="radio" name="requestedArrival" value={a} required />
                {a}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">A little about your work</h2>
        <p className="text-sm text-slate-500">
          Five quick questions we report only in aggregate — they never affect
          whether you&apos;re admitted.
        </p>
        <ProfileFields funding={funding} setFunding={setFunding} />
      </Card>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full py-3.5 text-base`}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
