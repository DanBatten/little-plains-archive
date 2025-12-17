import type { Metadata } from "next";
import { Crimson_Pro } from "next/font/google";
import "./globals.css";

const crimsonPro = Crimson_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-crimson-pro",
});

const DEFAULT_PROD_SITE_URL = "https://inspo.littleplains.co";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === "production"
    ? DEFAULT_PROD_SITE_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Inspiration from the Little Plains team",
  description: "A curated collection of inspiration links shared by the team. Ideas, references, and things worth remembering.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
  openGraph: {
    title: "Inspiration from the Little Plains team",
    description: "A curated collection of inspiration links shared by the team. Ideas, references, and things worth remembering.",
    siteName: "Little Plains Archive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Inspiration from the Little Plains team",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inspiration from the Little Plains team",
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
      <body className={crimsonPro.variable}>
        {children}
      </body>
    </html>
  );
}
