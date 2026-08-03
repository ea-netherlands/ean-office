"use server";

import { db, users, visitRequests, ensureMigrated } from "@/db";
import { eq, sql, inArray } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { appUrl } from "@/lib/auth";
import { formatDayLong } from "@/lib/dates";
import { normaliseUrl } from "@/lib/url";
import { resolveGender } from "@/lib/profile-options";

export type JoinState = { ok?: boolean; error?: string };

export async function submitJoinRequest(
  _prev: JoinState,
  formData: FormData
): Promise<JoinState> {
  await ensureMigrated();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const descriptor = String(formData.get("descriptor") || "");
  const profileUrl = String(formData.get("profileUrl") || "").trim();
  const about = String(formData.get("about") || "").trim();
  const expectedFrequency = String(formData.get("expectedFrequency") || "");
  const accessibilityNotes = String(formData.get("accessibilityNotes") || "").trim();
  const guidelines = formData.get("guidelines") === "on";
  const requestedDate = String(formData.get("requestedDate") || "");
  const requestedArrival = String(formData.get("requestedArrival") || "");

  // M&E profile
  const causeArea = String(formData.get("causeArea") || "");
  const causeAreaOther = String(formData.get("causeAreaOther") || "");
  const roleCategory = String(formData.get("roleCategory") || "");
  const experienceLevel = String(formData.get("experienceLevel") || "");
  const eaFunding = String(formData.get("eaFunding") || "");
  const funders = formData.getAll("funders").map(String);
  const gender = resolveGender(formData);

  if (!name || !email.includes("@")) return { error: "Name and a valid email are required." };
  if (!descriptor) return { error: "Please pick what best describes you." };
  if (!profileUrl) return { error: "Please add a link — LinkedIn, a personal site, or an EA Forum profile." };
  const normalisedUrl = normaliseUrl(profileUrl);
  if (!normalisedUrl) {
    return { error: "That link doesn't look right — something like linkedin.com/in/yourname works." };
  }
  if (!about) return { error: "Please tell us a little about what you're working on." };
  if (!expectedFrequency) return { error: "Please pick how often you expect to come." };
  if (!guidelines) return { error: "Please read and accept the office guidelines." };
  if (!requestedDate || !requestedArrival) return { error: "Please pick an arrival slot." };
  if (!causeArea || !roleCategory || !experienceLevel || !eaFunding) {
    return { error: "Please answer the profile questions — they're used only for aggregate reporting." };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  let userId: string;
  if (existing) {
    if (existing.status === "trial" || existing.status === "active") {
      return { error: "That email already belongs to a member — just log in and book a day." };
    }
    const openRequests = await db
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.userId, existing.id));
    if (openRequests.some((r) => r.status === "pending" || r.status === "awaiting_reply")) {
      return { error: "You already have a request in — we'll get back to you within one working day." };
    }
    userId = existing.id;
  } else {
    userId = newId("usr");
  }

  const userValues = {
    email,
    name,
    role: "visitor" as const,
    status: "pending" as const,
    descriptor,
    profileUrl: normalisedUrl,
    about,
    expectedFrequency,
    accessibilityNotes: accessibilityNotes || null,
    guidelinesAcceptedAt: new Date(),
    causeArea,
    causeAreaOther: causeArea === "Other" ? causeAreaOther : null,
    roleCategory,
    experienceLevel,
    eaFunding: eaFunding as "direct" | "employer" | "none" | "undisclosed",
    funders: funders.length > 0 ? funders : null,
    gender: gender || null,
    profileUpdatedAt: new Date(),
  };

  if (existing) {
    await db.update(users).set(userValues).where(eq(users.id, userId));
  } else {
    await db.insert(users).values({ id: userId, ...userValues });
  }

  await db.insert(visitRequests).values({
    id: newId("vr"),
    userId,
    requestedDate,
    requestedArrival,
    status: "pending",
  });

  await sendEmail({
    to: email,
    subject: "We got your request — you'll hear from us within one working day",
    kind: "request_ack",
    html: `<p>Hi ${name},</p>
<p>Thanks for your interest in the EA Netherlands office! We've received your request to visit on <strong>${formatDayLong(requestedDate)}</strong> at ${requestedArrival}.</p>
<p>This message is automatic — but a real person reads every request. One of the team will look at yours <strong>within one working day</strong> and you'll get an email either way once they have.</p>
<p>In the meantime: ${link(`${appUrl()}/info`, "practical info about the office")}.</p>`,
  });

  // Digest to admins — one email listing everything pending, not one per request.
  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  const pending = await db
    .select({ req: visitRequests, u: users })
    .from(visitRequests)
    .innerJoin(users, eq(users.id, visitRequests.userId))
    .where(inArray(visitRequests.status, ["pending", "awaiting_reply"]));
  const list = pending
    .map(
      (p) =>
        `<li><strong>${p.u.name}</strong> — ${formatDayLong(p.req.requestedDate)} ${p.req.requestedArrival} (${p.req.status})</li>`
    )
    .join("");
  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `New visit request from ${name} (${pending.length} open)`,
      kind: "admin_new_request",
      html: `<p>${name} has requested a first visit on ${formatDayLong(requestedDate)} at ${requestedArrival}.</p>
<p>All open requests:</p><ul>${list}</ul>
<p>${link(`${appUrl()}/admin/requests`, "Open the approval queue")}</p>`,
    });
  }

  return { ok: true };
}
