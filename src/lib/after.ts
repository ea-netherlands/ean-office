import { after } from "next/server";

/**
 * Run work once the response is already on its way to the browser, so it
 * never sits in the member's click path. Sending a confirmation email is the
 * motivating case: a Resend round-trip is a few hundred milliseconds that
 * nobody is waiting to hear about.
 *
 * `after` only exists inside a request, so scripts and cron fall back to
 * awaiting inline. Deferred failures can't reach a UI, so they're logged
 * rather than thrown — the caller has already been told the booking worked.
 */
export async function afterResponse(work: () => Promise<void>): Promise<void> {
  const guarded = async () => {
    try {
      await work();
    } catch (err) {
      console.error("[after] deferred work failed:", err);
    }
  };
  try {
    after(guarded);
  } catch {
    // No request context (npm scripts, migrations) — just do it now.
    await guarded();
  }
}
