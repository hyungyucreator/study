-- 0007_briefing_headline.sql
-- 브리핑 뉴스에 한 줄 제목 추가.
--
-- 문제: briefing_news는 fact/surprise/implication만 담아서, 화면에서 목록을
--       그리려면 fact 첫 문장을 잘라 쓰는 수밖에 없었다. 모델은 이미 headline을
--       만들고 있는데 저장할 자리가 없어 버려지고 있었다.
-- 변경: headline 컬럼 추가. 기존 행은 null로 남고 화면에서 fact로 대체한다.

alter table public.briefing_news
  add column if not exists headline text;
