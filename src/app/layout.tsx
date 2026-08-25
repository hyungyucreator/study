import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/**
 * 서체 두 벌 (DESIGN.md §3).
 *
 * Pretendard: 본문, 숫자, UI 전부. 자릿수 정렬이 필요한 곳은 무조건 이쪽이다.
 * Noto Serif KR: 브리핑 제목과 마스트헤드만. 화면을 관리자 도구가 아니라
 *   출판물로 읽히게 하는 장치다. 본문에는 쓰지 않는다. 매일 10분 읽을 글이라
 *   화면 가독성이 우선이다.
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const serif = Noto_Serif_KR({
  variable: "--font-serif-kr",
  weight: ["600", "700"],
  display: "swap",
  // 한글 서브셋이 200개가 넘는다. 미리 받지 않고 필요한 조각만 내려받게 둔다.
  preload: false,
  fallback: ["Apple SD Gothic Neo", "serif"],
});

export const metadata: Metadata = {
  title: "투자 데스크",
  description: "매일 10분 브리핑과 자산 현황을 확인하는 개인 대시보드",
};

export const viewport: Viewport = {
  themeColor: "#fcfcfa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
