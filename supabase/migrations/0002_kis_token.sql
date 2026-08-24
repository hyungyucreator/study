-- 0002_kis_token.sql
-- KIS 접근토큰 캐시 (ARCHITECTURE.md §7: 발급 후 캐시, 매 요청 재발급 금지).
-- KIS는 토큰 재발급을 1분 1회로 제한하고 유효기간은 24시간이다.
-- 서버리스에서는 인스턴스 메모리가 유지되지 않으므로 DB에 둔다.
--
-- 보안: 이 토큰은 주문 API까지 호출할 수 있는 자격증명이다.
-- RLS를 켜되 정책을 하나도 만들지 않는다 -> 로그인 유저의 anon 세션으로는 읽을 수 없고,
-- RLS를 우회하는 service_role(서버 전용)만 접근한다.

create table if not exists public.kis_token (
  id           text primary key default 'default',
  access_token text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

alter table public.kis_token enable row level security;

revoke all on public.kis_token from anon, authenticated;
