/**
 * People type "linkedin.com/in/someone" far more often than they type the
 * scheme, and a browser's native url validation rejects that outright. Accept
 * what they meant instead of making them fight the field.
 */
export function normaliseUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  // Needs at least one dot in the host — rules out "hello" becoming a URL.
  if (!parsed.hostname.includes(".") || parsed.hostname.endsWith(".")) {
    return null;
  }
  return parsed.toString();
}
