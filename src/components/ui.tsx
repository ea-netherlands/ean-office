// Shared presentational bits, styled to the EAN design system:
// EA Teal + Slate, Sentient headings, pressable-key buttons,
// 8/12/16px radii, dashed structural rules, Tabler icons, no emoji.

export function Page({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main
      className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} sm:rule-dashed-x px-4 sm:px-6 py-6 flex-1`}
    >
      {children}
    </main>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-serif font-medium text-3xl tracking-normal leading-tight mb-1">
      {children}
    </h1>
  );
}

/**
 * Card and section headings. Weight, family and tracking come from the
 * `h1,h2,h3` rule in globals.css — don't add `font-bold`/`font-semibold`
 * here or at call sites; Sentient is a 500 face in this system.
 */
export function H2({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={className}>{children}</h2>;
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-600 text-sm mb-5">{children}</p>;
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl card-lip p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** Tabler outline icon (webfont). name without the `ti-` prefix. */
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return <i aria-hidden className={`ti ti-${name} ${className}`} />;
}

/**
 * In-button progress. The design system bans decorative animation, but this
 * is the opposite of decoration: several actions here wait on the database
 * and then a re-render, and without it a tap looks like nothing happened.
 */
export function Spinner({ className = "" }: { className?: string }) {
  return <Icon name="loader-2" className={`animate-spin ${className}`} />;
}

/**
 * Confirmation or error, placed next to whatever the member just pressed.
 * `tone="error"` borrows the red feedback ramp; everything else is teal.
 */
export function Notice({
  children,
  tone = "ok",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "ok" | "error";
  className?: string;
}) {
  const tones = {
    ok: "bg-teal-50 border-teal-200 text-teal-900",
    error: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className={`border text-sm rounded-xl px-3 py-2 ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-full bg-teal-100 text-teal-800 border border-teal-200 font-semibold ${
        small ? "w-5 h-5 text-[9px]" : "w-8 h-8 text-xs"
      }`}
    >
      {initials}
    </span>
  );
}

/**
 * Status chip. This is the website's `subtle` badge variant: a tinted surface,
 * the matching foreground, and an 8px radius (`radius-input`/Chakra `l2`).
 *
 * These used to be white pills with a tinted ring and the halo shadow — but
 * that treatment is the design system's *section eyebrow*, a once-per-section
 * label that introduces a heading. Wearing it on every inline status made the
 * eyebrow mean nothing. See `Eyebrow` below for the real thing.
 */
export function Badge({
  children,
  tone = "stone",
}: {
  children: React.ReactNode;
  tone?: "stone" | "green" | "amber" | "red" | "teal" | "indigo";
}) {
  const tones: Record<string, string> = {
    stone: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-green-50 text-green-600 border-green-500/20",
    amber: "bg-orange-50 text-orange-600 border-orange-500/20",
    red: "bg-red-50 text-red-600 border-red-500/20",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    indigo: "bg-teal-100 text-teal-800 border-teal-200",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-lg border text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Section eyebrow — the small white teal-ringed pill with the soft halo that
 * sits above a section heading on the website (Chakra's `sectionBadge`, the
 * default badge variant there). One per section, never inline.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="badge-halo inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs text-teal-600">
      {children}
    </span>
  );
}

// Buttons: 16px radius, sentence case, the signature pressable-key shadow.
export const btnPrimary =
  "btn-key inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-600/90 text-white font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const btnSecondary =
  "btn-key-subtle inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const btnDanger =
  "btn-key-subtle inline-flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
export const labelCls = "block text-sm font-medium text-slate-700 mb-1";
