// Answer options mirror the 2025 office user survey exactly, so app data
// stays comparable with previously reported figures.

export const CAUSE_AREAS = [
  "Existential Risk Reduction",
  "Global Health and Development",
  "Animal Welfare",
  "Effective Giving",
  "Community Building",
  "Other",
] as const;

export const ROLE_CATEGORIES = [
  "Research",
  "Policy",
  "Management",
  "Entrepreneurship",
  "Operations",
  "Communications",
  "Student",
  "Other",
] as const;

export const EXPERIENCE_LEVELS = [
  "Beginner (0–2 years)",
  "Intermediate (2–5 years)",
  "Advanced (5–10 years)",
  "Expert (10+ years)",
] as const;

export const FUNDERS = [
  "Open Philanthropy",
  "CEA",
  "EAIF",
  "LTFF",
  "GHD Fund",
  "AWF",
  "SFF",
  "Meta Charity Funding Circle",
  "CE network",
  "Other",
] as const;

export const DESCRIPTORS = [
  "Works at an EA-aligned org",
  "Independent research or self-directed project",
  "Job hunting or career change",
  "Student",
  "Exploring EA and curious",
  "Something else",
] as const;

export const FREQUENCIES = [
  "Once, to try it",
  "Monthly",
  "Weekly",
  "Several days a week",
] as const;

// Self-describe is stored as the typed text; reports bucket anything outside
// this list as "Self-described" so a single answer can't identify someone.
// The blank option in the form already covers "prefer not to answer".
export const GENDERS = [
  "Woman",
  "Man",
  "Non-binary",
  "Prefer to self-describe",
] as const;

export const GENDER_SELF_DESCRIBE = "Prefer to self-describe";

/** Store the typed words when someone self-describes, else the chosen option. */
export function resolveGender(formData: FormData): string {
  const choice = String(formData.get("gender") || "");
  if (choice !== GENDER_SELF_DESCRIBE) return choice;
  return String(formData.get("genderSelfDescribe") || "").trim().slice(0, 60);
}

/** Older records used F/M — keep them counted correctly. */
export function isWomanGender(value: string | null): boolean {
  return value === "Woman" || value === "F";
}

export function genderReportLabel(value: string | null): string {
  if (!value) return "Not stated";
  if (value === "F") return "Woman";
  if (value === "M") return "Man";
  return (GENDERS as readonly string[]).includes(value) &&
    value !== GENDER_SELF_DESCRIBE
    ? value
    : "Self-described";
}

export const DECLINE_REASONS = [
  "Not a fit for the space right now",
  "At capacity for new members",
  "Not enough information to assess",
  "Concerns from screening",
  "Other",
] as const;
