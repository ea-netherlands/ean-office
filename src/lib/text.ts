// Helpers for text that people type into forms and that later ends up in
// emails. Pure functions, no imports, so anything can use them.

/** Escape a value for use inside HTML. Use on anything a person typed before
 *  putting it in an email body. Never use it on a subject line (plain text). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tidy a one-line value such as a person's name or an event title: no angle
 *  brackets or control characters, single spaces, a sensible maximum length.
 *  Names and titles are quoted in dozens of email templates, so they are
 *  cleaned once here, where they enter the app. */
export function cleanLine(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(/[<>\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}
