import type { Metadata } from "next";
import { Inter, Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { CursorGlow } from "@/components/motion";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const interTight = Inter_Tight({
  variable: "--nf-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--nf-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--nf-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
  applicationName: BRAND.name,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${instrumentSerif.variable} ${jetbrains.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: { background: "#0f1115", color: "#f4f4f5", border: "1px solid rgba(255,255,255,0.08)", fontSize: 13 },
            success: { iconTheme: { primary: "#5eead4", secondary: "#0f1115" } },
            error: { iconTheme: { primary: "#f87171", secondary: "#0f1115" } },
          }}
        />
        <CursorGlow />
        {children}
      </body>
    </html>
  );
}
