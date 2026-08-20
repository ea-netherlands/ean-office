import type { Metadata, Viewport } from "next";
import { atkinson, sentient } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "EA Netherlands Office",
  description:
    "Desk booking and check-in for the EA Netherlands coworking office in Amsterdam",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${atkinson.variable} ${sentient.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
