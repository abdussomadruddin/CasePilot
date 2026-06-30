# Case Operation System

A Next.js, TypeScript, Tailwind CSS, and Supabase web app for managing Honda car buying cases from document collection through delivery.

## What is included

- Role-based dashboard for admin, customer service, finance, caller, operator, and read-only Sales Manager.
- Case creation and editing with dealer, customer, car, document, bank, status, and remark fields.
- Tabs for All Cases, My Tasks, Need Attention, Follow Up Due, and Completed.
- Full case cards showing status, assigned team, latest remark, latest update, next follow-up, documents, banks, and activity timeline.
- WhatsApp composer for team members and bankers with selectable document links.
- Supabase database schema, authentication profile model, storage bucket setup, live push notification workers, and 45-day document cleanup worker.
- PWA support for web, iOS, and Android device alerts after notification permission is enabled.

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
4. Add a row in `profiles` for each user with `full_name`, `phone`, and one of these roles:
   - `admin`
   - `customer_service`
   - `finance`
   - `caller`
   - `operator`
   - `sales_manager`
5. Copy `.env.example` to `.env.local` and fill in the project URL, anon key, and VAPID public key.
6. Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
7. Deploy `supabase/functions/send-push-notifications` for live status-change alerts.
8. Deploy `supabase/functions/case-notifications` as a scheduled function for 6-hour reminders and 2-day follow-up alerts.
9. Deploy `supabase/functions/cleanup-case-documents` as a daily scheduled function to auto-delete document files after 45 days.

The app is Supabase-only. The included public Supabase project config keeps the app connected for local preview, and `.env.local` can override it for another project.

## Document retention

Each uploaded document gets an `expires_at` value 45 days after upload. The cleanup function deletes expired files from the `case-documents` storage bucket, marks the document row as deleted, and adds an activity timeline note to the case. Case details, bank details, remarks, statuses, and timeline records are not deleted.
