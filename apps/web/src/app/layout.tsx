import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const workSans = Work_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-work-sans",
});

export const metadata: Metadata = {
  title: "Little Plains Archive — Inspiration from the team",
  description: "A curated collection of inspiration links shared by the team. Ideas, references, and things worth remembering.",
  openGraph: {
    title: "Little Plains Archive — Inspiration from the team",
    description: "A curated collection of inspiration links shared by the team. Ideas, references, and things worth remembering.",
    siteName: "Little Plains Archive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Little Plains Archive - Inspiration from the team",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Little Plains Archive — Inspiration from the team",
    description: "A curated collection of inspiration links shared by the team. Ideas, references, and things worth remembering.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${workSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
