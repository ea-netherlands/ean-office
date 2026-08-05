"use server";

import { db, users } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Admin only");
  return user;
}

export type ImportRow = { name: string; email: string; joinedDate?: string };

export type ImportOutcome =
  | "new"
  | "duplicate_in_file"
  | "already_in_system"
  | "invalid_email"
  | "missing_name";

export type ImportPreviewRow = ImportRow & { outcome: ImportOutcome };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function previewImportAction(
  rows: ImportRow[]
): Promise<ImportPreviewRow[]> {
  await requireAdmin();
  const existing = await db.select({ email: users.email }).from(users);
  const existingEmails = new Set(existing.map((u) => u.email.toLowerCase()));
  const seenInFile = new Set<string>();
  const out: ImportPreviewRow[] = [];
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    const name = r.name.trim();
    let outcome: ImportOutcome;
    if (!EMAIL_RE.test(email)) outcome = "invalid_email";
    else if (!name) outcome = "missing_name";
    else if (seenInFile.has(email)) outcome = "duplicate_in_file";
    else if (existingEmails.has(email)) outcome = "already_in_system";
    else outcome = "new";
    if (outcome === "new") seenInFile.add(email);
    out.push({ name, email, joinedDate: r.joinedDate, outcome });
  }
  return out;
}

export type CommitResult = { inserted: number; batchId: string };

/**
 * Only ever inserts brand-new rows — an email already in the system (at any
 * status, any role) is left completely untouched. That's what makes "never
 * downgrade an existing admin or claimed member" trivially true, and makes
 * re-running the same file after fixing a typo safe.
 */
export async function commitImportAction(rows: ImportRow[]): Promise<CommitResult> {
  await requireAdmin();
  const preview = await previewImportAction(rows);
  const toInsert = preview.filter((r) => r.outcome === "new");
  const batchId = newId("imp");
  for (const r of toInsert) {
    const createdAt =
      r.joinedDate && /^\d{4}-\d{2}-\d{2}$/.test(r.joinedDate)
        ? new Date(r.joinedDate)
        : undefined;
    await db.insert(users).values({
      id: newId("usr"),
      name: r.name,
      email: r.email,
      role: "member",
      status: "imported",
      source: "import",
      importBatch: batchId,
      ...(createdAt ? { createdAt } : {}),
    });
  }
  revalidatePath("/admin/members");
  revalidatePath("/admin/import");
  return { inserted: toInsert.length, batchId };
}

/** Reversible only for rows nobody has claimed yet — anyone who's already been through /welcome is left alone. */
export async function undoImportAction(batchId: string): Promise<{ deleted: number }> {
  await requireAdmin();
  const deleted = await db
    .delete(users)
    .where(and(eq(users.importBatch, batchId), isNull(users.claimedAt)))
    .returning();
  revalidatePath("/admin/members");
  revalidatePath("/admin/import");
  return { deleted: deleted.length };
}
