import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ResolveAI | Intelligent Support Intelligence & Autonomous Resolution Hub",
  description: "Modern customer support intelligence cockpit with real-time intent triaging, sentiment analysis, grounded RAG responses, and dynamic analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500 selection:text-white font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
