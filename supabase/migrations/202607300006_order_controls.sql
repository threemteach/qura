alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'confirmed',
      'preparing',
      'on_hold',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

create or replace function public.cancel_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  line public.order_items;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select status
  into current_status
  from public.orders
  where id = p_order_id
  for update;

  if current_status is null then
    raise exception 'Order not found';
  end if;

  if current_status = 'cancelled' then
    return true;
  end if;

  if current_status = 'delivered' then
    raise exception 'Delivered orders cannot be cancelled';
  end if;

  for line in
    select *
    from public.order_items
    where order_id = p_order_id
  loop
    if line.variant_id is not null then
      update public.product_variants
      set stock = stock + line.quantity
      where id = line.variant_id;
    end if;
  end loop;

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  return true;
end
$$;

grant execute
on function public.cancel_order(uuid)
to authenticated;
