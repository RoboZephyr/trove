import { html, raw } from "hono/html";
import { marked } from "marked";
import type { Module, CredentialField } from "./modules";

/**
 * Design system — derived from leonxlnx/taste-skill (anti-slop frontend) +
 * refero.design (editorial / curatorial gallery aesthetic).
 *
 * - Font: Geist (taste-skill bans Inter); fallback to system stack
 * - Palette: warm-neutral stone/zinc base, one desaturated amber accent
 *   (forbidden: AI-purple/blue, oversaturated accents, pure #000)
 * - Layout: divide-y row-based lists, not 3-column equal card grids
 * - Density: ~5 (daily app, comfortable but not gallery-sparse)
 * - Motion: CSS-only, transform + opacity, ~150ms cubic-bezier
 */

function Layout(props: { title: string; active: "home" | "library" | ""; children: unknown }) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${props.title} · Trove</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.3"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #fafaf9;
      --surface: #ffffff;
      --ink: #0a0a0a;
      --ink-2: #404040;
      --ink-3: #737373;
      --ink-4: #a3a3a3;
      --line: #e7e5e4;
      --line-soft: #f5f5f4;
      --accent: #b45309;
      --accent-soft: #fef3c7;
      --good: #15803d;
      --good-soft: #dcfce7;
      --warn: #b45309;
      --warn-soft: #fef3c7;
      --bad: #b91c1c;
      --bad-soft: #fee2e2;
    }
    html, body { background: var(--bg); color: var(--ink); font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; font-feature-settings: 'ss01', 'cv11'; }
    code, pre, .mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
    a { color: inherit; }
    .hairline { border-color: var(--line); }
    .hairline-soft { border-color: var(--line-soft); }
    .accent { color: var(--accent); }
    .link-hover:hover { color: var(--accent); }
    .row-hover { transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1); }
    .row-hover:hover { background-color: var(--line-soft); }
    .row-hover:active { transform: translateY(1px); }
    .btn-primary { background: var(--ink); color: var(--bg); transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), background 150ms; }
    .btn-primary:hover { background: var(--ink-2); }
    .btn-primary:active { transform: translateY(1px); }
    .btn-quiet { background: var(--line-soft); color: var(--ink-2); transition: background 150ms; }
    .btn-quiet:hover { background: var(--line); }
    .input { background: var(--surface); border: 1px solid var(--line); transition: border-color 150ms; }
    .input:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px rgba(10,10,10,0.06); }
    .chip { background: var(--line-soft); color: var(--ink-2); }
    .surface { background: var(--surface); border: 1px solid var(--line); }
    .surface-inset { background: var(--line-soft); }
    .status-good { background: var(--good-soft); color: var(--good); }
    .status-warn { background: var(--warn-soft); color: var(--warn); }
    .status-bad { background: var(--bad-soft); color: var(--bad); }
    .status-mute { background: var(--line-soft); color: var(--ink-3); }
    .dot { width: 6px; height: 6px; border-radius: 999px; display: inline-block; }
    .display { font-weight: 600; letter-spacing: -0.02em; }
    .prose pre { background: #18181b; color: #f4f4f5; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; line-height: 1.55; }
    .prose code { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 0.88em; }
    .prose :not(pre) > code { background: var(--line-soft); padding: 0.1rem 0.35rem; border-radius: 3px; }
    .prose h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; margin: 1.75rem 0 0.75rem; }
    .prose h2 { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.015em; margin: 1.75rem 0 0.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); }
    .prose h2:first-child { border-top: none; padding-top: 0; margin-top: 0; }
    .prose h3 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
    .prose p, .prose ul, .prose ol { margin: 0.55rem 0; line-height: 1.7; color: var(--ink-2); }
    .prose ul { list-style: none; padding-left: 0; }
    .prose ul > li { padding-left: 1.25rem; position: relative; }
    .prose ul > li::before { content: ''; position: absolute; left: 0.25rem; top: 0.85rem; width: 4px; height: 4px; background: var(--ink-4); border-radius: 999px; }
    .prose ol { list-style: decimal; padding-left: 1.5rem; }
    .prose a { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    .prose blockquote { border-left: 2px solid var(--line); padding-left: 1rem; color: var(--ink-3); margin: 1rem 0; }
    .prose table { border-collapse: collapse; margin: 1rem 0; width: 100%; font-size: 0.9em; }
    .prose th, .prose td { border-bottom: 1px solid var(--line); padding: 0.5rem 0.75rem; text-align: left; }
    .prose th { background: var(--line-soft); font-weight: 600; }
    .prose strong { color: var(--ink); font-weight: 600; }
  </style>
</head>
<body class="min-h-[100dvh] antialiased">
  <header class="border-b hairline bg-[var(--bg)]/95 backdrop-blur sticky top-0 z-10">
    <div class="max-w-[1100px] mx-auto px-6 lg:px-10 py-4 flex items-baseline gap-8">
      <a href="/" class="display text-lg tracking-tight">Trove</a>
      <nav class="flex items-baseline gap-6 text-sm">
        <a href="/" class="${props.active === "home" ? "text-[var(--ink)] font-medium" : "text-[var(--ink-3)] link-hover"}">Modules</a>
        <a href="/library" class="${props.active === "library" ? "text-[var(--ink)] font-medium" : "text-[var(--ink-3)] link-hover"}">Library</a>
      </nav>
      <div class="ml-auto text-[11px] mono text-[var(--ink-4)] tabular-nums">127.0.0.1:7821 · v0.2</div>
    </div>
  </header>
  <main class="max-w-[1100px] mx-auto px-6 lg:px-10 py-10">
    ${props.children}
  </main>
</body>
</html>`;
}

const statusMeta: Record<Module["credentialsFilled"], { label: string; cls: string }> = {
  complete: { label: "ready", cls: "status-good" },
  partial: { label: "partial", cls: "status-warn" },
  missing: { label: "missing", cls: "status-bad" },
  "n/a": { label: "no creds", cls: "status-mute" },
};

type VerifyTier = "production" | "verified" | "partial" | "pending" | "unknown";

/**
 * Heuristic parse of free-text `last_verified` field into a coarse status tier,
 * for color-coding. The string itself stays canonical — this is just for the
 * badge swatch.
 */
function parseVerify(s: string | undefined): { tier: VerifyTier; label: string; full: string } {
  if (!s) return { tier: "unknown", label: "unverified", full: "" };
  const low = s.toLowerCase();
  if (low.startsWith("production")) return { tier: "production", label: "production", full: s };
  if (low.startsWith("pending")) return { tier: "pending", label: "pending", full: s };
  if (/^\d{4}-\d{2}-\d{2} · partial\b/.test(low) || /blocked|contract ok|no live|not invoked|not e2e|not yet|awaiting/.test(low)) {
    return { tier: "partial", label: "partial", full: s };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { tier: "verified", label: "verified", full: s };
  return { tier: "unknown", label: "unverified", full: s };
}

const verifyMeta: Record<VerifyTier, { dot: string; cls: string }> = {
  production: { dot: "var(--good)", cls: "status-good" },
  verified: { dot: "var(--good)", cls: "status-good" },
  partial: { dot: "var(--warn)", cls: "status-warn" },
  pending: { dot: "var(--ink-4)", cls: "status-mute" },
  unknown: { dot: "var(--ink-4)", cls: "status-mute" },
};

function VerifyBadge(props: { fm: { last_verified?: string } }) {
  const v = parseVerify(props.fm.last_verified);
  return html`<span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded ${verifyMeta[v.tier].cls}" title="${v.full}">
    <span class="dot" style="background:${verifyMeta[v.tier].dot}"></span>${v.label}
  </span>`;
}

function StatusDot(props: { status: Module["credentialsFilled"] }) {
  const dotColor: Record<Module["credentialsFilled"], string> = {
    complete: "var(--good)",
    partial: "var(--warn)",
    missing: "var(--bad)",
    "n/a": "var(--ink-4)",
  };
  return html`<span class="dot" style="background:${dotColor[props.status]}"></span>`;
}

function ModuleRow(props: { mod: Module; href: string }) {
  const fm = props.mod.frontmatter;
  return html`
    <a href="${props.href}" class="row-hover block border-b hairline-soft px-2 -mx-2 py-4 group">
      <div class="flex items-baseline gap-3 flex-wrap">
        <span class="display text-[15px] text-[var(--ink)]">${fm.name ?? props.mod.name}</span>
        <span class="mono text-[11px] text-[var(--ink-4)] tabular-nums">${fm.version ?? ""}</span>
        ${fm.category ? html`<span class="text-[11px] text-[var(--ink-3)] tracking-wide uppercase">${fm.category}</span>` : ""}
        ${VerifyBadge({ fm })}
        <span class="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">${StatusDot({ status: props.mod.credentialsFilled })}${statusMeta[props.mod.credentialsFilled].label}</span>
      </div>
      ${fm.description
        ? html`<div class="mt-1.5 text-[13.5px] text-[var(--ink-2)] leading-relaxed max-w-[80ch]">${fm.description}</div>`
        : ""}
      ${fm.applies_to && fm.applies_to.length > 0
        ? html`<div class="mt-2 flex flex-wrap gap-1.5">
            ${fm.applies_to.slice(0, 3).map((t) => html`<span class="text-[11px] px-1.5 py-0.5 chip rounded">${t}</span>`)}
            ${fm.applies_to.length > 3 ? html`<span class="text-[11px] text-[var(--ink-4)] px-1">+${fm.applies_to.length - 3} more</span>` : ""}
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
        <section class="pt-8 pb-12">
          <h1 class="display text-3xl md:text-4xl tracking-tighter leading-none">Nothing in <code class="mono accent text-[0.85em]">~/.trove/</code> yet.</h1>
          <p class="mt-5 text-[15px] text-[var(--ink-2)] leading-relaxed max-w-[55ch]">
            Trove is a local file folder. Install a module to copy its
            template into <code class="mono text-[0.9em]">~/.trove/&lt;name&gt;</code>, then fill credentials through the form.
            Browse the full <a href="/library" class="accent underline">module library</a> or start with one of these.
          </p>
        </section>
        ${quickStart.length > 0
          ? html`
              <section class="border-t hairline pt-8">
                <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-2">Quick start</div>
                <div class="divide-y hairline-soft">
                  ${quickStart.map((m) => ModuleRow({ mod: m, href: `/library/${m.name}` }))}
                </div>
              </section>`
          : ""}`,
    });
  }

  const byCategory = new Map<string, Module[]>();
  for (const m of modules) {
    const cat = m.frontmatter.category ?? "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));

  const counts = modules.reduce(
    (acc, m) => {
      acc[m.credentialsFilled] = (acc[m.credentialsFilled] ?? 0) + 1;
      return acc;
    },
    {} as Record<Module["credentialsFilled"], number>,
  );

  return Layout({
    title: "Modules",
    active: "home",
    children: html`
      <section class="pb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 class="display text-3xl md:text-4xl tracking-tighter leading-none">Your modules</h1>
          <p class="mt-3 text-[13.5px] text-[var(--ink-3)]">
            ${modules.length} installed in <code class="mono text-[0.95em]">~/.trove/</code>
            · grouped by category
          </p>
        </div>
        <div class="flex items-center gap-4 text-[12px] text-[var(--ink-3)] tabular-nums">
          ${(["complete", "partial", "missing", "n/a"] as Module["credentialsFilled"][])
            .filter((s) => (counts[s] ?? 0) > 0)
            .map(
              (s) => html`<span class="inline-flex items-center gap-1.5">${StatusDot({ status: s })}${counts[s]} ${statusMeta[s].label}</span>`,
            )}
        </div>
      </section>

      ${categories.map(
        ([cat, mods], idx) => html`
          <section class="${idx === 0 ? "border-t" : ""} hairline pt-6 mb-2">
            <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-1">${cat}</div>
            <div class="divide-y hairline-soft">
              ${mods.map((m) => ModuleRow({ mod: m, href: `/m/${m.name}` }))}
            </div>
          </section>`,
      )}`,
  });
}

function chip(text: string) {
  return html`<span class="text-[11px] px-2 py-0.5 chip rounded">${text}</span>`;
}

export function credentialsBadgeOOB(mod: Module) {
  const s = statusMeta[mod.credentialsFilled];
  return html`<span id="cred-badge" hx-swap-oob="true" class="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${s.cls}">${StatusDot({ status: mod.credentialsFilled })}${s.label}</span>`;
}

export function credentialsForm(mod: Module, values: Record<string, string>) {
  const spec = mod.frontmatter.credentials ?? {};
  const keys = Object.keys(spec);
  if (keys.length === 0) {
    return html`<div id="cred-form" class="text-[13px] text-[var(--ink-3)]">This module declares no credentials.</div>`;
  }
  return html`
    <form
      id="cred-form"
      hx-patch="/api/m/${mod.name}/cred"
      hx-swap="outerHTML"
      hx-target="#cred-form"
      class="space-y-5"
    >
      ${keys.map((key) => {
        const decl: CredentialField = spec[key] ?? {};
        const value = values[key] ?? "";
        const type = decl.type ?? "text";
        const id = `cred-${key}`;
        return html`
          <div>
            <label for="${id}" class="flex items-baseline gap-2 text-[12px] font-medium text-[var(--ink-2)] tracking-wide uppercase">
              <span class="mono">${key}</span>
              ${decl.required ? html`<span class="text-[var(--bad)] normal-case tracking-normal text-[10px] font-normal">required</span>` : html`<span class="text-[var(--ink-4)] normal-case tracking-normal text-[10px] font-normal">optional</span>`}
            </label>
            ${renderField({ id, name: key, value, decl, type })}
            ${decl.help ? html`<p class="mt-1.5 text-[12px] text-[var(--ink-3)] leading-relaxed max-w-[70ch]">${decl.help}</p>` : ""}
          </div>`;
      })}
      <div class="flex items-center gap-3 pt-2 border-t hairline-soft">
        <button type="submit" class="btn-primary px-3.5 py-1.5 rounded text-[13px] font-medium">
          Save credentials
        </button>
        <span class="text-[11px] text-[var(--ink-4)] leading-relaxed">
          Password fields show <code class="mono">••••••••</code> if set. Leave masked to keep, replace to change, clear to delete.
        </span>
      </div>
    </form>`;
}

function renderField(p: { id: string; name: string; value: string; decl: CredentialField; type: string }) {
  const base = "input mt-1.5 w-full rounded px-3 py-2 text-[14px] text-[var(--ink)] placeholder-[var(--ink-4)]";
  if (p.type === "select" && p.decl.options) {
    return html`
      <select id="${p.id}" name="${p.name}" class="${base}">
        ${p.decl.options.map((opt) => html`<option value="${opt}" ${opt === p.value ? "selected" : ""}>${opt}</option>`)}
      </select>`;
  }
  if (p.type === "multiline") {
    return html`<textarea id="${p.id}" name="${p.name}" rows="4" class="${base} mono text-[12.5px] leading-relaxed">${p.value}</textarea>`;
  }
  if (p.type === "boolean") {
    return html`
      <select id="${p.id}" name="${p.name}" class="${base}">
        <option value="true" ${p.value === "true" ? "selected" : ""}>true</option>
        <option value="false" ${p.value === "false" ? "selected" : ""}>false</option>
      </select>`;
  }
  const inputType = p.type === "password" ? "password" : p.type === "number" ? "number" : p.type === "url" ? "url" : "text";
  return html`<input id="${p.id}" name="${p.name}" type="${inputType}" value="${p.value}" class="${base} ${p.type === "password" || p.type === "url" ? "mono text-[12.5px]" : ""}" autocomplete="off" />`;
}

export function modulePage(mod: Module, credValues: Record<string, string>) {
  const fm = mod.frontmatter;
  const s = statusMeta[mod.credentialsFilled];
  const skillHtml = marked.parse(mod.body, { async: false }) as string;

  return Layout({
    title: mod.name,
    active: "home",
    children: html`
      <a href="/" class="text-[12px] text-[var(--ink-3)] link-hover inline-flex items-center gap-1 mb-6">← All modules</a>

      <header class="pb-8 border-b hairline">
        <div class="flex items-baseline gap-3 flex-wrap">
          <h1 class="display text-3xl md:text-4xl tracking-tighter leading-none">${fm.name ?? mod.name}</h1>
          <span class="mono text-[12px] text-[var(--ink-4)] tabular-nums">${fm.version ?? ""}</span>
          ${fm.category ? html`<span class="text-[11px] text-[var(--ink-3)] tracking-wide uppercase">${fm.category}</span>` : ""}
          ${VerifyBadge({ fm })}
          <span id="cred-badge" class="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${s.cls}">${StatusDot({ status: mod.credentialsFilled })}${s.label}</span>
        </div>
        ${fm.description ? html`<p class="mt-4 text-[15px] text-[var(--ink-2)] leading-relaxed max-w-[80ch]">${fm.description}</p>` : ""}
        ${fm.last_verified
          ? html`<p class="mt-3 text-[12px] text-[var(--ink-3)] mono leading-relaxed max-w-[80ch]">verified: ${fm.last_verified}</p>`
          : ""}
        ${fm.homepage
          ? html`<div class="mt-3 text-[12.5px]"><a href="${fm.homepage}" target="_blank" rel="noopener" class="accent underline">${fm.homepage} ↗</a></div>`
          : ""}
        ${mod.parseError
          ? html`<div class="mt-4 inline-flex text-[12px] px-2 py-1 rounded status-warn">Frontmatter warning: ${mod.parseError}</div>`
          : ""}
      </header>

      ${fm.applies_to && fm.applies_to.length > 0
        ? html`
            <section class="py-6 border-b hairline">
              <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-3">Applies to</div>
              <div class="flex flex-wrap gap-1.5">${fm.applies_to.map((t) => chip(t))}</div>
            </section>`
        : ""}

      <section class="py-6 border-b hairline">
        <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-3">Credentials</div>
        <div class="surface-inset rounded-lg p-5">
          ${credentialsForm(mod, credValues)}
        </div>
      </section>

      <section class="pt-6">
        <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-3">Skill</div>
        <article class="prose max-w-none">${raw(skillHtml)}</article>
      </section>`,
  });
}

export function libraryPage(items: Module[], installedNames: Set<string>) {
  return Layout({
    title: "Library",
    active: "library",
    children: html`
      <section class="pb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 class="display text-3xl md:text-4xl tracking-tighter leading-none">Module library</h1>
          <p class="mt-3 text-[13.5px] text-[var(--ink-3)] max-w-[60ch]">
            ${items.length} bundled module templates. Install copies <code class="mono text-[0.95em]">module.md</code> into <code class="mono text-[0.95em]">~/.trove/</code>; credentials stay empty until you fill them.
          </p>
        </div>
      </section>

      <section class="border-t hairline pt-4 divide-y hairline-soft">
        ${items.map((item) => {
          const fm = item.frontmatter;
          const installed = installedNames.has(item.name);
          return html`
            <div class="py-5 grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 items-start">
              <div>
                <div class="flex items-baseline gap-3 flex-wrap">
                  <a href="/library/${item.name}" class="display text-[16px] link-hover">${fm.name ?? item.name}</a>
                  <span class="mono text-[11px] text-[var(--ink-4)] tabular-nums">${fm.version ?? ""}</span>
                  ${fm.category ? html`<span class="text-[11px] text-[var(--ink-3)] tracking-wide uppercase">${fm.category}</span>` : ""}
                  ${VerifyBadge({ fm })}
                </div>
                ${fm.description ? html`<p class="mt-1.5 text-[13.5px] text-[var(--ink-2)] leading-relaxed max-w-[75ch]">${fm.description}</p>` : ""}
                ${fm.applies_to && fm.applies_to.length > 0
                  ? html`<div class="mt-2 flex flex-wrap gap-1.5">${fm.applies_to.slice(0, 4).map((t) => chip(t))}</div>`
                  : ""}
              </div>
              <div class="flex items-center gap-2 md:justify-end">
                ${installed
                  ? html`<a href="/m/${item.name}" class="btn-quiet px-3 py-1.5 rounded text-[12px] font-medium inline-flex items-center gap-1.5">${StatusDot({ status: "complete" })}Installed</a>`
                  : html`
                      <a href="/library/${item.name}" class="text-[12px] text-[var(--ink-3)] link-hover px-2 py-1.5">Preview</a>
                      <form method="post" action="/api/install" class="inline">
                        <input type="hidden" name="name" value="${item.name}" />
                        <button type="submit" class="btn-primary px-3 py-1.5 rounded text-[12px] font-medium">Install</button>
                      </form>`}
              </div>
            </div>`;
        })}
      </section>`,
  });
}

export function libraryItemPage(item: Module, installed: boolean) {
  const fm = item.frontmatter;
  const skillHtml = marked.parse(item.body, { async: false }) as string;
  return Layout({
    title: `${item.name} · library`,
    active: "library",
    children: html`
      <a href="/library" class="text-[12px] text-[var(--ink-3)] link-hover inline-flex items-center gap-1 mb-6">← Library</a>

      <header class="pb-8 border-b hairline">
        <div class="flex items-baseline gap-3 flex-wrap">
          <h1 class="display text-3xl md:text-4xl tracking-tighter leading-none">${fm.name ?? item.name}</h1>
          <span class="mono text-[12px] text-[var(--ink-4)] tabular-nums">${fm.version ?? ""}</span>
          ${fm.category ? html`<span class="text-[11px] text-[var(--ink-3)] tracking-wide uppercase">${fm.category}</span>` : ""}
          ${VerifyBadge({ fm })}
          <span class="text-[11px] px-2 py-1 rounded status-mute">library</span>
          <div class="ml-auto">
            ${installed
              ? html`<a href="/m/${item.name}" class="btn-quiet px-3 py-1.5 rounded text-[12.5px] font-medium inline-flex items-center gap-1.5">${StatusDot({ status: "complete" })}Installed</a>`
              : html`
                  <form method="post" action="/api/install" class="inline">
                    <input type="hidden" name="name" value="${item.name}" />
                    <button type="submit" class="btn-primary px-4 py-2 rounded text-[13px] font-medium">Install to ~/.trove/${item.name}</button>
                  </form>`}
          </div>
        </div>
        ${fm.description ? html`<p class="mt-4 text-[15px] text-[var(--ink-2)] leading-relaxed max-w-[80ch]">${fm.description}</p>` : ""}
        ${fm.homepage
          ? html`<div class="mt-3 text-[12.5px]"><a href="${fm.homepage}" target="_blank" rel="noopener" class="accent underline">${fm.homepage} ↗</a></div>`
          : ""}
      </header>

      ${fm.applies_to && fm.applies_to.length > 0
        ? html`
            <section class="py-6 border-b hairline">
              <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-3">Applies to</div>
              <div class="flex flex-wrap gap-1.5">${fm.applies_to.map((t) => chip(t))}</div>
            </section>`
        : ""}

      <section class="pt-6">
        <div class="text-[11px] tracking-[0.15em] uppercase text-[var(--ink-3)] mb-3">Skill</div>
        <article class="prose max-w-none">${raw(skillHtml)}</article>
      </section>`,
  });
}

export function notFoundPage(what: string) {
  return Layout({
    title: "Not found",
    active: "",
    children: html`
      <section class="py-16">
        <h1 class="display text-3xl tracking-tighter">Not found</h1>
        <p class="mt-3 text-[14px] text-[var(--ink-3)]">${what}</p>
        <a href="/" class="mt-6 inline-block btn-quiet px-3 py-1.5 rounded text-[13px]">← Back to modules</a>
      </section>`,
  });
}
