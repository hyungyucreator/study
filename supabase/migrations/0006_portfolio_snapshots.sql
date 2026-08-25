-- 0006_portfolio_snapshots.sql
-- 총자산 추이용 일별 스냅샷.
--
-- 문제: holdings는 "지금"만 담는다. 어제 총자산이 얼마였는지 알 방법이 없어
--       추이를 그릴 수 없고, 자산이 늘었을 때 "돈을 더 넣어서"인지
--       "갖고 있던 게 올라서"인지 구분할 수 없다.
-- 변경: 하루에 한 행. 평가액(total_krw)과 매입원가(book_krw)를 함께 남긴다.
--       둘의 간격이 곧 손익이고, book_krw가 뛰면 신규 납입이다.
-- by_class: 자산군별 원화 평가액 스냅샷. 과거 시점의 비중을 되돌아볼 때 쓴다.

create table if not exists public.portfolio_snapshots (
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  total_krw  numeric not null,
  book_krw   numeric not null,
  by_class   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists portfolio_snapshots_user_date_idx
  on public.portfolio_snapshots (user_id, date desc);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "portfolio_snapshots_select_own" on public.portfolio_snapshots;
drop policy if exists "portfolio_snapshots_insert_own" on public.portfolio_snapshots;
drop policy if exists "portfolio_snapshots_update_own" on public.portfolio_snapshots;
drop policy if exists "portfolio_snapshots_delete_own" on public.portfolio_snapshots;

create policy "portfolio_snapshots_select_own" on public.portfolio_snapshots
  for select to authenticated using (auth.uid() = user_id);
create policy "portfolio_snapshots_insert_own" on public.portfolio_snapshots
  for insert to authenticated with check (auth.uid() = user_id);
create policy "portfolio_snapshots_update_own" on public.portfolio_snapshots
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "portfolio_snapshots_delete_own" on public.portfolio_snapshots
  for delete to authenticated using (auth.uid() = user_id);
