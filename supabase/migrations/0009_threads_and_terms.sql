-- 0009_threads_and_terms.sql
-- 브리핑에 기억과 설명을 붙인다.
--
-- 문제 1: 브리핑에 기억이 없었다. briefingWindow()는 시각 커트라인일 뿐이고
--         어제 브리핑 내용이 오늘 모델에 전달되지 않았다. 매일 20건을 읽어도
--         서로 연결되지 않으니 소비만 하고 축적이 없다. RSS 리더와 같은 구조다.
-- 문제 2: 학습 제품이면서 가르치지 않았다. "채권 하방, 장기금리 추가 상승 베팅"은
--         금리와 채권 가격의 역관계를 이미 아는 사람에게만 정보다.
--
-- 변경:
--   threads / thread_news: 뉴스를 날짜 넘어 하나의 흐름으로 묶는다
--   briefing_news.thread_id, .terms: 항목이 속한 이슈와 설명이 필요한 용어
--   concept_cards.summary: 툴팁에 들어갈 2~3문장

-- 진행 중인 이슈. 전 유저 공용이다.
create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,   -- 사건이 아니라 흐름. "협상단 철수"가 아니라 "미국 통상 압박"
  summary      text,            -- 한 줄. 최신 상태
  started_on   date not null,
  last_seen_on date not null,
  entries      integer not null default 0,   -- 전개 횟수
  created_at   timestamptz not null default now()
);

create index if not exists threads_last_seen_idx
  on public.threads (last_seen_on desc);

-- 스레드에 속한 원본 기사. 브리핑에 안 실린 것도 타임라인에 넣어
-- 스레드를 만든 첫날부터 여러 날짜가 찍히게 한다.
create table if not exists public.thread_news (
  thread_id    uuid not null references public.threads (id) on delete cascade,
  raw_news_id  uuid not null references public.raw_news (id) on delete cascade,
  published_at timestamptz not null,
  primary key (thread_id, raw_news_id)
);

create index if not exists thread_news_timeline_idx
  on public.thread_news (thread_id, published_at desc);

alter table public.briefing_news
  add column if not exists thread_id uuid references public.threads (id),
  add column if not exists terms jsonb;

create index if not exists briefing_news_thread_idx
  on public.briefing_news (thread_id);

-- 툴팁용 짧은 정의. body_md는 조금 더 긴 설명을 담는다.
alter table public.concept_cards
  add column if not exists summary text;

-- 공용 테이블 패턴: 읽기는 인증 유저 전원, 쓰기는 service_role만.
alter table public.threads     enable row level security;
alter table public.thread_news enable row level security;

drop policy if exists "threads_read" on public.threads;
drop policy if exists "thread_news_read" on public.thread_news;

create policy "threads_read" on public.threads
  for select to authenticated using (true);
create policy "thread_news_read" on public.thread_news
  for select to authenticated using (true);
