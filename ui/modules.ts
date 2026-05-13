/**
 * Module FS layer: reads ~/.trove/<name>/ and the repo's bundled library/.
 *
 * Frontmatter parsing is intentionally lenient — `trove validate` is the strict
 * gate; the UI should still render a partially malformed module so the user can
 * spot what's wrong.
 *
 * Credential read/write disk operations are factored out into ./credentials.ts
 * (SPEC §2.2 + §2.3 are implemented there).
 */

import { parse as parseYaml } from "yaml";
import { readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import {
  fieldStatuses,
  isFileField,
  readMasked,
  writeSubmitted,
  type MaskedValue,
  type WriteSubmission,
} from "./credentials";

export const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export const TROVE_HOME = resolve(homedir(), ".trove");

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LIBRARY_DIR = resolve(REPO_ROOT, "library");

export type FileFormat = "json" | "yaml" | "ini" | "pem" | "ssh-private-key" | "x509" | "raw";

export interface CredentialField {
  type?: "text" | "password" | "url" | "select" | "boolean" | "number" | "multiline" | "file";
  required?: boolean;
  default?: unknown;
  options?: string[];
  help?: string;
  /** Only meaningful when `type: file`. */
  file_format?: FileFormat;
  /** Only meaningful when `type: file`. POSIX mode (octal number or octal-prefixed string). */
  file_mode?: number | string;
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
  last_verified?: string;
  credentials?: Record<string, CredentialField>;
  mcp?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface Module {
  name: string;
  source: "installed" | "library";
  dir: string;
  frontmatter: Frontmatter;
  body: string;
  parseError?: string;
  credentialsFilled: "complete" | "partial" | "missing" | "n/a";
}

export async function readModuleMd(dir: string): Promise<{ fm: Frontmatter; body: string; error?: string }> {
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
  const statuses = await fieldStatuses(dir, fm);
  const required = Object.values(statuses).filter((s) => s !== "n/a");
  if (required.length === 0) return "complete";
  const present = required.filter((s) => s === "present").length;
  if (present === 0) return "missing";
  if (present < required.length) return "partial";
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

export async function listDirs(root: string): Promise<string[]> {
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

export async function listLibrary(): Promise<Module[]> {
  const dirs = await listDirs(LIBRARY_DIR);
  return Promise.all(dirs.map((d) => loadModule(d, "library")));
}

export async function getLibraryItem(name: string): Promise<Module | null> {
  const dir = resolve(LIBRARY_DIR, name);
  if (!(await fileExists(resolve(dir, "module.md")))) return null;
  return loadModule(dir, "library");
}

/** GET form values for the Web UI — see `credentials.ts` for shape. */
export async function readCredentialsMasked(mod: Module): Promise<Record<string, MaskedValue>> {
  if (!mod.frontmatter.credentials) return {};
  return readMasked(mod.dir, mod.frontmatter);
}

/** Persist submitted form values for the Web UI — see `credentials.ts`. */
export async function writeCredentials(mod: Module, submission: WriteSubmission): Promise<void> {
  await writeSubmitted(mod.dir, mod.frontmatter, submission);
}

export { isFileField };
export type { MaskedValue, WriteSubmission };

/**
 * Copy a library module to ~/.trove/<name>/module.md (credentials.json is
 * NOT copied — the user fills it through the UI after install).
 */
export async function installFromLibrary(name: string): Promise<Module> {
  const src = resolve(LIBRARY_DIR, name, "module.md");
  if (!(await fileExists(src))) throw new Error(`library module "${name}" not found`);
  const destDir = resolve(TROVE_HOME, name);
  const dest = resolve(destDir, "module.md");
  await mkdir(destDir, { recursive: true });
  const content = await readFile(src, "utf8");
  await writeFile(dest, content);
  const installed = await getInstalledModule(name);
  if (!installed) throw new Error(`install of "${name}" did not produce a readable module`);
  return installed;
}
