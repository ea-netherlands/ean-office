"use server";

import { db, users, visitRequests, ensureMigrated } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { findUserByEmail } from "@/lib/users";
import { newId } from "@/lib/ids";
import { sendEmail, link } from "@/lib/email";
import { appUrl } from "@/lib/auth";
import { addDays, formatDayLong, isWorkingDay, isoWeekday, todayAms } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { coworkingDayOn } from "@/lib/booking";
import { normaliseUrl } from "@/lib/url";
import { resolveGender } from "@/lib/profile-options";
import { EchoState, formValues } from "@/lib/form-values";

export type JoinState = EchoState & { ok?: boolean };

/** Everything the form asks for, echoed back untouched when we reject it. */
const FIELDS = [
  "name",
  "email",
  "descriptor",
  "profileUrl",
  "about",
  "expectedFrequency",
  "accessibilityNotes",
  "guidelines",
  "requestedDate",
  "requestedArrival",
  "causeArea",
  "causeAreaOther",
  "roleCategory",
  "experienceLevel",
  "eaFunding",
  "funders",
  "gender",
  "genderSelfDescribe",
] as const;

export async function submitJoinRequest(
  _prev: JoinState,
  formData: FormData
): Promise<JoinState> {
  await ensureMigrated();

  // Hand every answer back with the error so nothing typed is ever lost.
  const values = formValues(formData, FIELDS, ["funders"]);
  const attempt = (_prev.attempt ?? 0) + 1;
  const fail = (error: string, field?: string): JoinState => ({
    error,
    field,
    values,
    attempt,
  });

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

  if (!name) return fail("Please add your name.", "name");
  if (!email.includes("@")) return fail("That email doesn't look right.", "email");
  if (!descriptor) return fail("Please pick what best describes you.", "descriptor");
  if (!profileUrl) {
    return fail(
      "Please add a link — LinkedIn, a personal site, an EA Forum profile, or a shared PDF of your CV.",
      "profileUrl"
    );
  }
  const normalisedUrl = normaliseUrl(profileUrl);
  if (!normalisedUrl) {
    return fail(
      "That doesn't look like a web address — paste the whole thing, like linkedin.com/in/yourname.",
      "profileUrl"
    );
  }
  if (!about) {
    return fail("Please tell us a little about what you're working on.", "about");
  }
  if (!expectedFrequency) {
    return fail("Please pick how often you expect to come.", "expectedFrequency");
  }
  if (!guidelines) {
    return fail("Please read and accept the office guidelines.", "guidelines");
  }
  if (!requestedDate || !requestedArrival) {
    return fail("Please pick a day and an arrival time.", "requestedDate");
  }
  // The date field lets people type anything, and until now nothing checked
  // it — a request for a Sunday in 2031 would have gone straight to the queue.
  const cfg = await getSettings();
  const today = todayAms();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || requestedDate <= today) {
    return fail("Please pick a day in the future.", "requestedDate");
  }
  if (requestedDate > addDays(today, cfg.join_horizon_days)) {
    return fail(
      `That's further ahead than we can plan for — pick a day before ${formatDayLong(addDays(today, cfg.join_horizon_days))}, and get in touch if you need something later.`,
      "requestedDate"
    );
  }
  if (!isWorkingDay(requestedDate) || !cfg.host_coverage_days.includes(isoWeekday(requestedDate))) {
    return fail(
      "First visits happen on days a host is around — pick one of the offered days.",
      "requestedDate"
    );
  }
  if (!cfg.arrival_slots.includes(requestedArrival)) {
    return fail("Please pick one of the arrival times.", "requestedArrival");
  }
  const coworking = await coworkingDayOn(requestedDate);
  if (coworking) {
    return fail(
      `${formatDayLong(requestedDate)} has the whole office out for "${coworking.title}" — please pick a different day.`,
      "requestedDate"
    );
  }
  if (!causeArea || !roleCategory || !experienceLevel || !eaFunding) {
    return fail(
      "Please answer the profile questions — they're used only for aggregate reporting.",
      !causeArea
        ? "causeArea"
        : !roleCategory
          ? "roleCategory"
          : !experienceLevel
            ? "experienceLevel"
            : "eaFunding"
    );
  }

  // Alias-aware, so someone who's already a member under another address
  // isn't quietly given a second account.
  const existing = await findUserByEmail(email);

  let userId: string;
  if (existing) {
    if (existing.status === "trial" || existing.status === "active") {
      return fail(
        "That email already belongs to a member — just log in and book a day.",
        "email"
      );
    }
    const openRequests = await db
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.userId, existing.id));
    if (openRequests.some((r) => r.status === "pending" || r.status === "awaiting_reply")) {
      return fail(
        "You already have a request in — we'll get back to you within one working day.",
        "email"
      );
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
<p>Just so it's clear up front: that first visit works as a trial day. Come see if the space is a good fit, and afterwards the team will confirm whether to welcome you as a full member — you won't be able to book further days until then.</p>
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
