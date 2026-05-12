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
last_verified: "2026-05-12 · hosted MCP registered via `claude mcp add --transport http supabase https://mcp.supabase.com/mcp --scope user`; OAuth flow reported successful by maintainer (tool list not independently inspected this session). ⚠ Registered WITHOUT `?project_ref=...&read_only=true` — current scope grants RW across the entire OAuth'd Supabase org, violating this module's own recommended safety profile. Fix pending. Edge Functions production-active in maintainer downstream project (`<project-ref>.supabase.co/functions/v1`, 401 without anon key confirms). PostgREST/auth/storage/realtime API path not smoke-tested this session"

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
    help: "The <ref> in your project URL (e.g. abcdwxyz123). Required for `supabase link` / migrations / Edge Function URLs / scoping MCP to one project."
  SUPABASE_DB_PASSWORD:
    type: password
    required: false
    help: "Project Settings → Database. Required for `supabase db push` / direct psql."

mcp:
  type: http
  url: "https://mcp.supabase.com/mcp?project_ref=${credential.SUPABASE_PROJECT_REF}&read_only=true"
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

Edge Functions run on Deno Deploy globally. Three invocation paths in practice:

```bash
# Local dev — runs at http://localhost:54321/functions/v1/<name>
supabase functions serve hello-world

# Deploy — global Deno Deploy rollout in seconds
supabase functions deploy hello-world --project-ref $SUPABASE_PROJECT_REF
```

**Invocation from client (typed SDK)**:
```typescript
const { data, error } = await supabase.functions.invoke('hello-world', {
  body: { name: 'world' },
});
```

**Invocation via raw HTTP** (any language, server-to-server, cron, webhooks):
```bash
curl -X POST "https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/hello-world" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"world"}'
```

URL shape: `https://<project-ref>.supabase.co/functions/v1/<fn-name>`. **Auth header is required** — even "public" Edge Functions need `Authorization: Bearer <anon-key>` (no header = 401). For truly public endpoints, set `--no-verify-jwt` at deploy time.

**Production gotchas**:
- **Deno-only imports**: `import { x } from 'npm:package'` works server-side but cannot share import maps with your frontend bundle — keep functions dependency-isolated
- **Cold start ~50-200ms**: edge functions sleep when idle; first invocation pays cold-start
- **`Deno.env.get()` not `process.env`**: Trying to use Node globals throws
- **`--no-verify-jwt` bypasses the auth header check** — leave it OFF unless you really want public unauthenticated calls (webhooks from external services)
- **Logs**: `supabase functions logs <name>` for recent invocations; longer retention in dashboard

---

## Supabase MCP (official hosted server)

Supabase ships an **official hosted MCP server** — no install, OAuth-on-first-use, scoped per project. This module's `mcp:` frontmatter resolves to:

```
https://mcp.supabase.com/mcp?project_ref=<your-ref>&read_only=true
```

Two important query params:

- **`project_ref=<ref>`** — restricts the MCP server to ONE project (not your whole org). Always set this unless you really want cross-project access
- **`read_only=true`** — runs all queries as a read-only Postgres role. **Strongly recommended default**: AI agents are prone to "delete everything" missteps. Drop this only for explicit one-shot write tasks, in test mode, with `--project-ref` scoped to a non-prod project

**Auth**: OAuth flow on first `tools/list` call. The agent (Claude Code, Cursor) opens a browser, you approve, the agent stores the token. **No PAT / no service_role in URL** — Supabase deliberately avoided that pattern.

**Don't connect to production**: official guidance. Use against a staging / branch project. The combination of `read_only=true` + non-prod `project_ref` is the safe profile.

**Self-hosted stdio variant** exists (`npx -y @supabase/mcp-server-supabase`) but the hosted HTTP form is officially recommended. The stdio form requires a Personal Access Token from https://supabase.com/dashboard/account/tokens — account-level, broader than service_role. Use the hosted form unless you have a specific reason (corporate proxy, offline dev).

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
