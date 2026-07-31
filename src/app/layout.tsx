import type { Metadata, Viewport } from "next";
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
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Brand fonts: Sentient (headings) via Fontshare, Atkinson
            Hyperlegible Next (body/UI) via Google Fonts — the pairing is
            the signature of the EAN design system. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=sentient@400,500,700&display=swap"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
