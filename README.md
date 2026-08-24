# 투자 데스크

매일 10분 브리핑으로 세상과 시장 국면을 함께 읽고, ETF 중심 자산배분을 관리하는 개인 대시보드.

## 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | 작업 원칙과 금지 사항 |
| [PRODUCT.md](./PRODUCT.md) | 기능 정의 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 스택·데이터·파이프라인·DB 스키마 |
| [DESIGN.md](./DESIGN.md) | 디자인·문체 규칙 |
| [ROADMAP.md](./ROADMAP.md) | 빌드 순서 |
| [CHANGELOG.md](./CHANGELOG.md) | 변경 이력 |

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL / anon key 채우기
npm run dev                  # http://localhost:3000
```

DB 스키마는 `supabase/migrations/`의 SQL을 Supabase SQL Editor에서 실행한다.

## 로컬 개발 서버가 `listen EFAULT`로 죽는 경우

이 개발 PC는 Winsock의 **IPv4 바인딩이 손상**돼 있어 새 프로세스가 IPv4 소켓을 열지 못한다
(포트 무관, Node·.NET 공통, IPv6는 정상). 그래서 `dev` 스크립트를 IPv6 루프백에 고정했다.

    npm run dev        # next dev -H ::1  -> http://localhost:3000 접속 가능

시스템을 고치려면 관리자 PowerShell에서 `netsh winsock reset` 실행 후 재부팅한다.
고친 뒤에는 `npm run dev:ipv4`로 기본 동작을 확인할 수 있다.

## 스크립트

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드
- `npm run start` — 빌드 결과 실행
- `npm run lint` — ESLint
