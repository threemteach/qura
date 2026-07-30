alter table public.store_settings
  add column if not exists delivery_rates jsonb not null default '[]'::jsonb;

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
  if p_payment_method not in ('instapay','vodafone','cod') then
    raise exception 'Invalid payment method';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  select coalesce(
    (
      select (rate ->> 'fee')::numeric
      from jsonb_array_elements(coalesce(s.delivery_rates, '[]'::jsonb)) rate
      where lower(rate ->> 'governorate') = lower(p_customer ->> 'city')
      limit 1
    ),
    s.delivery_fee
  )
  into shipping
  from public.store_settings s
  where s.id = 1;

  for line in select * from jsonb_array_elements(p_items) loop
    select * into variant
    from public.product_variants
    where id = (line ->> 'variant_id')::uuid
      and (stock = 0 or stock >= (line ->> 'quantity')::integer);

    if variant.id is null then
      raise exception 'A selected size is unavailable';
    end if;

    calculated_subtotal := calculated_subtotal
      + variant.price * (line ->> 'quantity')::integer;
  end loop;

  insert into public.orders(
    customer_name, phone, email, address, city, area, notes,
    payment_method, payment_proof_path, subtotal, delivery_fee
  )
  values (
    p_customer ->> 'name',
    p_customer ->> 'phone',
    p_customer ->> 'email',
    p_customer ->> 'address',
    p_customer ->> 'city',
    p_customer ->> 'area',
    p_customer ->> 'notes',
    p_payment_method,
    p_payment_proof_path,
    calculated_subtotal,
    shipping
  )
  returning * into new_order;

  for line in select * from jsonb_array_elements(p_items) loop
    select * into variant
    from public.product_variants
    where id = (line ->> 'variant_id')::uuid;

    select * into product
    from public.products
    where id = variant.product_id;

    insert into public.order_items(
      order_id, product_id, variant_id, product_name,
      variant_label, quantity, unit_price
    )
    values (
      new_order.id, product.id, variant.id, product.name, variant.label,
      (line ->> 'quantity')::integer, variant.price
    );

    update public.product_variants
    set stock = case
      when stock = 0 then 0
      else stock - (line ->> 'quantity')::integer
    end
    where id = variant.id;
  end loop;

  return jsonb_build_object(
    'number', new_order.order_number,
    'tracking_token', new_order.tracking_token,
    'total', new_order.total,
    'status', new_order.status,
    'created_at', new_order.created_at
  );
end $$;
