/**
 * Trove Web UI (v0.2). Localhost dashboard for browsing installed modules
 * and editing credentials. No AI features in this layer — see docs/design-v0.2.md.
 */

import { Hono } from "hono";
import { html } from "hono/html";
import { serve } from "@hono/node-server";
import {
  getInstalledModule,
  getLibraryItem,
  installFromLibrary,
  listInstalledModules,
  listLibrary,
  readCredentialsMasked,
  writeCredentials,
} from "./modules";
import {
  credentialsBadgeOOB,
  credentialsForm,
  homePage,
  libraryItemPage,
  libraryPage,
  modulePage,
  notFoundPage,
} from "./views";

const QUICK_START = ["minimax", "cloudflare", "anthropic"];

const app = new Hono();
let PORT = 7821;

/**
 * Same-origin guard. The UI binds to 127.0.0.1 so external network traffic
 * can't reach it, but a malicious page in the user's browser could still try
 * to POST here. Refuse requests whose Origin doesn't match the server itself.
 */
app.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("origin");
  if (!origin) return next();
  const expected = `http://127.0.0.1:${PORT}`;
  const expectedLh = `http://localhost:${PORT}`;
  if (origin !== expected && origin !== expectedLh) {
    return c.text("origin not allowed", 403);
  }
  return next();
});

app.get("/", async (c) => {
  const modules = await listInstalledModules();
  let quickStart: Awaited<ReturnType<typeof listLibrary>> = [];
  if (modules.length === 0) {
    const library = await listLibrary();
    const byName = new Map(library.map((e) => [e.name, e]));
    quickStart = QUICK_START.map((n) => byName.get(n)).filter((m): m is NonNullable<typeof m> => !!m);
  }
  return c.html(await homePage(modules, quickStart));
});

app.get("/m/:name", async (c) => {
  const mod = await getInstalledModule(c.req.param("name"));
  if (!mod) return c.html(await notFoundPage(`No module named "${c.req.param("name")}" in ~/.trove/`), 404);
  const values = await readCredentialsMasked(mod);
  return c.html(await modulePage(mod, values));
});

app.get("/library", async (c) => {
  const [library, installed] = await Promise.all([listLibrary(), listInstalledModules()]);
  const installedNames = new Set(installed.map((m) => m.name));
  return c.html(await libraryPage(library, installedNames));
});

app.get("/library/:name", async (c) => {
  const item = await getLibraryItem(c.req.param("name"));
  if (!item) return c.html(await notFoundPage(`No library module named "${c.req.param("name")}"`), 404);
  const installed = await getInstalledModule(c.req.param("name"));
  return c.html(await libraryItemPage(item, !!installed));
});

app.patch("/api/m/:name/cred", async (c) => {
  const mod = await getInstalledModule(c.req.param("name"));
  if (!mod) return c.text("module not found", 404);
  const form = await c.req.parseBody();
  const submitted: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === "string") submitted[k] = v;
  }
  await writeCredentials(mod, submitted);
  const fresh = (await getInstalledModule(mod.name))!;
  const values = await readCredentialsMasked(fresh);
  // HTMX swaps the form in place; the OOB badge update refreshes the header
  // badge at the same time.
  return c.html(html`${credentialsForm(fresh, values)}${credentialsBadgeOOB(fresh)}`);
});

app.post("/api/install", async (c) => {
  const form = await c.req.parseBody();
  const name = typeof form.name === "string" ? form.name : "";
  if (!name) return c.text("name required", 400);
  await installFromLibrary(name);
  return c.redirect(`/m/${name}`);
});

app.notFound((c) => c.html(notFoundPage("Page not found"), 404));

export function startServer(opts: { port?: number } = {}): void {
  PORT = opts.port ?? Number(process.env.TROVE_UI_PORT ?? 7821);
  serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" });
  console.log(`Trove UI → http://127.0.0.1:${PORT}`);
}
