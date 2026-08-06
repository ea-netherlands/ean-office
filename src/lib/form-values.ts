/**
 * React clears an uncontrolled form as soon as its action resolves, so a
 * server-side validation error used to take every answer with it — someone
 * filling in /join left the profile link blank, pressed send, and lost the
 * lot. Actions echo back what was submitted, the form re-mounts with those as
 * its defaults, and a rejected submit now costs one field instead of ten
 * minutes. `attempt` exists only to change the form's React key: without a
 * remount the DOM keeps the values React just reset.
 */
export type FormValues = Record<string, string | string[]>;

export type EchoState = {
  error?: string;
  /** `name` of the field to highlight, focus and scroll to. */
  field?: string;
  values?: FormValues;
  attempt?: number;
};

export function formValues(
  formData: FormData,
  keys: readonly string[],
  multi: readonly string[] = []
): FormValues {
  const out: FormValues = {};
  for (const key of keys) {
    out[key] = multi.includes(key)
      ? formData.getAll(key).map(String)
      : String(formData.get(key) ?? "");
  }
  return out;
}

/** Single value, safe to hand straight to `defaultValue`. */
export function str(values: FormValues | undefined, key: string): string {
  const v = values?.[key];
  return typeof v === "string" ? v : "";
}

/** Multi-value (checkbox groups), safe for `defaultChecked` lookups. */
export function list(values: FormValues | undefined, key: string): string[] {
  const v = values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
}
