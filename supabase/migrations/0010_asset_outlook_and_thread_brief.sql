-- 0010_asset_outlook_and_thread_brief.sql
-- 자산군 함의를 브리핑 단위로 종합하고, 이슈에 서사를 붙인다.
--
-- 문제 1: 자산군 함의가 항목마다 붙어 있어 모순이 드러나지 않았다.
--         한 브리핑 안에 "채권 상방"이 둘, "채권 하방"이 하나 실렸고,
--         국내 국고채와 미 국채가 같은 bond 코드라 구분되지 않았다.
--         통화는 더 심해서 원화 약세와 약달러가 같은 currency로 뭉쳤다.
--         항목별로 흩어놓으면 아무도 모순을 눈치채지 못한다.
-- 문제 2: 이슈가 라벨에 그쳤다. threads.summary는 마지막 항목의 헤드라인일 뿐이라
--         이슈 화면을 열어도 기사 목록만 나왔다. 서사가 없으면 이슈가 아니다.
--
-- 변경:
--   briefings.asset_outlook: 브리핑 전체를 종합한 자산군 방향
--   threads.brief_json: 이슈 브리프 (무엇인가 / 지금까지 / 다음 분기점)
--   threads.closed_on: 명시적 종결. 없으면 last_seen_on으로 진행·주시를 판정한다

alter table public.briefings
  add column if not exists asset_outlook jsonb;

alter table public.threads
  add column if not exists brief_json jsonb,
  add column if not exists brief_updated_on date,
  add column if not exists closed_on date;

create index if not exists threads_open_idx
  on public.threads (closed_on, last_seen_on desc);
