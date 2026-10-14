create table if not exists public.marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 200),
  product_name text not null check (char_length(product_name) between 1 and 200),
  marketplace text not null check (marketplace in ('amazon', 'trendyol', 'hepsiburada', 'n11')),
  product_url text not null check (char_length(product_url) between 1 and 2048),
  price numeric(12, 2) not null check (price > 0),
  observed_at timestamptz not null default now(),
  constraint marketplace_offers_user_product_market_unique
    unique (user_id, product_key, marketplace)
);

create index if not exists marketplace_offers_user_observed_idx
  on public.marketplace_offers (user_id, observed_at desc);

alter table public.marketplace_offers enable row level security;
grant select, insert, update, delete on public.marketplace_offers to authenticated;

drop policy if exists "Users can read their own marketplace offers" on public.marketplace_offers;
create policy "Users can read their own marketplace offers"
  on public.marketplace_offers for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own marketplace offers" on public.marketplace_offers;
create policy "Users can add their own marketplace offers"
  on public.marketplace_offers for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own marketplace offers" on public.marketplace_offers;
create policy "Users can update their own marketplace offers"
  on public.marketplace_offers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own marketplace offers" on public.marketplace_offers;
create policy "Users can delete their own marketplace offers"
  on public.marketplace_offers for delete to authenticated
  using ((select auth.uid()) = user_id);
