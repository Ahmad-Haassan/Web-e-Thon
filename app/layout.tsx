import type { Metadata } from "next";
import { Geist_Mono, Roboto, Rubik } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const roboto = Roboto({
  variable: "--font-sans-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Examination Management Portal",
  description:
    "Failure-resilient, cryptographically verifiable examination management portal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-contrast="normal"
      data-font-size="md"
      className={`${rubik.variable} ${roboto.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
