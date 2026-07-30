drop policy if exists "Admins delete orders" on public.orders;
create policy "Admins delete orders"
on public.orders for delete
to authenticated
using (public.is_admin());

grant delete on public.orders to authenticated;

drop policy if exists "Admins delete payment proofs" on storage.objects;
create policy "Admins delete payment proofs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'payment-proofs'
  and public.is_admin()
);

create or replace function public.track_orders(
  p_query text,
  p_tracking_token uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'number', o.order_number,
        'total', o.total,
        'status', o.status,
        'created_at', o.created_at,
        'payment_method', o.payment_method
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  from public.orders o
  where (
    upper(o.order_number) = upper(trim(p_query))
    or o.phone = regexp_replace(p_query, '\D', '', 'g')
  )
  and (
    p_tracking_token is null
    or o.tracking_token = p_tracking_token
  )
$$;

grant execute
on function public.track_orders(text, uuid)
to anon, authenticated;
