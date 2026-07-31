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

export const GENDERS = ["F", "M", "Other", "Prefer not to say"] as const;

export const DECLINE_REASONS = [
  "Not a fit for the space right now",
  "At capacity for new members",
  "Not enough information to assess",
  "Concerns from screening",
  "Other",
] as const;
