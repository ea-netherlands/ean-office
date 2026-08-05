"use client";

import { useActionState } from "react";
import { saveSettingsAction, AdminActionState } from "@/actions/admin";
import { Settings } from "@/lib/settings";
import { Card, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { WEEKDAY_NAMES } from "@/lib/dates";

export function SettingsForm({ cfg }: { cfg: Settings }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    saveSettingsAction,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-3">
        <h2>Capacity</h2>
        <div className="grid grid-cols-2 gap-3">
          <Num name="desk_count" label="Desks (occupancy denominator)" value={cfg.desk_count} />
          <Num name="flex_count" label="Lunch-table spots" value={cfg.flex_count} />
        </div>
        <div>
          <label className={labelCls}>Lunch-table unavailable window</label>
          <input
            name="flex_unavailable_window"
            defaultValue={cfg.flex_unavailable_window}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Morning half-day hours</label>
            <input name="am_window" defaultValue={cfg.am_window} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Afternoon half-day hours</label>
            <input name="pm_window" defaultValue={cfg.pm_window} className={inputCls} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          These are shown to members, not enforced. Overlapping them across the
          lunch hour is deliberate: the morning person packs up for lunch as
          the afternoon person arrives for it, so a shared desk changes hands
          while nobody is working at it.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2>First visits</h2>
        <div>
          <label className={labelCls}>Days with host coverage</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((wd) => (
              <label
                key={wd}
                className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 text-sm cursor-pointer has-checked:border-teal-600 has-checked:bg-teal-50"
              >
                <input
                  type="checkbox"
                  name="host_coverage_days"
                  value={wd}
                  defaultChecked={cfg.host_coverage_days.includes(wd)}
                />
                {WEEKDAY_NAMES[wd - 1].slice(0, 3)}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            First-visit slots only appear on these days. Coverage is a promise
            made by humans — the app just stops people booking outside it.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Arrival slots (comma-separated)</label>
            <input
              name="arrival_slots"
              defaultValue={cfg.arrival_slots.join(", ")}
              className={inputCls}
            />
          </div>
          <Num
            name="request_expiry_days"
            label="'Waiting on them' expiry (days)"
            value={cfg.request_expiry_days}
          />
        </div>
        <Num name="trial_months" label="Trial length (months)" value={cfg.trial_months} />
      </Card>

      <Card className="space-y-3">
        <h2>Booking rules</h2>
        <div className="grid grid-cols-2 gap-3">
          <Num
            name="block_horizon_weeks"
            label="Repeat-booking horizon (weeks)"
            value={cfg.block_horizon_weeks}
          />
          <Num
            name="block_max_share_pct"
            label="Max % of desks held by repeats"
            value={Math.round(cfg.block_max_share * 100)}
          />
          <Num
            name="max_future_bookings"
            label="Max future bookings per member"
            value={cfg.max_future_bookings}
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2>No-shows &amp; check-in</h2>
        <div className="grid grid-cols-2 gap-3">
          <Num name="noshow_threshold" label="Email after N no-shows" value={cfg.noshow_threshold} />
          <Num name="noshow_window_days" label="Rolling window (days)" value={cfg.noshow_window_days} />
          <Num
            name="noshow_email_cooldown_days"
            label="Min days between emails"
            value={cfg.noshow_email_cooldown_days}
          />
          <Num
            name="checkin_rate_target_pct"
            label="Check-in rate target (%)"
            value={Math.round(cfg.checkin_rate_target * 100)}
          />
          <Num
            name="profile_skip_limit"
            label="Profile skips before required"
            value={cfg.profile_skip_limit}
          />
          <Num
            name="checkin_retention_months"
            label="Check-in retention (months, GDPR)"
            value={cfg.checkin_retention_months}
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2>Practical</h2>
        <div>
          <label className={labelCls}>Office address</label>
          <input name="office_address" defaultValue={cfg.office_address} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Luma calendar feed (ICS URL)</label>
          <input name="luma_ics_url" defaultValue={cfg.luma_ics_url} className={inputCls} />
          <p className="text-xs text-slate-400 mt-1">
            Events sync from this feed daily. Leave empty to manage events by
            hand.
          </p>
        </div>
      </Card>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} type="number" defaultValue={value} className={inputCls} />
    </div>
  );
}
