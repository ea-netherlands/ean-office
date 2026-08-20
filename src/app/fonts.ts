import localFont from "next/font/local";

/**
 * Brand webfonts, self-hosted from the repo — the same woff2 files the website
 * ships. Previously these came from the Fontshare and Google Fonts CDNs, which
 * meant two render-blocking third-party requests on every page, Atkinson served
 * as TTF rather than woff2, and a font request to Google on behalf of a member
 * before they have consented to anything. `next/font/local` fingerprints and
 * preloads them from our own origin instead.
 */
export const atkinson = localFont({
  src: [
    { path: "../fonts/AtkinsonHyperlegibleNext-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/AtkinsonHyperlegibleNext-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/AtkinsonHyperlegibleNext-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/AtkinsonHyperlegibleNext-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/AtkinsonHyperlegibleNext-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-atkinson",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "arial"],
});

export const sentient = localFont({
  src: [
    { path: "../fonts/Sentient-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Sentient-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Sentient-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sentient",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "arial"],
});
