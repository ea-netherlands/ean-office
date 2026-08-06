"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  setMemberStatusAction,
  setMemberRoleAction,
  endTrialAction,
  clearNoShowsAction,
  deleteUserAction,
  addMemberAction,
  AdminActionState,
} from "@/actions/admin";
import {
  Badge,
  Card,
  Notice,
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputCls,
} from "@/components/ui";
import { MergePanel, MergeCandidate } from "@/components/merge-panel";
import { formatDayLong } from "@/lib/dates";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  trialEndsAt: string | null;
  trialEnded: boolean;
  noShowCount: number;
  noShowEmailed: boolean;
  noShowOptOut: boolean;
  hasProfile: boolean;
  lastSeenAt: string | null;
  source: string;
  /** Other addresses that log in to this same account, from past merges. */
  aliases: string[];
};

export type DuplicatePair = {
  a: MergeCandidate;
  b: MergeCandidate;
};

type StatusFilter = "all" | "active" | "trial" | "imported" | "inactive";

export function MembersClient({
  rows,
  duplicates,
}: {
  rows: MemberRow[];
  duplicates: DuplicatePair[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addState, addAction] = useActionState<AdminActionState, FormData>(
    addMemberAction,
    {}
  );
  const [merging, setMerging] = useState<{ a?: string; b?: string } | null>(null);
  const [mergeNote, setMergeNote] = useState<string | null>(null);

  const trialsToReview = rows.filter((r) => r.trialEnded);

  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  function run(action: () => Promise<AdminActionState>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {trialsToReview.length > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <h2 className="mb-2">Trials to review</h2>
          <p className="text-sm text-slate-600 mb-3">
            These trials have ended — confirm them as regular members, extend,
            or end. (Members see no difference; this is EAN&apos;s own tracking.)
          </p>
          <ul className="space-y-2">
            {trialsToReview.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {r.name}{" "}
                  <span className="text-slate-400 font-normal">
                    trial ended {r.trialEndsAt && formatDayLong(r.trialEndsAt)}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <SmallBtn onClick={() => run(() => endTrialAction(r.id, "convert"))}>
                    Confirm member
                  </SmallBtn>
                  <SmallBtn onClick={() => run(() => endTrialAction(r.id, "extend"))}>
                    Extend 30d
                  </SmallBtn>
                  <SmallBtn danger onClick={() => run(() => endTrialAction(r.id, "end"))}>
                    End
                  </SmallBtn>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {duplicates.length > 0 && !merging && (
        <Card className="border-teal-300 bg-teal-50/50">
          <h2 className="mb-1">Possibly the same person twice</h2>
          <p className="text-sm text-slate-600 mb-3">
            Same name, different addresses — usually someone who signed up
            again with their work email. Merging keeps both addresses working.
          </p>
          <ul className="space-y-2">
            {duplicates.map((d) => (
              <li
                key={`${d.a.id}:${d.b.id}`}
                className="flex items-center justify-between gap-2 flex-wrap text-sm"
              >
                <span>
                  <strong>{d.a.name}</strong> — {d.a.email} and {d.b.email}
                </span>
                <SmallBtn onClick={() => setMerging({ a: d.a.id, b: d.b.id })}>
                  Merge these
                </SmallBtn>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mergeNote && <Notice>{mergeNote}</Notice>}

      {merging && (
        <MergePanel
          people={rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))}
          initialA={merging.a}
          initialB={merging.b}
          onClose={() => setMerging(null)}
          onDone={setMergeNote}
        />
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className={`${inputCls} w-56`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={inputCls}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="imported">Imported, not claimed</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="text-xs text-slate-400">
            {visible.length} of {rows.length}
          </span>
        </div>
        <button
          className={btnSecondary}
          onClick={() => setMerging(merging ? null : {})}
        >
          {merging ? "Close merge" : "Merge accounts"}
        </button>
        <button className={btnSecondary} onClick={() => setShowAdd((v) => !v)}>
          + Add member manually
        </button>
      </div>
      {showAdd && (
        <Card>
          <p className="text-sm text-slate-500 mb-3">
            For seeding the roster (e.g. from the old Airtable). They can log
            in immediately with a magic link.
          </p>
          <form action={addAction} className="flex gap-2 flex-wrap">
            <input name="name" placeholder="Name" required className={`${inputCls} flex-1 min-w-40`} />
            <input name="email" type="email" placeholder="Email" required className={`${inputCls} flex-1 min-w-40`} />
            <button type="submit" className={btnPrimary}>
              Add
            </button>
          </form>
          {addState.error && <p className="text-sm text-red-700 mt-2">{addState.error}</p>}
          {addState.ok && <p className="text-sm text-teal-700 mt-2">Added.</p>}
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-slate-100">
          {visible.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              No members match that search.
            </li>
          )}
          {visible.map((r) => (
            <li key={r.id} className="py-2.5">
              <button
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="text-sm">
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-slate-400">{r.email}</span>
                  {r.aliases.length > 0 && (
                    <span
                      className="text-slate-400"
                      title={`Also logs in with ${r.aliases.join(", ")}`}
                    >
                      {" "}
                      + {r.aliases.join(", ")}
                    </span>
                  )}
                </span>
                <span className="flex gap-1.5 items-center flex-wrap justify-end">
                  {r.role === "admin" && <Badge tone="indigo">admin</Badge>}
                  <Badge
                    tone={
                      r.status === "active"
                        ? "green"
                        : r.status === "trial"
                          ? "teal"
                          : r.status === "imported"
                            ? "amber"
                            : "stone"
                    }
                  >
                    {r.status === "imported" ? "not yet claimed" : r.status}
                  </Badge>
                  {r.noShowCount > 0 && (
                    <Badge tone="red">
                      {r.noShowCount} no-shows{r.noShowEmailed ? " · emailed" : ""}
                      {r.noShowOptOut ? " · opted out" : ""}
                    </Badge>
                  )}
                  {!r.hasProfile && <Badge tone="amber">no profile</Badge>}
                </span>
              </button>

              {expanded === r.id && (
                <div className="mt-3 flex gap-1.5 flex-wrap items-center">
                  {r.lastSeenAt && (
                    <span className="text-xs text-slate-400 mr-2">
                      last seen {r.lastSeenAt}
                    </span>
                  )}
                  {r.status !== "active" && (
                    <SmallBtn onClick={() => run(() => setMemberStatusAction(r.id, "active"))}>
                      Mark active
                    </SmallBtn>
                  )}
                  {r.status !== "inactive" && (
                    <SmallBtn onClick={() => run(() => setMemberStatusAction(r.id, "inactive"))}>
                      Deactivate
                    </SmallBtn>
                  )}
                  {r.role === "admin" ? (
                    <SmallBtn onClick={() => run(() => setMemberRoleAction(r.id, "member"))}>
                      Remove admin
                    </SmallBtn>
                  ) : (
                    <SmallBtn onClick={() => run(() => setMemberRoleAction(r.id, "admin"))}>
                      Make admin
                    </SmallBtn>
                  )}
                  {r.noShowCount > 0 && (
                    <SmallBtn onClick={() => run(() => clearNoShowsAction(r.id))}>
                      Zero no-shows
                    </SmallBtn>
                  )}
                  <SmallBtn
                    danger
                    onClick={() => {
                      if (
                        confirm(
                          `Really delete ${r.name}? This wipes their bookings and check-ins permanently (GDPR delete).`
                        )
                      )
                        run(() => deleteUserAction(r.id));
                    }}
                  >
                    Delete (GDPR)
                  </SmallBtn>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {pending && <p className="text-xs text-slate-400">Working…</p>}
    </div>
  );
}

function SmallBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs rounded-lg px-2.5 py-1.5 border cursor-pointer ${
        danger
          ? "text-red-700 border-red-200 hover:bg-red-50"
          : "text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
