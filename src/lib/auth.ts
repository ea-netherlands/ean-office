import { cookies } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "crypto";
import { db, ensureMigrated, loginTokens, sessions, users } from "@/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { newId } from "./ids";

const SESSION_COOKIE = "ean_session";
const SESSION_DAYS = 90;
const LOGIN_TOKEN_MINUTES = 30;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

export type SessionUser = typeof users.$inferSelect;

// ---------- magic links ----------

export async function createLoginToken(
  email: string,
  redirectTo?: string
): Promise<string> {
  await ensureMigrated();
  const raw = randomBytes(32).toString("base64url");
  await db.insert(loginTokens).values({
    id: newId("lt"),
    tokenHash: hash(raw),
    email: email.toLowerCase().trim(),
    redirectTo: redirectTo || null,
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60 * 1000),
  });
  return raw;
}

export async function consumeLoginToken(
  raw: string
): Promise<{ user: SessionUser; redirectTo: string | null } | null> {
  await ensureMigrated();
  const [token] = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, hash(raw)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date())
      )
    );
  if (!token) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${token.email}`);
  if (!user) return null;
  await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(eq(loginTokens.id, token.id));
  return { user, redirectTo: token.redirectTo };
}

// ---------- sessions ----------

export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: newId("sess"),
    tokenHash: hash(raw),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  return raw;
}

export async function setSessionCookie(raw: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

/**
 * Deduplicated per request with React `cache`. A page plus its server action
 * would otherwise re-run the session join several times, and the row it
 * returns is the whole user — so callers never need to re-select the user
 * they've already been handed.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  await ensureMigrated();
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.tokenHash, hash(raw)), gt(sessions.expiresAt, new Date()))
    );
  return row?.user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not logged in");
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hash(raw)));
  }
  jar.delete(SESSION_COOKIE);
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin";
}

export function isActiveMember(user: SessionUser | null): boolean {
  return (
    !!user &&
    (user.role === "admin" ||
      (user.role === "member" &&
        (user.status === "trial" || user.status === "active")))
  );
}
