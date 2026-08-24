# CHANGELOG.md

> 모든 유의미한 변경은 여기에 기록한다. 형식: 날짜 — 변경 내용 — 이유.

## [Unreleased]

### 2026-08-24 — 1단계(뼈대) 구축

- **CLAUDE.md 생성** — 매매 실행·추천 문장·기사 전문 수집·크롤링·시크릿 노출 금지 등 하드룰과 디자인·문체 규칙을 한 파일에 고정. *이유: 세션이 바뀌어도 원칙이 흔들리지 않게 하기 위해.*
- **Next.js 16.3.2 (App Router) + Tailwind v4 + TypeScript 셋업**, 문서와 같은 루트에 배치. *이유: Vercel 루트 디렉터리 설정이 단순하고, 작업 중 기획 문서를 항상 옆에 두기 위해.*
- **Pretendard Variable self-host + `next/font/local`** (`src/app/fonts/`). *이유: 외부 CDN 의존 없이 오프라인 개발·CLS 제거. 전체 한글 글리프 포함이라 약 2MB.*
- **디자인 토큰을 `globals.css`의 Tailwind `@theme`에 정의** — bg/fg/muted/line + gain(적)/loss(청) 6색, 라운드 8px 이하, `tabular` 유틸(tabular-nums). 다크모드 대응 코드는 넣지 않음. *이유: DESIGN.md의 색·타이포 규칙을 코드 레벨에서 강제하고, 다크모드는 ROADMAP상 추후 과제이므로.*
- **Supabase Auth (Google OAuth) + `@supabase/ssr`** — 브라우저/서버 클라이언트, `/login`, `/auth/callback`, `/auth/signout`, 세션 갱신·미인증 리다이렉트용 `src/proxy.ts`. *이유: 처음부터 유저 분리 전제(2차 지인 공유)이고, Next.js 16에서 미들웨어 파일명이 proxy로 바뀌었기 때문.*
- **DB 스키마 `supabase/migrations/0001_init.sql`** — ARCHITECTURE §5의 공용 8개 + 유저별 6개 테이블, 전 테이블 RLS 활성화, 유저 테이블은 `auth.uid() = user_id` 4정책. 금액·수량 `numeric`, 시각 `timestamptz`, `briefings`에 일자 unique(멱등 재시도용). *이유: RLS를 나중에 붙이면 누락이 생기므로 스키마 생성과 동시에 적용.*
- **`profiles` 테이블 추가** (ARCHITECTURE의 `users(id, ...)` 구현). `auth.users`에 컬럼을 붙일 수 없어 1:1 테이블 + 가입 트리거로 대체. *이유: Supabase 표준 방식이며 스키마 설계 변경이 아님.*
- **Vercel 배포 완료** — https://study-phi-ten.vercel.app (GitHub: hyungyucreator/study, main 브랜치 자동 배포). 외부 점검 결과 `/` → 307 → `/login` 인증 가드 동작, Pretendard woff2가 `immutable` 캐시로 서빙됨. *이유: 1단계 완료 기준에 배포 파이프라인 동작 확인이 포함되므로.*
- **OAuth 콜백 에러 처리 수정** — 실패 시 오는 `error`/`error_description`을 그대로 로그인 화면에 표시하도록 변경(이전에는 전부 "인증 코드가 없다"로 뭉갬). *이유: 테스트 사용자 미등록(`access_denied`) 같은 실제 원인이 감춰져 디버깅이 불가능했음.*
- **Vercel 배포 준비** — `vercel.json`(framework nextjs, region icn1), `.env.example`, README 실행 절차. *이유: 서울 리전이 KIS·국내 데이터 소스와 가깝고 지연이 작음.*

### 2026-08-24
- 프로젝트 문서 세트 초안 작성 (PRODUCT / ARCHITECTURE / DESIGN / ROADMAP)
- 주요 설계 결정:
  - 매매 실행 기능 배제, 리밸런싱 주문서로 대체 (과잉거래 방지 + 법적 경계)
  - ETF 카탈로그 코어/틸트 2층 + 국면 태그
  - 브리핑 뉴스 필터 기준 = 직전 브리핑 생성 시각 이후 발행분
  - 국면 지표는 전용 화면 대신 브리핑 내 "오늘의 온도" 4지표로 시작
  - 퀴즈·커리큘럼·thesis 강제 입력 제외
- 브리핑을 2부 구성으로 확장: 1부 시장·경제(자산군 함의 구조) + 2부 오늘의 세계(정치·사회·국제·테크, 맥락·전망 구조) — 투자 전용이 아닌 종합 시사 도구로 목적 확장. 억지 투자 함의 연결 금지 원칙 추가
