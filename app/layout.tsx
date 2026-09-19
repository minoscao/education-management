import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "教学运营管理系统",
  description: "课程开班、排课、报名、收费、资源预订与上课管理。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
