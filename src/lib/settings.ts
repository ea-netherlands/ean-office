import { db, settings, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";

// Everything configurable lives here, editable from /admin/settings.
export type Settings = {
  desk_count: number;
  flex_count: number;
  flex_unavailable_window: string; // "12:00–13:00", informational
  arrival_slots: string[]; // first-visit arrival options
  host_coverage_days: number[]; // ISO weekdays with host coverage, 1=Mon
  block_horizon_weeks: number;
  block_max_share: number; // fraction of desks block bookings may hold per day
  max_future_bookings: number;
  noshow_threshold: number;
  noshow_window_days: number;
  noshow_email_cooldown_days: number;
  checkin_rate_target: number;
  request_expiry_days: number; // "awaiting reply" auto-expiry
  profile_skip_limit: number; // skips allowed before M&E profile is required
  checkin_retention_months: number; // GDPR purge horizon
  trial_months: number;
  office_address: string;
  wifi_password: string;
};

export const DEFAULT_SETTINGS: Settings = {
  desk_count: 8,
  flex_count: 5,
  flex_unavailable_window: "12:00–13:00",
  arrival_slots: ["11:00", "13:00"],
  host_coverage_days: [1, 2, 3, 4], // Monday–Thursday
  block_horizon_weeks: 12,
  block_max_share: 0.5,
  max_future_bookings: 12,
  noshow_threshold: 3,
  noshow_window_days: 60,
  noshow_email_cooldown_days: 60,
  checkin_rate_target: 0.8,
  request_expiry_days: 14,
  profile_skip_limit: 2,
  checkin_retention_months: 24,
  trial_months: 3,
  office_address: "EA Netherlands office, Amsterdam",
  wifi_password: "ask your host",
};

export async function getSettings(): Promise<Settings> {
  await ensureMigrated();
  const rows = await db.select().from(settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      merged[row.key] = JSON.parse(row.value);
    } catch {
      merged[row.key] = row.value;
    }
  }
  return merged as Settings;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  await ensureMigrated();
  const json = JSON.stringify(value);
  const existing = await db.select().from(settings).where(eq(settings.key, key));
  if (existing.length > 0) {
    await db.update(settings).set({ value: json }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value: json });
  }
}
