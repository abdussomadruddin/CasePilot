# Case Operation System

A Next.js, TypeScript, Tailwind CSS, and Supabase web app for managing Honda car buying cases from document collection through delivery.

## What is included

- Role-based dashboard for admin, customer service, finance, caller, operator, and read-only Sales Manager.
- Case creation and editing with dealer, customer, car, document, bank, status, and remark fields.
- Tabs for All Cases, My Tasks, Need Attention, Follow Up Due, and Completed.
- Full case cards showing status, assigned team, latest remark, latest update, next follow-up, documents, banks, and activity timeline.
- WhatsApp composer for team members and bankers with selectable document links.
- Supabase database schema, authentication profile model, Google Drive document upload, live push notification workers, and 60-day document cleanup worker.
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
5. Copy `.env.example` to `.env.local` and fill in the project URL, anon key, VAPID public key, and Google Drive credentials.
6. Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and the same Google Drive credentials used by the app.
7. Deploy `supabase/functions/send-push-notifications` for live status-change alerts.
8. Deploy `supabase/functions/case-notifications` for grouped day-three follow-up alerts at 8:00 AM Kuala Lumpur time.
9. Deploy `supabase/functions/cleanup-case-documents` as a daily scheduled function to auto-delete Google Drive case folders after 60 days.

Supabase handles database/auth while Google Drive handles document storage. The included public Supabase project config keeps the app connected for local preview, and `.env.local` can override it for another project.

## Google Drive Documents

Uploaded documents go into one Google Drive folder per case under `GOOGLE_DRIVE_PARENT_FOLDER_ID`. The app stores the Drive file links in Supabase so download buttons and WhatsApp templates use Drive links directly.

Each uploaded document gets an `expires_at` value 60 days after upload. The cleanup function deletes the whole Google Drive case folder once every active document in that folder has expired, marks the document rows as deleted, and adds activity timeline notes to the case. Case details, bank details, remarks, statuses, and timeline records are not deleted.
