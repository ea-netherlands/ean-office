"use client";

import { useActionState } from "react";
import { saveInfoPageAction, AdminActionState } from "@/actions/admin";
import { Card, btnPrimary, btnSecondary, labelCls } from "@/components/ui";

export function InfoEditor({
  publicMd,
  membersMd,
}: {
  publicMd: string;
  membersMd: string;
}) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    saveInfoPageAction,
    {}
  );

  const areaCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500";

  return (
    <form action={action} className="space-y-4">
      <Card>
        <label className={labelCls}>Public section — anyone can see this</label>
        <textarea name="info_public_md" defaultValue={publicMd} rows={18} className={areaCls} />
      </Card>
      <Card>
        <label className={labelCls}>
          Members-only section — shown after login (wifi, door, facilities)
        </label>
        <textarea name="info_members_md" defaultValue={membersMd} rows={18} className={areaCls} />
      </Card>
      {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <a href="/info" target="_blank" className={btnSecondary}>
          View the page
        </a>
      </div>
    </form>
  );
}
