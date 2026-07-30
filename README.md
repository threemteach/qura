# Cura Care

Responsive cosmetics storefront with a Supabase commerce backend and admin dashboard.

## Setup

1. Copy `.env.example` to `.env.local` and add the Supabase URL and publishable key.
2. Run `supabase/migrations/202607300001_commerce.sql` in the Supabase SQL Editor.
3. Create an Auth user for the store administrator.
4. In Supabase Auth, set that user's `app_metadata` to `{ "role": "admin" }`.
5. Add the same environment variables to the Vercel project.
6. Install packages with `pnpm install`, then run with `vercel dev`.

The publishable key is safe for browser-facing requests when RLS is enabled. Never expose a secret or service-role key.

## Pages

- `index.html` — storefront, category filters, sizes, cart, best sellers and offers
- `checkout.html` — delivery, InstaPay, Vodafone Cash, cash on delivery and proof upload
- `track-order.html` — customer order tracking
- `admin.html` — products, sizes and prices, best sellers, offers, orders and store settings

## Backend

The migration creates products, package variants, settings, orders and order items; payment-proof storage; RLS policies; secure order-placement and tracking functions. Until Supabase is configured or products are added, the storefront falls back to the catalogue in `assets/js/data.js`.
