alter table public.orders
  drop constraint if exists orders_status_check;

update public.orders
set status = 'checking', updated_at = now()
where status = 'confirmed';

alter table public.orders
  alter column status set default 'checking';

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'checking',
      'preparing',
      'on_hold',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

notify pgrst, 'reload schema';
