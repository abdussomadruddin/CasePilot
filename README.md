# Honda Case Operation System

A Next.js, TypeScript, Tailwind CSS, and Supabase web app for managing Honda car buying cases from document collection through delivery.

## What is included

- Role-based dashboard for admin, customer service, finance, caller, and operator.
- Case creation and editing with customer, car, document, bank, status, and remark fields.
- Tabs for All Cases, My Tasks, Need Attention, Follow Up Due, and Completed.
- Full case cards showing status, assigned team, latest remark, latest update, next follow-up, documents, banks, and activity timeline.
- Supabase-ready database schema, authentication profile model, storage bucket setup, and notification worker template.
- Demo mode when Supabase environment variables are not present.

## Local setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create app users in Supabase Auth.
4. Add a row in `profiles` for each user with one of these roles:
   - `admin`
   - `customer_service`
   - `finance`
   - `caller`
   - `operator`
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
6. Deploy `supabase/functions/case-notifications` as a scheduled function if you want automatic reminder rows to be created.

The app will use demo data until `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured.
