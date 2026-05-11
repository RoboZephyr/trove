/** @jsxImportSource hono/jsx */
import { html, raw } from "hono/html";
import { marked } from "marked";
import type { Module, CredentialField } from "./modules";

const QUICK_START = ["minimax", "cloudflare", "anthropic"];

function Layout(props: { title: string; active: "home" | "examples" | ""; children: unknown }) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${props.title} · Trove</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3"></script>
  <style>
    .prose pre { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-size: 0.85rem; }
    .prose code { font-family: ui-monospace, monospace; font-size: 0.85em; }
    .prose :not(pre) > code { background: #f1f5f9; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }
    .prose h1 { font-size: 1.6rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
    .prose h2 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
    .prose h3 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.5rem; }
    .prose p, .prose ul, .prose ol { margin: 0.5rem 0; line-height: 1.65; }
    .prose ul { list-style: disc; padding-left: 1.5rem; }
    .prose ol { list-style: decimal; padding-left: 1.5rem; }
    .prose a { color: #0369a1; text-decoration: underline; }
    .prose blockquote { border-left: 3px solid #cbd5e1; padding-left: 1rem; color: #475569; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
  <nav class="border-b border-slate-200 bg-white">
    <div class="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
      <a href="/" class="font-semibold text-lg">Trove</a>
      <a href="/" class="${props.active === "home" ? "text-slate-900 font-medium" : "text-slate-500 hover:text-slate-900"}">Modules</a>
      <a href="/examples" class="${props.active === "examples" ? "text-slate-900 font-medium" : "text-slate-500 hover:text-slate-900"}">Examples</a>
      <span class="ml-auto text-xs text-slate-400">localhost:7821 · v0.2</span>
    </div>
  </nav>
  <main class="max-w-6xl mx-auto px-6 py-8">
    ${props.children}
  </main>
</body>
</html>`;
}

const statusBadge: Record<Module["credentialsFilled"], { label: string; cls: string }> = {
  complete: { label: "credentials ✓", cls: "bg-emerald-100 text-emerald-700" },
  partial: { label: "credentials partial", cls: "bg-amber-100 text-amber-700" },
  missing: { label: "credentials missing", cls: "bg-rose-100 text-rose-700" },
  "n/a": { label: "no credentials", cls: "bg-slate-100 text-slate-600" },
};

function ModuleCard(props: { mod: Module; href: string }) {
  const fm = props.mod.frontmatter;
  const badge = statusBadge[props.mod.credentialsFilled];
  return html`
    <a href="${props.href}" class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm transition">
      <div class="flex items-start justify-between gap-2">
        <div class="font-medium text-slate-900">${fm.name ?? props.mod.name}</div>
        <span class="text-[11px] text-slate-400 font-mono">${fm.version ?? "–"}</span>
      </div>
      <div class="mt-1 text-sm text-slate-600 line-clamp-2">${fm.description ?? raw("&nbsp;")}</div>
      ${props.mod.source === "installed"
        ? html`<div class="mt-3"><span class="text-[11px] px-2 py-0.5 rounded ${badge.cls}">${badge.label}</span></div>`
        : ""}
      ${fm.applies_to && fm.applies_to.length > 0
        ? html`<div class="mt-3 flex flex-wrap gap-1">
            ${fm.applies_to.slice(0, 3).map(
              (tag) => html`<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">${tag}</span>`,
            )}
            ${fm.applies_to.length > 3 ? html`<span class="text-[11px] text-slate-400">+${fm.applies_to.length - 3}</span>` : ""}
          </div>`
        : ""}
    </a>`;
}

export function homePage(modules: Module[], quickStart: Module[]) {
  if (modules.length === 0) {
    return Layout({
      title: "Welcome",
      active: "home",
      children: html`
        <div class="text-center py-12 max-w-2xl mx-auto">
          <h1 class="text-2xl font-semibold">Welcome to Trove</h1>
          <p class="mt-3 text-slate-600">
            Your <code class="text-sm bg-slate-100 px-1.5 py-0.5 rounded">~/.trove/</code> is empty.
            Install a module to get started — or browse the full
            <a href="/examples" class="text-sky-700 underline">examples gallery</a>.
          </p>
          ${quickStart.length > 0
            ? html`
                <div class="mt-8 text-left">
                  <h2 class="text-sm font-medium text-slate-500 uppercase tracking-wide">Quick start</h2>
                  <div class="mt-3 grid sm:grid-cols-3 gap-3">
                    ${quickStart.map((m) => ModuleCard({ mod: m, href: `/examples/${m.name}` }))}
                  </div>
                </div>`
            : ""}
        </div>`,
    });
  }

  const byCategory = new Map<string, Module[]>();
  for (const m of modules) {
    const cat = m.frontmatter.category ?? "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));

  return Layout({
    title: "Modules",
    active: "home",
    children: html`
      <div class="flex items-baseline justify-between mb-6">
        <h1 class="text-xl font-semibold">Installed modules</h1>
        <span class="text-sm text-slate-500">${modules.length} module${modules.length === 1 ? "" : "s"} in ~/.trove/</span>
      </div>
      ${categories.map(
        ([cat, mods]) => html`
          <section class="mb-8">
            <h2 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">${cat}</h2>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              ${mods.map((m) => ModuleCard({ mod: m, href: `/m/${m.name}` }))}
            </div>
          </section>`,
      )}`,
  });
}

function chip(text: string) {
  return html`<span class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">${text}</span>`;
}

/**
 * Out-of-band badge fragment. Included alongside the credentials form response
 * so HTMX can swap the header badge at the same time as the form, without a
 * full page reload.
 */
export function credentialsBadgeOOB(mod: Module) {
  const badge = statusBadge[mod.credentialsFilled];
  return html`<span id="cred-badge" hx-swap-oob="true" class="text-xs px-2 py-1 rounded ${badge.cls}">${badge.label}</span>`;
}

export function credentialsForm(mod: Module, values: Record<string, string>) {
  const spec = mod.frontmatter.credentials ?? {};
  const keys = Object.keys(spec);
  if (keys.length === 0) {
    return html`<div id="cred-form" class="text-sm text-slate-500">This module has no credentials.</div>`;
  }
  return html`
    <form
      id="cred-form"
      hx-patch="/api/m/${mod.name}/cred"
      hx-swap="outerHTML"
      hx-target="#cred-form"
      class="space-y-4"
    >
      ${keys.map((key) => {
        const decl: CredentialField = spec[key] ?? {};
        const value = values[key] ?? "";
        const type = decl.type ?? "text";
        const id = `cred-${key}`;
        return html`
          <div>
            <label for="${id}" class="block text-sm font-medium text-slate-700">
              ${key}
              ${decl.required ? html`<span class="text-rose-600">*</span>` : ""}
            </label>
            ${renderField({ id, name: key, value, decl, type })}
            ${decl.help ? html`<p class="mt-1 text-xs text-slate-500">${decl.help}</p>` : ""}
          </div>`;
      })}
      <div class="flex items-center gap-3 pt-2">
        <button type="submit" class="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-700">
          Save credentials
        </button>
        <span class="text-xs text-slate-400">Password fields show <code>••••••••</code> if already set. Leave masked to keep, replace to change, clear to delete.</span>
      </div>
    </form>`;
}

function renderField(p: {
  id: string;
  name: string;
  value: string;
  decl: CredentialField;
  type: string;
}) {
  const base = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
  if (p.type === "select" && p.decl.options) {
    return html`
      <select id="${p.id}" name="${p.name}" class="${base}">
        ${p.decl.options.map(
          (opt) =>
            html`<option value="${opt}" ${opt === p.value ? "selected" : ""}>${opt}</option>`,
        )}
      </select>`;
  }
  if (p.type === "multiline") {
    return html`<textarea id="${p.id}" name="${p.name}" rows="3" class="${base} font-mono">${p.value}</textarea>`;
  }
  if (p.type === "boolean") {
    return html`
      <select id="${p.id}" name="${p.name}" class="${base}">
        <option value="true" ${p.value === "true" ? "selected" : ""}>true</option>
        <option value="false" ${p.value === "false" ? "selected" : ""}>false</option>
      </select>`;
  }
  const inputType = p.type === "password" ? "password" : p.type === "number" ? "number" : p.type === "url" ? "url" : "text";
  return html`<input id="${p.id}" name="${p.name}" type="${inputType}" value="${p.value}" class="${base}" autocomplete="off" />`;
}

export function modulePage(mod: Module, credValues: Record<string, string>) {
  const fm = mod.frontmatter;
  const badge = statusBadge[mod.credentialsFilled];
  const skillHtml = marked.parse(mod.body, { async: false }) as string;

  return Layout({
    title: mod.name,
    active: "home",
    children: html`
      <div class="mb-6">
        <a href="/" class="text-sm text-slate-500 hover:text-slate-900">← Modules</a>
      </div>

      <header class="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 class="text-2xl font-semibold">${fm.name ?? mod.name}</h1>
        <span class="text-xs text-slate-400 font-mono">${fm.version ?? ""}</span>
        ${fm.category ? chip(fm.category) : ""}
        <span id="cred-badge" class="text-xs px-2 py-1 rounded ${badge.cls}">${badge.label}</span>
        ${fm.homepage
          ? html`<a href="${fm.homepage}" target="_blank" rel="noopener" class="ml-auto text-sm text-sky-700 hover:underline">${fm.homepage} ↗</a>`
          : ""}
      </header>

      ${mod.parseError
        ? html`<div class="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Frontmatter parse warning: ${mod.parseError}
          </div>`
        : ""}

      ${fm.description ? html`<p class="text-slate-700 mb-6">${fm.description}</p>` : ""}

      ${fm.applies_to && fm.applies_to.length > 0
        ? html`
            <section class="mb-6">
              <h2 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Applies to</h2>
              <div class="flex flex-wrap gap-2">${fm.applies_to.map((t) => chip(t))}</div>
            </section>`
        : ""}

      <section class="mb-8">
        <h2 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Credentials</h2>
        <div class="rounded-lg border border-slate-200 bg-white p-5">
          ${credentialsForm(mod, credValues)}
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Skill</h2>
        <article class="prose max-w-none rounded-lg border border-slate-200 bg-white p-6">
          ${raw(skillHtml)}
        </article>
      </section>`,
  });
}

export function examplesPage(examples: Module[], installedNames: Set<string>) {
  return Layout({
    title: "Examples",
    active: "examples",
    children: html`
      <div class="flex items-baseline justify-between mb-6">
        <h1 class="text-xl font-semibold">Examples gallery</h1>
        <span class="text-sm text-slate-500">${examples.length} bundled example${examples.length === 1 ? "" : "s"}</span>
      </div>
      <p class="text-sm text-slate-600 mb-6 max-w-2xl">
        Bundled module templates shipped with this build. Install one to copy its
        <code class="text-xs bg-slate-100 px-1 rounded">module.md</code> into
        <code class="text-xs bg-slate-100 px-1 rounded">~/.trove/</code>.
        Credentials stay empty until you fill them.
      </p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${examples.map(
          (ex) => html`
            <div class="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
              <div class="flex items-start justify-between gap-2">
                <a href="/examples/${ex.name}" class="font-medium text-slate-900 hover:underline">${ex.frontmatter.name ?? ex.name}</a>
                <span class="text-[11px] text-slate-400 font-mono">${ex.frontmatter.version ?? "–"}</span>
              </div>
              <div class="mt-1 text-sm text-slate-600 line-clamp-2 flex-1">
                ${ex.frontmatter.description ?? raw("&nbsp;")}
              </div>
              <div class="mt-4 flex items-center gap-2">
                ${installedNames.has(ex.name)
                  ? html`<a href="/m/${ex.name}" class="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs">Installed — open</a>`
                  : html`
                      <form method="post" action="/api/install" class="inline">
                        <input type="hidden" name="name" value="${ex.name}" />
                        <button type="submit" class="px-2.5 py-1 rounded bg-slate-900 text-white text-xs hover:bg-slate-700">
                          Install
                        </button>
                      </form>
                      <a href="/examples/${ex.name}" class="text-xs text-slate-500 hover:underline">Preview</a>`}
              </div>
            </div>`,
        )}
      </div>`,
  });
}

export function examplePreviewPage(ex: Module, installed: boolean) {
  const fm = ex.frontmatter;
  const skillHtml = marked.parse(ex.body, { async: false }) as string;
  return Layout({
    title: `${ex.name} (example)`,
    active: "examples",
    children: html`
      <div class="mb-6">
        <a href="/examples" class="text-sm text-slate-500 hover:text-slate-900">← Examples</a>
      </div>
      <header class="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 class="text-2xl font-semibold">${fm.name ?? ex.name}</h1>
        <span class="text-xs text-slate-400 font-mono">${fm.version ?? ""}</span>
        ${fm.category ? chip(fm.category) : ""}
        <span class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">example (read-only)</span>
        <div class="ml-auto">
          ${installed
            ? html`<a href="/m/${ex.name}" class="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-sm">Installed — open</a>`
            : html`
                <form method="post" action="/api/install" class="inline">
                  <input type="hidden" name="name" value="${ex.name}" />
                  <button type="submit" class="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-700">
                    Install to ~/.trove/${ex.name}
                  </button>
                </form>`}
        </div>
      </header>
      ${fm.description ? html`<p class="text-slate-700 mb-6">${fm.description}</p>` : ""}
      ${fm.applies_to && fm.applies_to.length > 0
        ? html`
            <section class="mb-6">
              <h2 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Applies to</h2>
              <div class="flex flex-wrap gap-2">${fm.applies_to.map((t) => chip(t))}</div>
            </section>`
        : ""}
      <article class="prose max-w-none rounded-lg border border-slate-200 bg-white p-6">
        ${raw(skillHtml)}
      </article>`,
  });
}

export function notFoundPage(what: string) {
  return Layout({
    title: "Not found",
    active: "",
    children: html`
      <div class="py-12 text-center">
        <h1 class="text-xl font-semibold">Not found</h1>
        <p class="mt-2 text-slate-500">${what}</p>
        <a href="/" class="mt-4 inline-block text-sm text-sky-700 underline">Back to modules</a>
      </div>`,
  });
}
