import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeamPulse",
  description: "团队 AI 协作面板",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
