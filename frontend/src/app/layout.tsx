import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ResolveAI | Autonomous Support Intelligence & Resolution Cockpit",
  description: "Next-generation customer support intelligence cockpit: real-time intent triaging, sentiment analysis, policy assessment, and grounded RAG responses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased bg-[#fafafa] text-zinc-900 selection:bg-indigo-500 selection:text-white font-sans ambient-glow" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
