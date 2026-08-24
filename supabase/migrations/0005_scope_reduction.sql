-- 0005_scope_reduction.sql
-- 스코프 축소: 제품을 "학습 + 현황 트래킹"으로 재정의 (PRODUCT.md §1, §6).
--
-- 이유: 목표 비중·리밸런싱은 사용자가 스스로 목표를 정할 근거를 갖춘 뒤에야 의미가 있다.
--       그 전에 붙이면 제품이 제시한 숫자를 규칙처럼 따르게 되어
--       "판단은 사용자가"라는 1원칙을 형식만 지키고 실질은 어기게 된다.
--
-- 삭제하는 테이블은 아직 데이터가 없다. 되살릴 때는 0001_init.sql의 정의를 다시 쓰면 된다.

drop table if exists public.rebalance_orders;
drop table if exists public.target_weights;

-- bucket은 컬럼만 남기고 화면에서 뺀다. 기본값 core.
alter table public.holdings alter column bucket set default 'core';
update public.holdings set bucket = 'core' where bucket is null;
