create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer unique,
  name text not null,
  slug text not null unique,
  brand text not null,
  category text not null,
  subcategory text,
  description text not null default '',
  image_url text,
  badge text,
  is_active boolean not null default true,
  is_bestseller boolean not null default false,
  is_offer boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  size_value numeric,
  size_unit text,
  price numeric(12,2) not null check (price >= 0),
  old_price numeric(12,2) check (old_price is null or old_price >= price),
  stock integer not null default 0 check (stock >= 0),
  sku text unique,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  delivery_fee numeric(12,2) not null default 65,
  free_delivery_from numeric(12,2),
  instapay_name text,
  instapay_address text,
  vodafone_cash_number text,
  payment_note text,
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('CC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  tracking_token uuid not null default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  email text not null,
  address text not null,
  city text not null,
  area text not null,
  notes text,
  payment_method text not null check (payment_method in ('instapay','vodafone','cod')),
  payment_proof_path text,
  subtotal numeric(12,2) not null,
  delivery_fee numeric(12,2) not null,
  total numeric(12,2) generated always as (subtotal + delivery_fee) stored,
  status text not null default 'confirmed' check (status in ('confirmed','preparing','out_for_delivery','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_label text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Public reads active products" on public.products;
drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Public reads variants" on public.product_variants;
drop policy if exists "Admins manage variants" on public.product_variants;
drop policy if exists "Public reads store settings" on public.store_settings;
drop policy if exists "Admins manage settings" on public.store_settings;
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Admins read order items" on public.order_items;

create policy "Public reads active products" on public.products for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads variants" on public.product_variants for select to anon, authenticated using (exists(select 1 from public.products p where p.id=product_id and (p.is_active or public.is_admin())));
create policy "Admins manage variants" on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public reads store settings" on public.store_settings for select to anon, authenticated using (true);
create policy "Admins manage settings" on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins read orders" on public.orders for select to authenticated using (public.is_admin());
create policy "Admins update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins read order items" on public.order_items for select to authenticated using (public.is_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png'])
on conflict(id) do nothing;

drop policy if exists "Anyone uploads payment proof" on storage.objects;
drop policy if exists "Admins read payment proofs" on storage.objects;

create policy "Anyone uploads payment proof" on storage.objects for insert to anon, authenticated
with check (bucket_id='payment-proofs' and (storage.foldername(name))[1]='incoming');
create policy "Admins read payment proofs" on storage.objects for select to authenticated
using (bucket_id='payment-proofs' and public.is_admin());

grant select on public.products, public.product_variants, public.store_settings to anon, authenticated;
grant insert, update, delete on public.products, public.product_variants to authenticated;
grant update on public.store_settings to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.place_order(
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_payment_proof_path text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  new_order public.orders;
  line jsonb;
  variant public.product_variants;
  product public.products;
  calculated_subtotal numeric(12,2) := 0;
  shipping numeric(12,2);
begin
  if p_payment_method not in ('instapay','vodafone','cod') then raise exception 'Invalid payment method'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  select delivery_fee into shipping from public.store_settings where id=1;
  for line in select * from jsonb_array_elements(p_items) loop
    select * into variant from public.product_variants where id=(line->>'variant_id')::uuid and stock >= (line->>'quantity')::integer;
    if variant.id is null then raise exception 'A selected size is unavailable'; end if;
    calculated_subtotal := calculated_subtotal + variant.price * (line->>'quantity')::integer;
  end loop;
  insert into public.orders(customer_name,phone,email,address,city,area,notes,payment_method,payment_proof_path,subtotal,delivery_fee)
  values (p_customer->>'name',p_customer->>'phone',p_customer->>'email',p_customer->>'address',p_customer->>'city',p_customer->>'area',p_customer->>'notes',p_payment_method,p_payment_proof_path,calculated_subtotal,shipping)
  returning * into new_order;
  for line in select * from jsonb_array_elements(p_items) loop
    select * into variant from public.product_variants where id=(line->>'variant_id')::uuid;
    select * into product from public.products where id=variant.product_id;
    insert into public.order_items(order_id,product_id,variant_id,product_name,variant_label,quantity,unit_price)
    values(new_order.id,product.id,variant.id,product.name,variant.label,(line->>'quantity')::integer,variant.price);
    update public.product_variants set stock=stock-(line->>'quantity')::integer where id=variant.id;
  end loop;
  return jsonb_build_object('number',new_order.order_number,'tracking_token',new_order.tracking_token,'total',new_order.total,'status',new_order.status,'created_at',new_order.created_at);
end $$;

create or replace function public.track_order(p_order_number text, p_phone text, p_tracking_token uuid default null)
returns jsonb language sql security definer set search_path=public
as $$ select jsonb_build_object('number',o.order_number,'total',o.total,'status',o.status,'created_at',o.created_at,'payment_method',o.payment_method)
from public.orders o where o.order_number=p_order_number and o.phone=p_phone and (p_tracking_token is null or o.tracking_token=p_tracking_token) limit 1 $$;

grant execute on function public.place_order(jsonb,jsonb,text,text) to anon, authenticated;
grant execute on function public.track_order(text,text,uuid) to anon, authenticated;
