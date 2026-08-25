# ARCHITECTURE.md

## 1. 기술 스택

- **프론트:** Next.js (App Router) + Tailwind CSS. 배포 Vercel.
- **DB/인증:** Supabase (Postgres + Auth + Row Level Security). 유저별 데이터 분리 필수 — 브리핑·카탈로그·개념카드는 공용 테이블, 포트폴리오·알림·단어장은 유저 테이블.
- **배치/크론:** Vercel Cron (매일 브리핑, 시세 갱신) + Supabase Edge Functions. 모니터링 보조로 n8n 활용 가능.
- **알림:** Web Push (PWA). 보조 채널로 텔레그램 봇 (파이프라인 장애 알림용).
- **AI:** Anthropic API. 모델 티어링·캐싱·배치는 §4 참조.
- **모바일:** PWA (홈화면 추가). 네이티브 없음.

## 2. 데이터 소스

| 데이터 | 1차 소스 | 폴백 | 비고 |
|---|---|---|---|
| 국내 시세 | KIS OpenAPI | — | 잔고조회 API로 보유내역 동기화 겸용 |
| 해외 시세 | yfinance | Finnhub 무료 티어 | |
| 미국 매크로 | FRED API | — | 기준금리, 10년물, VIX 등 |
| 국내 매크로 | 한국은행 ECOS API | — | 기준금리, 환율 |
| 뉴스(시장·경제) | RSS 카테고리당 2~3개 (한경, 매경, 연합 경제, Reuters Business 등) | 네이버 검색 API(뉴스) | 크롤링 금지 |
| 뉴스(정치·사회) | 연합 정치/사회 등 RSS 2~3개 (성향 다른 매체 혼합) | 네이버 검색 API(뉴스) | 브리핑 2부용 |
| 뉴스(국제·테크·정책) | Reuters World, 테크·정책 피드 2~3개 | 네이버 검색 API(뉴스) | 브리핑 2부용 |
| 뉴스 교차 확인 | 네이버 검색 API(뉴스) — 공식 오픈 API | — | RSS로 발견된 이슈의 타 매체 보도 여부·프레이밍 차이 확인. 다수 매체 동시 보도 = 중요도 신호로 사전 필터링에 활용. 네이버 뉴스 페이지 크롤링은 금지 |
| 경제 캘린더 | FRED 릴리즈 캘린더 | 수동 보완 테이블 | Investing.com 크롤링 금지 |
| ETF 카탈로그 | 분기 1회 수동+반자동 갱신 | — | 하드코딩 금지, DB 테이블 |

## 3. 데이터 파이프라인 5원칙 (필수 준수)

1. **크롤링 최소화, 공식 API 우선.** HTML 크롤링 의존 기능은 만들지 않는다.
2. **소스마다 폴백 체인.** `소스A 실패 → 소스B → 전부 실패 시 해당 섹션만 생략하고 브리핑 본문에 "오늘 ○○ 데이터 수집 실패" 명시`. 브리핑 전체 미발행은 최후의 수단.
   - 뉴스는 장애 대비뿐 아니라 **편향 대비**로도 복수 매체 필수 (특히 정치·사회). 단일 매체의 프레이밍이 AI 요약을 거치며 중립적 문장으로 보이는 것을 경계. 통신사(연합 등) 스트레이트 보도를 사실 레이어의 축으로 사용.
3. **원본 저장.** 수집한 뉴스 메타데이터(제목·리드문·출처 링크)와 시세를 가공 전 raw 테이블에 저장. 브리핑 생성 실패 시 재시도 가능, 프롬프트 개선 후 과거 날짜 재생성 가능.
   - **기사 전문은 수집·저장·표시하지 않는다** (저작권 + 크롤링 금지 원칙). 세부 내용 확인은 출처 링크로 원문 이동. 해석 재료는 제목+리드문+타 매체 교차확인으로 충분하며, 핵심 지표(금리·CPI 등)는 뉴스가 아니라 FRED/ECOS 원데이터를 1차 소스로 사용. 리드문만으로 해석이 어려운 기사는 제외하거나 짧게만 다룬다.
4. **헬스체크 + 장애 알림.** 수집 후 자가진단: 소스별 최소 건수 충족 여부, 시세 동결(전일과 완전 동일 = 피드 멈춤 신호) 감지. 실패 시 즉시 텔레그램 알림.
5. **멱등성 재시도.** cron 실패 시 30분 뒤 자동 재시도, 해당 날짜 브리핑이 이미 존재하면 스킵.

## 4. Anthropic API 비용 설계 (4레버)

> 정확한 단가는 구현 시점에 공식 요금 문서에서 재확인할 것.

1. **모델 티어링.** 데일리 브리핑·딥다이브·**개념 카드** → Sonnet. 뉴스 1차 분류는 코드로 처리한다. 전 작업 상위 모델 사용 금지.
   - 개념 카드를 Haiku에서 Sonnet으로 올렸다(2026-08-26). 카드는 한 번 만들면 영구 저장이라 재생성이 없고 하루 몇 건뿐이라 비용 차이가 미미하다. 초보자에게 개념을 정확히 설명하는 일은 요약보다 어렵고, 값싼 모델로 틀린 설명을 영구 저장하는 쪽이 더 비싸다.
2. **프롬프트 캐싱.** 브리핑 시스템 프롬프트(포맷·해석 원칙·금지 표현)는 매일 동일 → cache_control 지정. 캐시 히트 시 입력 단가 대폭 할인.
3. **배치 API (시간 비민감 작업만).** 배치는 입력·출력 50% 할인이고 캐싱과 중첩 적용됨. 데일리 브리핑은 새벽 04:00 배치 제출 → 07:00 완료 버퍼. 위클리 딥다이브는 무조건 배치. **이벤트 트리거 브리핑은 즉시성이 생명이므로 일반 호출.**
4. **토큰 자체를 줄이는 설계.**
   - 국내/해외 판정도 코드로 (`src/lib/news/region.ts`): 영문 매체와 `world` 분류는 해외,
     그 밖에는 한국 무대 앵커(코스피·국회·금통위 등)가 있으면 국내, 없고 해외 앵커만 있으면 해외.
   - 뉴스 사전 필터링을 코드로: RSS 수집분(수십 건)을 키워드·중복 제거로 추리되, **1부용(시장·경제)과 2부용(정치·사회·국제·테크)을 카테고리별로 분리 선별** — 합산 20건 내외, 제목+리드문만 전달.
   - 개념 카드 1회 생성 → DB 영구 저장 → 이후 DB 조회만.
   - 브리핑 본문은 전 유저 공용 1회 생성, "내 포트폴리오 연관" 블록만 유저별 짧은 호출.

## 5. DB 스키마 초안

```
-- 공용
raw_news(id, source, url, title, lead, published_at, fetched_at, category)
raw_market(id, symbol, kind, value, as_of, source)
-- 포트폴리오 시세 캐시도 이 테이블을 쓴다. kind='price'(종목 현재가), kind='fx'(symbol='USDKRW').
-- as_of는 제공자의 체결시각이 아니라 우리가 관측한 시각이다 (장 마감 후 캐시 신선도 판단용).
briefings(id, date, type[daily|event], body_md, temperature_json, created_at)
briefing_news(briefing_id, raw_news_id, thread_id, section, headline, points,
              terms, fact, surprise, implication_json, source_url, position)
events_calendar(id, name, scheduled_at, kind, importance)
deep_dives(id, week, title, body_md, sources_json)
concept_cards(id, term, summary, body_md, created_at)  -- 재생성 금지. summary는 툴팁용
threads(id, title, summary, started_on, last_seen_on, entries, created_at)  -- 공용, 이슈 흐름
thread_news(thread_id, raw_news_id, published_at)  -- 공용, 타임라인
etf_catalog(id, layer[core|tilt], category, ticker, name, expense_ratio,
            aum, tracking_error, hedged, dist_type, pension_eligible,
            regime_tags_json, updated_at)

-- 유저별 (RLS)
users(id, ...)  -- Supabase Auth
holdings(id, user_id, source[kis|manual], symbol, name, asset_class,
         is_etf, bucket, qty, avg_price, currency, updated_at)
symbol_map(symbol, name, asset_class, is_etf, bucket, note, updated_at)  -- 공용, 티커별 분류 사실
-- asset_class = 실질 노출 기준:
--   kr_equity | intl_equity | bond | commodity | currency | cash | other
--   ETF는 자산군이 아니라 is_etf 플래그. (PRODUCT.md §4-C 참조)
-- bucket = 기본값 'core'. 화면에 노출하지 않는다 (PRODUCT.md §6에서 보류).
-- target_weights / rebalance_orders는 스코프 축소로 제거 (0005_scope_reduction.sql).
--   되살릴 때는 0001_init.sql의 정의를 다시 쓴다.
trade_memos(id, user_id, holding_ref, memo_text, created_at)  -- 선택적 한 줄
user_cards(user_id, concept_card_id, saved_at)  -- 단어장
alerts(id, user_id, kind, payload_json, sent_at)
```

## 6. 크론 스케줄

| 시각(KST) | 작업 |
|---|---|
| 04:00 | 뉴스·시세·매크로 수집 → raw 저장 → 헬스체크 → 브리핑 배치 제출 |
| 06:30 | 배치 결과 회수, 미완료 시 일반 호출 폴백 |
| 07:00 | 브리핑 발행 + 푸시 |
| 장중 주기 | 시세 갱신, 급변 감지(±2%) |
| 이벤트 시각 +5분 | 이벤트 데이터 수집 → 즉시 호출 → 미니 브리핑 발행 |
| 일요일 | 딥다이브 배치 제출·발행 |
| KIS 동기화 | 장 마감 후 1회 + 앱 접속 시 |

## 7. 시크릿 관리

- KIS 앱키/시크릿, Anthropic API 키 등은 전부 서버 환경변수. 클라이언트 노출 절대 금지.
- KIS 토큰은 발급 후 캐시(유효기간 관리), 매 요청 재발급 금지.
  - 캐시 위치는 `kis_token` 테이블. RLS를 켜되 정책을 만들지 않아 service_role만 접근한다 (이 토큰은 주문 권한까지 가진 자격증명이므로 브라우저 세션에 노출되면 안 된다). 서버리스는 인스턴스 메모리가 유지되지 않아 메모리 캐시로는 KIS의 1분 1회 재발급 제한에 걸린다.
