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

## 스크립트

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드
- `npm run start` — 빌드 결과 실행
- `npm run lint` — ESLint
