/**
 * Module FS layer: reads ~/.trove/<name>/ and the repo's bundled examples/.
 *
 * Frontmatter parsing is intentionally lenient — `trove validate` is the strict
 * gate; the UI should still render a partially malformed module so the user can
 * spot what's wrong.
 */

import { parse as parseYaml } from "yaml";
import { readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export const TROVE_HOME = resolve(homedir(), ".trove");

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXAMPLES_DIR = resolve(REPO_ROOT, "examples");

export interface CredentialField {
  type?: "text" | "password" | "url" | "select" | "boolean" | "number" | "multiline";
  required?: boolean;
  default?: unknown;
  options?: string[];
  help?: string;
}

export interface Frontmatter {
  name?: string;
  version?: string;
  category?: string;
  description?: string;
  homepage?: string;
  tags?: string[];
  applies_to?: string[];
  trove_spec?: string;
  credentials?: Record<string, CredentialField>;
  mcp?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface Module {
  name: string;
  source: "installed" | "example";
  dir: string;
  frontmatter: Frontmatter;
  body: string;
  parseError?: string;
  credentialsFilled: "complete" | "partial" | "missing" | "n/a";
}

async function readModuleMd(dir: string): Promise<{ fm: Frontmatter; body: string; error?: string }> {
  const raw = await readFile(resolve(dir, "module.md"), "utf8");
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { fm: {}, body: raw, error: "no YAML frontmatter" };
  try {
    const fm = (parseYaml(m[1]) ?? {}) as Frontmatter;
    return { fm, body: m[2] };
  } catch (e) {
    return { fm: {}, body: m[2], error: `frontmatter parse: ${(e as Error).message}` };
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function credStatus(dir: string, fm: Frontmatter): Promise<Module["credentialsFilled"]> {
  if (!fm.credentials || Object.keys(fm.credentials).length === 0) return "n/a";

  // SPEC §2.2: fields with `default:` or `required: false` don't need to appear
  // in credentials.json. If every field is such, the module is ready out of the box.
  const requiredKeys = Object.entries(fm.credentials)
    .filter(([, decl]) => !("default" in decl) && decl.required !== false)
    .map(([k]) => k);
  if (requiredKeys.length === 0) return "complete";

  const credPath = resolve(dir, "credentials.json");
  let cred: Record<string, unknown> = {};
  if (await fileExists(credPath)) {
    try {
      cred = JSON.parse(await readFile(credPath, "utf8"));
    } catch {}
  }

  const present = requiredKeys.filter((k) => cred[k] !== undefined && cred[k] !== "");
  if (present.length === 0) return "missing";
  if (present.length < requiredKeys.length) return "partial";
  return "complete";
}

async function loadModule(dir: string, source: Module["source"]): Promise<Module> {
  const name = basename(dir);
  const { fm, body, error } = await readModuleMd(dir);
  return {
    name,
    source,
    dir,
    frontmatter: fm,
    body,
    parseError: error,
    credentialsFilled: source === "installed" ? await credStatus(dir, fm) : "n/a",
  };
}

async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => resolve(root, e.name))
      .sort();
  } catch {
    return [];
  }
}

export async function listInstalledModules(): Promise<Module[]> {
  const dirs = await listDirs(TROVE_HOME);
  return Promise.all(dirs.map((d) => loadModule(d, "installed")));
}

export async function getInstalledModule(name: string): Promise<Module | null> {
  const dir = resolve(TROVE_HOME, name);
  if (!(await fileExists(resolve(dir, "module.md")))) return null;
  return loadModule(dir, "installed");
}

export async function listExamples(): Promise<Module[]> {
  const dirs = await listDirs(EXAMPLES_DIR);
  return Promise.all(dirs.map((d) => loadModule(d, "example")));
}

export async function getExample(name: string): Promise<Module | null> {
  const dir = resolve(EXAMPLES_DIR, name);
  if (!(await fileExists(resolve(dir, "module.md")))) return null;
  return loadModule(dir, "example");
}

/**
 * GET returns values masked: password fields → "••••••••" if set, "" if unset.
 * Non-password fields return as-is so users can see what's there.
 */
export async function readCredentialsMasked(
  mod: Module,
): Promise<Record<string, string>> {
  if (!mod.frontmatter.credentials) return {};
  const credPath = resolve(mod.dir, "credentials.json");
  let cred: Record<string, unknown> = {};
  if (await fileExists(credPath)) {
    try {
      cred = JSON.parse(await readFile(credPath, "utf8"));
    } catch {}
  }
  const out: Record<string, string> = {};
  for (const [key, decl] of Object.entries(mod.frontmatter.credentials)) {
    const v = cred[key];
    if (v === undefined || v === null || v === "") {
      out[key] = "";
    } else if (decl.type === "password") {
      out[key] = "••••••••";
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

/**
 * Overwrite credentials.json with the submitted values.
 * The "••••••••" sentinel means "leave the existing value untouched" — used so
 * a partial form submit doesn't blow away unchanged password fields.
 */
export async function writeCredentials(
  mod: Module,
  submitted: Record<string, string>,
): Promise<void> {
  const credPath = resolve(mod.dir, "credentials.json");
  let existing: Record<string, unknown> = {};
  if (await fileExists(credPath)) {
    try {
      existing = JSON.parse(await readFile(credPath, "utf8"));
    } catch {}
  }
  const merged = { ...existing };
  const spec = mod.frontmatter.credentials ?? {};
  for (const key of Object.keys(spec)) {
    const v = submitted[key];
    if (v === undefined) continue;
    if (v === "••••••••") continue;
    if (v === "") {
      delete merged[key];
    } else {
      merged[key] = v;
    }
  }
  await mkdir(dirname(credPath), { recursive: true });
  await writeFile(credPath, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Copy an example module to ~/.trove/<name>/module.md (credentials.json is
 * NOT copied — the user fills it through the UI after install).
 */
export async function installExample(name: string): Promise<Module> {
  const src = resolve(EXAMPLES_DIR, name, "module.md");
  if (!(await fileExists(src))) throw new Error(`example "${name}" not found`);
  const destDir = resolve(TROVE_HOME, name);
  const dest = resolve(destDir, "module.md");
  await mkdir(destDir, { recursive: true });
  const content = await readFile(src, "utf8");
  await writeFile(dest, content);
  const installed = await getInstalledModule(name);
  if (!installed) throw new Error(`install of "${name}" did not produce a readable module`);
  return installed;
}
