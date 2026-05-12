---
name: supabase
version: 0.1.0
category: db
description: Supabase backend (Postgres + Auth + Storage + Edge Functions + Realtime)
homepage: https://supabase.com/docs
tags: [database, auth, storage, postgres, realtime, edge-functions]
applies_to:
  - querying or mutating the database via PostgREST
  - user authentication (email/password, magic link, OAuth)
  - file storage (avatars, generated assets, R2-alternative)
  - realtime subscriptions
  - deploying or invoking Edge Functions
  - any task using `supabase` CLI
trove_spec: "0.1"
last_verified: "pending — module is API-shape but actual usage is supabase-mcp. Awaiting MCP-shape rewrite"

credentials:
  SUPABASE_URL:
    type: url
    required: true
    help: "Project Settings → API → Project URL. Format: https://<ref>.supabase.co"
  SUPABASE_ANON_KEY:
    type: password
    required: true
    help: "Project Settings → API → anon public. Safe for browser/client. RLS enforces access."
  SUPABASE_SERVICE_ROLE_KEY:
    type: password
    required: false
    help: "Project Settings → API → service_role. SERVER ONLY. Bypasses ALL RLS. Never ship to browser."
  SUPABASE_PROJECT_REF:
    type: text
    required: false
    help: "Same as the <ref> in URL. Required for `supabase link` / migrations / DB password operations."
  SUPABASE_DB_PASSWORD:
    type: password
    required: false
    help: "Project Settings → Database. Required for `supabase db push` / direct psql."

mcp:
  command: npx
  args: ["-y", "@supabase/mcp-server-supabase@latest", "--access-token=${credential.SUPABASE_SERVICE_ROLE_KEY}"]
---

# Supabase Usage Guide

## ⚠️ Critical Constraints (read first)

1. **`anon` vs `service_role` key is a security boundary, not just a permission level**
   - `anon` is shipped to browsers; RLS policies enforce who can see what
   - `service_role` bypasses **ALL** RLS, period. Server-side only. **Never** put in env that ships to client (Next.js: `NEXT_PUBLIC_*` is forbidden for service_role)
   - Symptoms of accidentally leaking service_role: writes succeed where they shouldn't, RLS tests pass but prod data is open
2. **RLS is opt-in per table** — newly created tables have NO RLS by default. Either run `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` immediately, or your `anon` key reads everything
3. **PostgREST select syntax**: `?select=col1,col2,relation(*)` not SQL JOIN. Embedding via FK names. Bad guesses fail silently with empty results
4. **Storage paths are bucket-scoped**: `bucket-name/folder/file.png`. Storage policies on the bucket level
5. **Realtime needs RLS-aware policies on `realtime.messages`** — broadcasting from server bypasses, but client-initiated subscribe respects RLS
6. **Auth `signUp` returns `{user, session}` — session may be `null`** if email confirmation is on. Don't assume logged-in after signUp

---

## Client setup

```typescript
import { createClient } from '@supabase/supabase-js';

// Browser / client-side (uses anon key, RLS enforced)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Server-side admin (service_role, bypasses RLS — be very careful)
const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

---

## Database (PostgREST)

```typescript
// SELECT with embedded relation
const { data, error } = await supabase
  .from('posts')
  .select('id, title, author:profiles(name, avatar_url)')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .limit(20);

// INSERT
const { data, error } = await supabase
  .from('posts')
  .insert({ title: 'hi', body: '...' })
  .select()    // ← required to get inserted row back
  .single();

// UPDATE with condition
await supabase.from('posts').update({ published: true }).eq('id', postId);

// DELETE
await supabase.from('posts').delete().eq('id', postId);

// RPC (Postgres function)
const { data } = await supabase.rpc('my_function', { arg1: 'value' });
```

**Common gotchas**:
- `.single()` throws if 0 or >1 rows. Use `.maybeSingle()` for "0-or-1" semantics
- `error` doesn't throw — always check it
- `.update()` without `.eq()` updates ALL rows (RLS may save you, but don't rely on it)

---

## Auth

```typescript
// Email + password
await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });

// Magic link
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://app.com/callback' } });

// OAuth (Google, GitHub, etc.)
await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: 'https://app.com/callback' } });

// Read current session
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;

// Sign out
await supabase.auth.signOut();
```

**Server-side session**: Next.js / Remix etc. need `@supabase/ssr` package — middleware reads cookies, refreshes token. Don't use `@supabase/supabase-js` directly in server components.

---

## Storage

```typescript
// Upload
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, fileBlob, {
    cacheControl: '3600',
    upsert: true,             // overwrite if exists
  });

// Public URL (only if bucket is public)
const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl('user1/avatar.png');

// Signed URL (private buckets, time-limited)
const { data: { signedUrl } } = await supabase.storage
  .from('private-files')
  .createSignedUrl('user1/document.pdf', 60);  // 60 seconds

// Delete
await supabase.storage.from('avatars').remove(['user1/avatar.png']);
```

**Storage RLS**: written as policies on the storage `objects` table, scoped via `bucket_id`. See dash → Storage → Policies.

---

## Realtime

```typescript
// Subscribe to row changes (RLS-respecting from client)
const channel = supabase
  .channel('posts-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'posts', filter: `author_id=eq.${userId}` },
    (payload) => console.log('change:', payload),
  )
  .subscribe();

// Cleanup
await supabase.removeChannel(channel);
```

**Postgres Changes requires `ALTER PUBLICATION supabase_realtime ADD TABLE posts;`** — easy to forget when adding new tables.

---

## Edge Functions

```bash
# Local dev
supabase functions serve hello-world

# Deploy
supabase functions deploy hello-world

# Invoke from client
const { data } = await supabase.functions.invoke('hello-world', {
  body: { name: 'world' },
});
```

Edge Functions run on Deno. Import via `import { ... } from 'npm:package'`. Common dependency mismatch trap with frontend.

---

## CLI essentials

```bash
supabase login                                  # one-time, opens browser
supabase link --project-ref $SUPABASE_PROJECT_REF  # link local to remote
supabase db pull                                # pull remote schema → local migration
supabase db push                                # push local migrations → remote
supabase gen types typescript --linked > database.types.ts  # generate TS types from schema
supabase functions deploy <name>
```

---

## Pricing pitfalls

- **Free tier database is paused after 7 days inactivity** — first request after wakes it (~30s cold start). Bad for cron-driven low-traffic apps
- **Egress is metered**: large media served via Supabase Storage adds up. Consider CDN in front (or use Cloudflare R2 for hot files)
- **Realtime concurrent connections** has tier limits — chat apps with many idle clients hit free-tier ceiling fast
- **Auth MAU** counted, not total users — inactive users don't bill

---

## Error code reference

| Code / Message | Meaning | Fix |
|---|---|---|
| `PGRST116` | row not found via `.single()` | use `.maybeSingle()` or check filter |
| `42501` | RLS violation | check policies, may need service_role for the op |
| `23505` | unique violation | upsert or handle conflict |
| `Auth session missing` | no logged-in user | sign in first; for SSR use `@supabase/ssr` |
| `JWT expired` | session token old | client should auto-refresh; if not, `getSession()` to refresh |
| `Bucket not found` | typo or bucket private+no policy | check name, check policies |
