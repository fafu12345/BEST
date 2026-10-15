begin;
-- Additive only: leave addresses, financial values, history and existing RLS untouched.
alter table public.properties
 add column bathroom_count integer check (bathroom_count between 0 and 100),
 add column desired_transaction_date date,
 add column desired_transaction_note text not null default '' check (length(desired_transaction_note)<=500);
comment on column public.properties.desired_transaction_date is '거래 희망 날짜. 미정 또는 협의 중이면 NULL; 계약의 잔금일과는 별도.';
comment on column public.properties.bathroom_count is '아파트·오피스텔 화장실 수. 기존 데이터는 미입력(NULL).';
commit;
