import { createHmac, timingSafeEqual } from "crypto";

// Signed single-purpose tokens for no-login email links (cancel, retroactive
// check-in, opt-out). A token grants exactly its stated action — never a session.

function secret(): string {
  const s = process.env.APP_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set in production");
  }
  return "dev-secret-not-for-production";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export type TokenPurpose =
  | "cancel"
  | "retro"
  | "optout"
  | "cancel_series"
  | "release"; // give up the afternoon of a full-day booking

export function makeToken(
  purpose: TokenPurpose,
  subject: string, // bookingId, `${userId}:${date}`, userId, seriesId
  expiresAt: Date
): string {
  const payload = `${purpose}.${Buffer.from(subject).toString("base64url")}.${expiresAt.getTime()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose
): { subject: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [purpose, subjectB64, expStr, sig] = parts;
  if (purpose !== expectedPurpose) return null;
  const payload = `${purpose}.${subjectB64}.${expStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { subject: Buffer.from(subjectB64, "base64url").toString() };
}
