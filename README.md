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

## AI Follow Up (Murpati + central OpenAI)

This feature is configured under **Account → AI Follow Up**. Only Admin can enter,
replace, or remove the central OpenAI and Murpati keys. Blank password fields retain
existing keys; successful saves clear the fields. Keys never return in API responses.

Before enabling the feature:

1. Apply migration `20261026055750_ai_follow_up.sql` to the intended Supabase project.
2. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and `AI_SETTINGS_ENCRYPTION_KEY`.
   The encryption key must be base64 encoding of 32 cryptographically random bytes.
   Keep it stable and backed up. Never use a `NEXT_PUBLIC_` variable for either secret.
3. Admin enters the OpenAI and Murpati keys in the app. The OpenAI model is
   `gpt-5-mini`; AI billing belongs to the Admin's OpenAI account. Murpati is read-only.
4. Check Murpati devices, then assign each regular device to its number's owner.
   Changing the Murpati key clears assignments so the new account must be reviewed.
   Official Cloud API devices are excluded because Murpati REST history does not
   support them. Users can choose only devices assigned to them; they cannot assign
   devices themselves. Each session has one owner.

Generation is explicit, with one request per user at a time and a default limit of
50 generation attempts per user per Malaysia calendar day (Admin can change 1–500).
The app reads the latest 100 messages within 30 days using an exact phone JID.
No conversation polling, media download, Murpati send, or Murpati queue calls occur.
The app stores action metadata and encrypted credentials only, never chat/draft text.
OpenAI calls use `store:false`; provider-level retention policies still apply.

Drafts expire after 15 minutes and are rechecked against recipient, receipt, Lead,
notes, Case, settings, assignment, device connection and conversation before handoff.
A successful handoff records **AI Follow Up — WhatsApp dibuka**, then opens a wa.me
link with prefilled text. Sending remains manual in WhatsApp. A username-only lead
uses notes and requires copying the draft before opening WhatsApp. Actual sending,
delivery and the active WhatsApp account on the user's device cannot be confirmed.

Run `pnpm test:ai-follow-up`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` before
release. Database tests use an isolated embedded PostgreSQL fixture, not production.
Do not send real customer messages for smoke tests. Migration application and a
production deployment are separate release steps.
