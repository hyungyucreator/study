-- 0004_bucket.sql
-- 계좌 성격(버킷) 구분.
--
-- 문제: PRODUCT §3은 사용자를 "ETF 중심 자산배분 + 소액 개별주 실험 계좌"로 정의하는데
--       holdings에 그 구분이 없어 실험용 개별주가 자산배분 비중에 섞였다.
--       그러면 (1) 코어 비중이 왜곡되고 (2) 리밸런싱 주문서가 실험 종목까지 건드린다.
-- 변경: bucket = core(코어 배분) | tilt(국면 표현용 틸트) | experiment(소액 실험)
--       목표 비중 계산은 core + tilt만 대상으로 한다. experiment는 별도 표시.
--
-- NULL은 "아직 정하지 않음"을 뜻한다. KIS에서 새로 들어온 종목은 NULL로 두고
-- 화면에서 최초 1회 물어본 뒤 symbol_map에 기억한다.

alter table public.holdings
  add column if not exists bucket text
  check (bucket is null or bucket in ('core', 'tilt', 'experiment'));

alter table public.symbol_map
  add column if not exists bucket text
  check (bucket is null or bucket in ('core', 'tilt', 'experiment'));

create index if not exists holdings_bucket_idx on public.holdings (user_id, bucket);

-- 예수금은 물어볼 필요가 없다. 현금은 코어 배분의 일부다.
update public.symbol_map set bucket = 'core' where symbol = 'KRW-CASH';
update public.holdings set bucket = 'core' where symbol = 'KRW-CASH' and bucket is null;
