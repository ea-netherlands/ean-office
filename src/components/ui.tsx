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

export function Badge({
  children,
  tone = "stone",
}: {
  children: React.ReactNode;
  tone?: "stone" | "green" | "amber" | "red" | "teal" | "indigo";
}) {
  // Brand eyebrow-style pills: white surface, tinted ring + text, soft halo.
  const tones: Record<string, string> = {
    stone: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-white text-green-600 border-green-500/40 badge-halo",
    amber: "bg-white text-orange-600 border-orange-500/40 badge-halo",
    red: "bg-white text-red-600 border-red-500/40 badge-halo",
    teal: "bg-white text-teal-600 border-teal-200 badge-halo",
    indigo: "bg-teal-100 text-teal-800 border-teal-200",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Buttons: 16px radius, sentence case, the signature pressable-key shadow.
export const btnPrimary =
  "btn-key inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const btnSecondary =
  "btn-key-subtle inline-flex items-center justify-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const btnDanger =
  "btn-key-subtle inline-flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-medium rounded-2xl px-4 py-2.5 text-sm disabled:opacity-50 cursor-pointer";
export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
export const labelCls = "block text-sm font-medium text-slate-700 mb-1";
