import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 이 PC는 IPv4 bind가 깨져 dev 서버를 `-H ::1`로 띄운다 (package.json).
   * Next는 초기화 호스트(localhost) 외의 오리진에서 온 dev 자원 요청을 막으므로
   * `[::1]`로 접속하면 JS 청크와 HMR이 차단되고, 클라이언트 컴포넌트가
   * 스크립트 없이 렌더돼 버튼이 눌리지 않는다.
   *
   * dev 전용 설정이라 배포에는 영향이 없다.
   */
  allowedDevOrigins: ["[::1]"],
};

export default nextConfig;
