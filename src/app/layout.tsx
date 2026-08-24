import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard 단일 폰트, self-host (DESIGN.md §3)
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "투자 데스크",
  description: "매일 10분 브리핑과 ETF 중심 자산배분을 관리하는 개인 대시보드",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
