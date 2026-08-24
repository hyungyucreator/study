-- 0001_init.sql
-- ARCHITECTURE.md §5 스키마 초안 구현. Supabase SQL Editor에 그대로 붙여넣어 실행한다.
-- 원칙: 금액·수량은 numeric(부동소수점 금지), 시각은 전부 timestamptz,
--       모든 테이블 RLS 활성화, 유저 테이블은 auth.uid() = user_id.
-- 이 파일은 수정하지 않는다. 스키마 변경은 새 마이그레이션 파일로 추가한다.

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. 프로필 (auth.users 확장)
-- =====================================================================
-- auth.users에는 직접 컬럼을 붙일 수 없으므로 1:1 profiles 테이블을 둔다.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. 공용 테이블
--    읽기: 로그인 유저 전원 / 쓰기: service_role(파이프라인)만.
--    service_role은 RLS를 우회하므로 쓰기 정책을 따로 만들지 않는다.
-- =====================================================================

-- 수집한 뉴스 메타데이터. 기사 전문은 저장하지 않는다 (제목 + 리드문 + 링크만).
create table if not exists public.raw_news (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  url          text not null,
  title        text not null,
  lead         text,
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now(),
  category     text not null check (
    category in ('market', 'economy', 'politics', 'society', 'world', 'tech', 'policy')
  ),
  unique (url)
);

create index if not exists raw_news_published_at_idx on public.raw_news (published_at desc);
create index if not exists raw_news_category_published_idx on public.raw_news (category, published_at desc);

-- 시세·매크로 원본
create table if not exists public.raw_market (
  id     uuid primary key default gen_random_uuid(),
  symbol text not null,
  kind   text not null check (kind in ('price', 'rate', 'fx', 'index', 'macro')),
  value  numeric not null,
  as_of  timestamptz not null,
  source text not null,
  unique (symbol, kind, as_of, source)
);

create index if not exists raw_market_symbol_as_of_idx on public.raw_market (symbol, as_of desc);

-- 브리핑 본문 (전 유저 공용 1회 생성)
create table if not exists public.briefings (
  id               uuid primary key default gen_random_uuid(),
  date             date not null,
  type             text not null check (type in ('daily', 'event')),
  body_md          text not null,
  temperature_json jsonb,          -- 오늘의 온도 4지표 스냅샷
  created_at       timestamptz not null default now()
);

-- 멱등 재시도: 같은 날짜의 daily 브리핑은 하나만.
create unique index if not exists briefings_daily_unique
  on public.briefings (date) where type = 'daily';
create index if not exists briefings_date_idx on public.briefings (date desc);

-- 브리핑에 실린 개별 뉴스의 3단 구조 (사실 → 서프라이즈 → 자산군 함의)
create table if not exists public.briefing_news (
  id               uuid primary key default gen_random_uuid(),
  briefing_id      uuid not null references public.briefings (id) on delete cascade,
  raw_news_id      uuid references public.raw_news (id) on delete set null,
  fact             text not null,
  surprise         text,
  implication_json jsonb,          -- 자산군 단위 함의. 개별 종목 함의 금지.
  source_url       text not null,  -- 원문 링크 필수 (전문 확인은 링크아웃으로만)
  position         integer not null default 0,
  unique (briefing_id, position)
);

create index if not exists briefing_news_briefing_idx on public.briefing_news (briefing_id);

-- 경제 캘린더
create table if not exists public.events_calendar (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  scheduled_at timestamptz not null,
  kind         text not null,      -- fomc, cpi, bok_rate, payrolls 등
  importance   smallint not null default 1 check (importance between 1 and 3),
  source       text not null default 'manual',
  unique (kind, scheduled_at)
);

create index if not exists events_calendar_scheduled_idx on public.events_calendar (scheduled_at);

-- 위클리 딥다이브
create table if not exists public.deep_dives (
  id           uuid primary key default gen_random_uuid(),
  week         date not null,      -- 해당 주의 월요일
  title        text not null,
  body_md      text not null,
  sources_json jsonb,
  created_at   timestamptz not null default now(),
  unique (week)
);

-- 개념 카드: 1회 생성 후 영구 저장, 재생성 금지
create table if not exists public.concept_cards (
  id         uuid primary key default gen_random_uuid(),
  term       text not null,
  body_md    text not null,
  created_at timestamptz not null default now(),
  unique (term)
);

-- ETF 카탈로그 (코어/틸트 2층). 하드코딩 금지, 분기 1회 갱신.
create table if not exists public.etf_catalog (
  id               uuid primary key default gen_random_uuid(),
  layer            text not null check (layer in ('core', 'tilt')),
  category         text not null,
  ticker           text not null,
  name             text not null,
  expense_ratio    numeric,
  aum              numeric,
  tracking_error   numeric,
  hedged           boolean,
  dist_type        text check (dist_type in ('dist', 'acc')),
  pension_eligible boolean,
  regime_tags_json jsonb,
  updated_at       timestamptz not null default now(),
  unique (ticker)
);

create index if not exists etf_catalog_layer_category_idx on public.etf_catalog (layer, category);

alter table public.raw_news        enable row level security;
alter table public.raw_market      enable row level security;
alter table public.briefings       enable row level security;
alter table public.briefing_news   enable row level security;
alter table public.events_calendar enable row level security;
alter table public.deep_dives      enable row level security;
alter table public.concept_cards   enable row level security;
alter table public.etf_catalog     enable row level security;

create policy "raw_news_read" on public.raw_news
  for select to authenticated using (true);
create policy "raw_market_read" on public.raw_market
  for select to authenticated using (true);
create policy "briefings_read" on public.briefings
  for select to authenticated using (true);
create policy "briefing_news_read" on public.briefing_news
  for select to authenticated using (true);
create policy "events_calendar_read" on public.events_calendar
  for select to authenticated using (true);
create policy "deep_dives_read" on public.deep_dives
  for select to authenticated using (true);
create policy "concept_cards_read" on public.concept_cards
  for select to authenticated using (true);
create policy "etf_catalog_read" on public.etf_catalog
  for select to authenticated using (true);

-- =====================================================================
-- 3. 유저별 테이블 (RLS: auth.uid() = user_id)
-- =====================================================================

create table if not exists public.holdings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  source      text not null check (source in ('kis', 'manual')),
  symbol      text not null,
  name        text not null,
  asset_class text not null check (
    asset_class in ('kr_equity', 'intl_equity', 'etf', 'bond', 'commodity', 'cash', 'other')
  ),
  qty         numeric not null default 0,
  avg_price   numeric not null default 0,
  currency    text not null default 'KRW',
  updated_at  timestamptz not null default now(),
  unique (user_id, source, symbol)
);

create index if not exists holdings_user_idx on public.holdings (user_id);

create table if not exists public.target_weights (
  user_id     uuid not null references auth.users (id) on delete cascade,
  asset_class text not null check (
    asset_class in ('kr_equity', 'intl_equity', 'etf', 'bond', 'commodity', 'cash', 'other')
  ),
  weight      numeric not null check (weight >= 0 and weight <= 1),
  updated_at  timestamptz not null default now(),
  primary key (user_id, asset_class)
);

create table if not exists public.rebalance_orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  items_json    jsonb not null,   -- 주문서 내역. 앱은 계산·표시만 하고 실행하지 않는다.
  status        text not null default 'proposed'
                check (status in ('proposed', 'executed', 'dismissed')),
  snapshot_json jsonb,            -- 실행 감지 시 온도 4지표 자동 기록
  executed_at   timestamptz
);

create index if not exists rebalance_orders_user_idx on public.rebalance_orders (user_id, created_at desc);

create table if not exists public.trade_memos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  holding_ref uuid references public.holdings (id) on delete set null,
  memo_text   text not null,     -- 선택적 한 줄. 강제 입력 양식 금지.
  created_at  timestamptz not null default now()
);

create index if not exists trade_memos_user_idx on public.trade_memos (user_id, created_at desc);

-- 단어장
create table if not exists public.user_cards (
  user_id         uuid not null references auth.users (id) on delete cascade,
  concept_card_id uuid not null references public.concept_cards (id) on delete cascade,
  saved_at        timestamptz not null default now(),
  primary key (user_id, concept_card_id)
);

create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null,   -- briefing, move_2pct, pipeline_failure 등
  payload_json jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists alerts_user_idx on public.alerts (user_id, created_at desc);

alter table public.holdings         enable row level security;
alter table public.target_weights   enable row level security;
alter table public.rebalance_orders enable row level security;
alter table public.trade_memos      enable row level security;
alter table public.user_cards       enable row level security;
alter table public.alerts           enable row level security;

-- 유저 테이블 4종 정책 (select/insert/update/delete)
do $policies$
declare
  t text;
begin
  foreach t in array array[
    'holdings', 'target_weights', 'rebalance_orders', 'trade_memos', 'user_cards', 'alerts'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
      t || '_delete_own', t);
  end loop;
end;
$policies$;
