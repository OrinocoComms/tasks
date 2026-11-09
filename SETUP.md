# Little steps: setup

One-off setup. You need to do it once, in this order. Everything is in the Supabase dashboard; no command line needed.

## 1. Create the new tables
Supabase → **SQL Editor** → New query → paste all of `supabase/01-schema.sql` → **Run**.
Your old tasks table is renamed `tasks_legacy`, not deleted.

## 2. Add the AI breakdown helper
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via editor**.
2. Name it exactly `breakdown`.
3. Replace the sample code with everything in `supabase/functions/breakdown/index.ts` → **Deploy**.
4. Edge Functions → **Secrets** → add a secret named `ANTHROPIC_API_KEY` with your new key as the value.

## 3. Sign in and bring your old tasks across
1. Open the app and choose **Create an account**. If it asks you to confirm by email, click the link in the email, then come back and sign in.
2. Then Supabase → SQL Editor → paste `supabase/02-import-old-tasks.sql` → **Run**. Your open tasks appear in a **To sort** zone.
3. Optional but recommended: Supabase → **Authentication** → **Sign In / Providers** → turn off **Allow new users to sign up**, so nobody else can make an account.

## Notes
- The app uses the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` settings already in Vercel.
- Add `?demo` to the address to try it with sample data that only lives in that browser.
- Install it: on iPhone, Safari → Share → **Add to Home Screen**. On desktop Chrome, use the install icon in the address bar.
