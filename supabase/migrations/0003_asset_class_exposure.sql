-- 0003_asset_class_exposure.sql
-- 자산군을 "상품 형태"가 아니라 "실질 노출" 기준으로 바꾼다.
--
-- 문제: 기존 목록(국내주식/해외주식/ETF/채권/원자재/현금/기타)은 층위가 섞여 있었다.
--       'ETF'는 상품 형태고 '채권·원자재'는 자산 성격이라, 보유 ETF가 전부 'ETF'로 몰리면
--       목표 비중 vs 현재 비중 막대가 "ETF 75%"처럼 나와 자산배분 판단에 쓸 수 없다.
-- 변경: 'etf'를 자산군에서 제거하고 'currency'(통화)를 추가한다.
--       ETF 여부는 자산군이 아니라 holdings.is_etf 플래그로 따로 표시한다.
--       예) KODEX 미국30년국채 -> bond + is_etf, KODEX 골드선물 -> commodity + is_etf,
--           TIGER 미국S&P500 -> intl_equity + is_etf, KODEX 미국달러선물 -> currency + is_etf

-- 1) 새 자산군 집합
--    kr_equity 국내주식 / intl_equity 해외주식 / bond 채권 / commodity 원자재
--    currency 통화 / cash 현금 / other 기타

alter table public.holdings drop constraint if exists holdings_asset_class_check;
alter table public.target_weights drop constraint if exists target_weights_asset_class_check;

-- 기존 데이터에 'etf'가 남아 있으면 새 제약에 걸리므로 먼저 옮긴다.
update public.holdings set asset_class = 'other' where asset_class = 'etf';
update public.target_weights set asset_class = 'other' where asset_class = 'etf';

alter table public.holdings
  add constraint holdings_asset_class_check check (
    asset_class in ('kr_equity', 'intl_equity', 'bond', 'commodity',
                    'currency', 'cash', 'other')
  );

alter table public.target_weights
  add constraint target_weights_asset_class_check check (
    asset_class in ('kr_equity', 'intl_equity', 'bond', 'commodity',
                    'currency', 'cash', 'other')
  );

-- 2) ETF 여부는 별도 플래그
alter table public.holdings
  add column if not exists is_etf boolean not null default false;

-- 3) 티커 -> 자산군 매핑 테이블
--    이름 추정에 의존하지 않기 위한 사실 테이블. 한 번 분류하면 다음부터 그대로 쓴다.
--    읽기는 로그인 유저 전원, 쓰기는 service_role만 (서버 액션이 대신 기록한다).
create table if not exists public.symbol_map (
  symbol      text primary key,
  name        text,
  asset_class text not null check (
    asset_class in ('kr_equity', 'intl_equity', 'bond', 'commodity',
                    'currency', 'cash', 'other')
  ),
  is_etf      boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.symbol_map enable row level security;

create policy "symbol_map_read" on public.symbol_map
  for select to authenticated using (true);

-- 4) 현재 보유 종목 초기 분류
insert into public.symbol_map (symbol, name, asset_class, is_etf, note) values
  ('086790', '하나금융지주',                     'kr_equity',   false, null),
  ('105560', 'KB금융',                           'kr_equity',   false, null),
  ('132030', 'KODEX 골드선물(H)',                'commodity',   true,  '금 선물, 환헤지'),
  ('153130', 'KODEX 단기채권',                   'bond',        true,  '국내 단기채'),
  ('261240', 'KODEX 미국달러선물',               'currency',    true,  '달러 노출'),
  ('304660', 'KODEX 미국30년국채울트라선물(H)',  'bond',        true,  '미국 장기채, 환헤지'),
  ('360750', 'TIGER 미국S&P500',                 'intl_equity', true,  '미국 대형주 지수'),
  ('466930', 'SOL 자동차TOP3플러스',             'kr_equity',   true,  '국내 섹터'),
  ('KRW-CASH', '예수금',                          'cash',        false, null)
on conflict (symbol) do nothing;
