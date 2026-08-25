-- 0008_briefing_sections.sql
-- 브리핑을 4섹션 + 개조식 구조로.
--
-- 문제 1: 브리핑이 "1부 시장과 경제 / 2부 오늘의 세계" 두 덩어리라
--         국내와 국제가 소구분으로 밀려 있었다. 축이 하나뿐이라
--         "지금 내 주변"과 "바깥 세상"이 분리되지 않는다.
-- 문제 2: 본문이 fact 한 덩어리 문장이라 스캔이 안 된다.
--         매일 10분 읽는 글인데 문단을 다 읽어야 뭘 말하는지 안다.
--
-- 변경:
--   section: 국내 경제 / 국제 경제 / 국내 정치·사회 / 국제 정치·사회
--   points:  개조식 불렛 배열. fact에는 같은 내용을 줄바꿈으로 이어 붙여
--            채운다(not null 제약 충족 + 하위 호환).

alter table public.briefing_news
  add column if not exists points jsonb,
  add column if not exists section text;

-- 기존 행은 part/region으로 섹션을 역산해 채운다.
update public.briefing_news
set section = case
  when coalesce((implication_json ->> 'part')::int, 1) = 1
    then case when implication_json ->> 'region' = 'global'
              then 'global_economy' else 'kr_economy' end
  else case when implication_json ->> 'region' = 'global'
            then 'global_politics' else 'kr_politics' end
end
where section is null;

create index if not exists briefing_news_section_idx
  on public.briefing_news (briefing_id, section, position);
