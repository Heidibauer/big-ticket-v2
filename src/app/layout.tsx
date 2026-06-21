import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Big Ticket — Product Discovery",
  description: "An AI buyer, merchandiser, and curator that finds products worth owning.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Montserrat is Big Ticket's brand font. Loaded via stylesheet link
            (not next/font) so the build never depends on Google Fonts being
            reachable at build time. Falls back to the system sans stack in
            globals.css if the network is unavailable. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
