create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_product_id uuid not null references public.products(id) on delete cascade,
  component_variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(bundle_product_id, component_variant_id)
);

alter table public.product_bundle_items enable row level security;

drop policy if exists "Public reads active bundle items" on public.product_bundle_items;
drop policy if exists "Admins manage bundle items" on public.product_bundle_items;
create policy "Public reads active bundle items" on public.product_bundle_items
  for select to anon, authenticated
  using (exists(select 1 from public.products p where p.id=bundle_product_id and (p.is_active or public.is_admin())));
create policy "Admins manage bundle items" on public.product_bundle_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.product_bundle_items to anon, authenticated;
grant insert, update, delete on public.product_bundle_items to authenticated;

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
  selected_variant public.product_variants;
  selected_product public.products;
  bundle_line public.product_bundle_items;
  component_variant public.product_variants;
  calculated_subtotal numeric(12,2) := 0;
  shipping numeric(12,2) := 0;
  requested_quantity integer;
begin
  if p_payment_method not in ('instapay','vodafone','cod') then raise exception 'Invalid payment method'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;

  for line in select * from jsonb_array_elements(p_items) loop
    requested_quantity := (line ->> 'quantity')::integer;
    if requested_quantity <= 0 then raise exception 'Invalid quantity'; end if;
    select * into selected_variant from public.product_variants where id=(line ->> 'variant_id')::uuid;
    if selected_variant.id is null then raise exception 'A selected size is unavailable'; end if;
    calculated_subtotal := calculated_subtotal + selected_variant.price * requested_quantity;
  end loop;

  select case
    when coalesce(s.free_delivery_from,0)>0 and calculated_subtotal>=s.free_delivery_from then 0
    else coalesce((select (rate->>'fee')::numeric from jsonb_array_elements(coalesce(s.delivery_rates,'[]'::jsonb)) rate where lower(rate->>'governorate')=lower(p_customer->>'city') limit 1),s.delivery_fee)
  end into shipping from public.store_settings s where s.id=1;

  insert into public.orders(customer_name,phone,email,address,city,area,notes,payment_method,payment_proof_path,subtotal,delivery_fee)
  values(p_customer->>'name',p_customer->>'phone',p_customer->>'email',p_customer->>'address',p_customer->>'city',p_customer->>'area',p_customer->>'notes',p_payment_method,p_payment_proof_path,calculated_subtotal,shipping)
  returning * into new_order;

  for line in select * from jsonb_array_elements(p_items) loop
    requested_quantity := (line ->> 'quantity')::integer;
    selected_variant := null;
    update public.product_variants set stock=stock-requested_quantity
    where id=(line->>'variant_id')::uuid and stock>=requested_quantity returning * into selected_variant;
    if selected_variant.id is null then raise exception 'A selected size is unavailable'; end if;
    select * into selected_product from public.products where id=selected_variant.product_id;

    insert into public.order_items(order_id,product_id,variant_id,product_name,variant_label,quantity,unit_price)
    values(new_order.id,selected_product.id,selected_variant.id,selected_product.name,selected_variant.label,requested_quantity,selected_variant.price);

    if selected_product.badge='PACKAGE' then
      if not exists(select 1 from public.product_bundle_items where bundle_product_id=selected_product.id) then
        raise exception 'This package has no products';
      end if;
      for bundle_line in select * from public.product_bundle_items where bundle_product_id=selected_product.id loop
        component_variant := null;
        update public.product_variants set stock=stock-(bundle_line.quantity*requested_quantity)
        where id=bundle_line.component_variant_id and stock>=(bundle_line.quantity*requested_quantity)
        returning * into component_variant;
        if component_variant.id is null then raise exception 'A product inside this package is unavailable'; end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('number',new_order.order_number,'tracking_token',new_order.tracking_token,'total',new_order.total,'status',new_order.status,'created_at',new_order.created_at);
end $$;

create or replace function public.cancel_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare
  current_status text;
  order_line public.order_items;
  ordered_product public.products;
  bundle_line public.product_bundle_items;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  select status into current_status from public.orders where id=p_order_id for update;
  if current_status is null then raise exception 'Order not found'; end if;
  if current_status='cancelled' then return true; end if;
  if current_status='delivered' then raise exception 'Delivered orders cannot be cancelled'; end if;
  for order_line in select * from public.order_items where order_id=p_order_id loop
    update public.product_variants set stock=stock+order_line.quantity where id=order_line.variant_id;
    select * into ordered_product from public.products where id=order_line.product_id;
    if ordered_product.badge='PACKAGE' then
      for bundle_line in select * from public.product_bundle_items where bundle_product_id=ordered_product.id loop
        update public.product_variants set stock=stock+(bundle_line.quantity*order_line.quantity) where id=bundle_line.component_variant_id;
      end loop;
    end if;
  end loop;
  update public.orders set status='cancelled',updated_at=now() where id=p_order_id;
  return true;
end $$;

grant execute on function public.place_order(jsonb,jsonb,text,text) to anon,authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
notify pgrst, 'reload schema';
