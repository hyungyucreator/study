-- 0011_cron_runs.sql
-- 파이프라인 실행 기록.
--
-- 문제: 자동화를 붙이는 순간 실패가 조용해진다. 지금까지는 내가 직접 엔드포인트를
--       호출하고 응답을 눈으로 봤기 때문에 실패를 즉시 알았다. 크론이 대신 돌면
--       실패해도 아무 일도 일어나지 않고, 며칠 뒤 브리핑이 비어 있는 걸로 알게 된다.
--       RSS는 과거 기사를 주지 않으므로 놓친 날은 영영 복구되지 않는다.
--
-- 변경: 단계마다 성공·실패를 남긴다. 브리핑 화면이 이 표를 읽어 어제 실패를 알린다.
--       알림 채널(텔레그램)은 나중에 이 표 위에 얹는다.

create table if not exists public.cron_runs (
  id          uuid primary key default gen_random_uuid(),
  -- KST 기준 실행 날짜. 하루치 결과를 한 줄로 묶어 보기 위한 것
  date        date not null,
  -- collect-news / collect-macro / generate-briefing / daily
  step        text not null,
  -- ok / failed / skipped
  status      text not null,
  -- 건수, 실패 메시지, 죽은 피드 목록 같은 것
  detail      jsonb,
  duration_ms integer,
  started_at  timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists cron_runs_recent_idx
  on public.cron_runs (date desc, started_at desc);

-- 공용 테이블 패턴: 읽기는 인증 유저 전원, 쓰기는 service_role만.
alter table public.cron_runs enable row level security;

drop policy if exists "cron_runs_read" on public.cron_runs;

create policy "cron_runs_read" on public.cron_runs
  for select to authenticated using (true);
