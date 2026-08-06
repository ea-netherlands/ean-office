"use server";

import { revalidatePath } from "next/cache";
import { ensureMigrated } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  runTransfer,
  summarise,
  type TransferResult,
  type TransferRow,
} from "@/lib/transfer";

export type { TransferResult, TransferRow } from "@/lib/transfer";

export type TransferState = {
  results?: TransferResult[];
  counts?: Record<string, number>;
  committed?: boolean;
  error?: string;
};

async function guard(): Promise<string | null> {
  await ensureMigrated();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return "Admins only.";
  return null;
}

/** Dry run — writes nothing. */
export async function previewTransferAction(
  rows: TransferRow[],
  includeReview: boolean
): Promise<TransferState> {
  const denied = await guard();
  if (denied) return { error: denied };
  const results = await runTransfer(rows, { commit: false, includeReview });
  return { results, counts: summarise(results) };
}

export async function commitTransferAction(
  rows: TransferRow[],
  includeReview: boolean
): Promise<TransferState> {
  const denied = await guard();
  if (denied) return { error: denied };
  const results = await runTransfer(rows, { commit: true, includeReview });
  revalidatePath("/book");
  revalidatePath("/admin/today");
  revalidatePath("/");
  return { results, counts: summarise(results), committed: true };
}
