-- Общая база для вишлиста.
-- Выполни этот SQL в Supabase -> SQL Editor.

create table if not exists public.wishlist_products (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null default '',
  description text not null default '',
  image text not null default '',
  manual_store text not null default '',
  reserved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_wishlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wishlist_products_updated_at on public.wishlist_products;
create trigger wishlist_products_updated_at
before update on public.wishlist_products
for each row execute function public.set_wishlist_updated_at();

alter table public.wishlist_products enable row level security;

drop policy if exists "wishlist public read" on public.wishlist_products;
drop policy if exists "wishlist public insert" on public.wishlist_products;
drop policy if exists "wishlist public update" on public.wishlist_products;
drop policy if exists "wishlist public delete" on public.wishlist_products;

create policy "wishlist public read"
on public.wishlist_products for select
to anon, authenticated
using (true);

create policy "wishlist public insert"
on public.wishlist_products for insert
to anon, authenticated
with check (true);

create policy "wishlist public update"
on public.wishlist_products for update
to anon, authenticated
using (true)
with check (true);

create policy "wishlist public delete"
on public.wishlist_products for delete
to anon, authenticated
using (true);

-- Включаем таблицу в Supabase Realtime.
alter publication supabase_realtime add table public.wishlist_products;

-- Первоначальные товары из проекта.
insert into public.wishlist_products (url)
values
  ('https://ozon.by/t/9oSz2kd'),
  ('https://ozon.by/t/j7F5gzy'),
  ('https://ozon.by/t/ukiY9v9'),
  ('https://www.wildberries.by/catalog/1175385664/detail.aspx?size=1731541956'),
  ('https://oz.by/childrensbooks/more10251857.html'),
  ('https://www.wildberries.by/catalog/281711487/detail.aspx?size=432187138'),
  ('https://detmir.by/product/index/id/589041/'),
  ('https://detmir.by/product/index/id/3156059/'),
  ('https://detmir.by/product/index/id/6678670/'),
  ('https://detmir.by/product/index/id/6687521/'),
  ('https://detmir.by/product/index/id/3156071/')
on conflict (url) do nothing;
