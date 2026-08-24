# CHANGELOG.md

> 모든 유의미한 변경은 여기에 기록한다. 형식: 날짜 — 변경 내용 — 이유.

## [Unreleased]

### 2026-08-25 — 로컬 개발 서버 기동 불가 해결

- **`dev` 스크립트를 `next dev -H ::1`로 고정.** *이유: 개발 PC의 Winsock IPv4 바인딩이 손상돼 새 프로세스가 IPv4 소켓을 열 수 없음(포트 무관, Node·.NET 모두 WSAEFAULT, IPv6는 정상, 기존 리스너 39개는 멀쩡, 아웃바운드 연결도 정상). Next·프로젝트 코드 문제가 아니며 IPv6 루프백 바인딩으로 우회. Windows가 localhost를 ::1로 해석하므로 `http://localhost:3000` 접속은 그대로 동작.*
- 원인 후보였던 DLL 주입(KOSinj 등)은 배제 — `node.exe`에 주입된 비시스템 DLL이 없음. 근본 해결책은 `netsh winsock reset` + 재부팅이며, README에 기록.

### 2026-08-24 — 2단계: KIS 연동 (토큰 → 잔고조회 → holdings 동기화)

- **KIS 토큰 캐시를 DB 테이블로 (`0002_kis_token.sql`)** — RLS를 켜되 정책을 만들지 않아 service_role만 접근 가능. *이유: ARCHITECTURE §7이 토큰 캐시를 요구하는데 서버리스는 인스턴스 메모리가 유지되지 않아 매 요청 재발급 위험이 있고(KIS는 1분 1회 제한), 이 토큰은 주문 권한까지 가진 자격증명이라 브라우저 세션으로 읽히면 안 됨.*
- **`src/lib/kis/` 추가** — `token.ts`(발급·캐시·만료 10분 여유), `balance.ts`(국내 TTTC8434R / 해외 TTTS3012R, 연속조회), `sync.ts`(holdings upsert). 전부 `server-only`. *이유: 잔고조회는 읽기 전용이며, 주문 TR은 어디에도 두지 않는다(CLAUDE.md §2-1).*
- **동기화 규칙** — 사용자가 고친 `asset_class`는 다음 동기화가 덮어쓰지 않음, KIS에서 사라진 종목은 `source='kis'` 행만 삭제(수동 입력 행 보존), 보유수량 0(당일 전량매도)은 제외, 예수금(`dnca_tot_amt`)을 현금 자산으로 반영. *이유: 자동 동기화가 사용자의 수정과 수동 입력을 파괴하지 않아야 하고, 현금은 자산배분 비중 계산에 필요함.*
- **국내 ETF는 상품명 브랜드로 추정** (KODEX/TIGER/ACE/SOL 등). 실계좌 8종목으로 검증 — ETF 6건·주식 2건 정확히 분류. *이유: 잔고 응답에 상품 유형 필드가 없음. 틀리면 사용자가 고치고, 고친 값은 유지됨.*
- **`KIS_OWNER_EMAIL` 게이트 추가** — 설정 시 해당 계정만 동기화 가능. *이유: KIS 계좌는 소유자 한 명의 것이라, 지인 공유 단계에서 남의 잔고가 그 사람 포트폴리오로 들어가는 사고를 미리 막음.*

### 2026-08-24 — 2단계 시작: 수동 자산 입력 CRUD

- **`/holdings` 보유자산 화면** — 자산군별 그룹 테이블(수량·평단·매입금액 전부 tabular-nums), 추가 폼, `/holdings/[id]` 수정·삭제. *이유: ROADMAP 2단계 첫 항목이며 외부 API 키 없이 데이터 경로(RLS → 조회 → 변경)를 먼저 검증할 수 있음.*
- **서버 액션에서 `user_id`를 서버가 채우고 `.eq("user_id", user.id)`로 이중 방어.** *이유: 서버 액션은 UI를 거치지 않고 POST로 직접 호출될 수 있어, RLS만 믿지 않고 애플리케이션 레벨에서도 소유권을 확인.*
- **통화 기준 결정: 원화 환산 단일 기준.** 지금은 통화별 매입금액 합계만 표시하고, 원화 환산 총액은 시세·환율 연동 시 추가. *이유: 환율 데이터가 아직 없어 환산값을 만들면 근거 없는 숫자가 됨.*
- **현금 자산군은 평단 입력을 비활성하고 1로 저장.** *이유: 현금에 평단 개념이 없으며, 강제 입력을 만들지 않는다는 원칙(귀찮게 하지 않는다)에 맞춤.*
- 에러 문구에 적색을 쓰지 않음. *이유: 이 제품에서 적색은 '수익'을 뜻하므로 의미 충돌.*

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
