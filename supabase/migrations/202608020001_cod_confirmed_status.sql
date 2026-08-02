alter table public.orders
  drop constraint if exists orders_status_check;

update public.orders
set status = 'confirmed', updated_at = now()
where status = 'checking'
  and payment_method = 'cod';

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'checking',
      'confirmed',
      'preparing',
      'on_hold',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

create or replace function public.set_initial_order_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := case
    when new.payment_method = 'cod' then 'confirmed'
    else 'checking'
  end;
  return new;
end;
$$;

drop trigger if exists set_initial_order_status_on_insert
on public.orders;

create trigger set_initial_order_status_on_insert
before insert on public.orders
for each row
execute function public.set_initial_order_status();

notify pgrst, 'reload schema';
