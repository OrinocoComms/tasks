# Setting up the app

Do this once, in order. Everything is in the Supabase dashboard; no command line needed.
The app uses the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` settings that are already in Vercel.

## 1. Create the tables
Supabase → **SQL Editor** → **New query** → paste all of `supabase/01-schema.sql` → **Run**.
Nothing existing is deleted.

## 2. Add the voice helper (shortens what you say to a 5-word title)
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via editor**.
2. Name it exactly `condense`.
3. Replace the sample code with everything in `supabase/functions/condense/index.ts` → **Deploy**.
4. Edge Functions → **Secrets** → add `ANTHROPIC_API_KEY` with your Claude Console key as the value.

If this isn't set up, voice still works: the title just uses the first five words.

## 3. Sign in
Open the app → **First time? Create an account**. If it asks you to confirm by email, click the link, then sign in.
Your eight areas of focus are created automatically.

## 4. Optional: bring your old tasks across
Supabase → SQL Editor → paste `supabase/02-import-old-tasks.sql` → **Run**. They appear in **Unallocated**.

## 5. Lock it to you
Supabase → **Authentication** → **Sign In / Providers** → turn off **Allow new users to sign up**.

## Notes
- Add `?demo` to the address to try the app with sample data that only lives in that browser.
- Install it on your phone: Safari → Share → **Add to Home Screen** (iPhone), or Chrome → **Install app** (Android/desktop).
- The daily limit (1 hour by default) can be changed under the third tab.
