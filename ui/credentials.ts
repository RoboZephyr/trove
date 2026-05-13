/**
 * CredentialIO — single source of truth for reading/writing a module's
 * credentials. Handles both string-typed fields (live in credentials.json)
 * and file-typed fields (live in files/<KEY>.<format>).
 *
 * Spec: SPEC §2.2 (string credentials), §2.3 (file credentials).
 *
 * Both `trove validate` and the Web UI route through this module so the
 * disk contract has exactly one implementation.
 */

import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { CredentialField, Frontmatter } from "./modules";

export const FILES_SUBDIR = "files";
export const KEEP_PASSWORD_SENTINEL = "••••••••";

/** Default mode for credential files. */
export const DEFAULT_FILE_MODE = 0o600;
/** Mode for the `files/` directory. */
export const FILES_DIR_MODE = 0o700;

const FORMAT_EXT: Record<string, string> = {
  json: ".json",
  yaml: ".yaml",
  ini: ".ini",
  pem: ".pem",
  "ssh-private-key": ".key",
  x509: ".crt",
  raw: "",
};

export function isFileField(decl: CredentialField | undefined): boolean {
  return decl?.type === "file";
}

/** Compute the on-disk path for a file-typed credential. Pure function. */
export function fileFieldPath(moduleDir: string, key: string, decl: CredentialField): string {
  const fmt = (decl as CredentialField & { file_format?: string }).file_format ?? "raw";
  const ext = FORMAT_EXT[fmt] ?? "";
  return resolve(moduleDir, FILES_SUBDIR, `${key}${ext}`);
}

function parseMode(input: unknown, fallback: number): number {
  if (typeof input === "number") return input;
  if (typeof input === "string" && input.length > 0) {
    const parsed = parseInt(input, input.startsWith("0") ? 8 : 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Mode declared for a file field, parsed from frontmatter. */
export function fileFieldMode(decl: CredentialField): number {
  const raw = (decl as CredentialField & { file_mode?: unknown }).file_mode;
  return parseMode(raw, DEFAULT_FILE_MODE);
}

export interface FileFieldStatus {
  exists: boolean;
  size: number;
  mode: number | null;
  modifiedISO: string | null;
}

export async function fileFieldStatus(path: string): Promise<FileFieldStatus> {
  try {
    const st = await stat(path);
    return {
      exists: true,
      size: st.size,
      mode: st.mode & 0o777,
      modifiedISO: st.mtime.toISOString(),
    };
  } catch {
    return { exists: false, size: 0, mode: null, modifiedISO: null };
  }
}

/**
 * Read raw `credentials.json` contents. Returns `{}` if the file doesn't
 * exist or fails to parse — callers should treat both as "no values yet."
 */
export async function readJsonCreds(moduleDir: string): Promise<Record<string, unknown>> {
  const p = resolve(moduleDir, "credentials.json");
  try {
    return JSON.parse(await readFile(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJsonCreds(moduleDir: string, obj: Record<string, unknown>): Promise<void> {
  const p = resolve(moduleDir, "credentials.json");
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Read a credential value for display in the Web UI's form. Never returns
 * raw file contents — file fields return a status descriptor instead.
 */
export type MaskedValue =
  | { kind: "string"; value: string }              // text/url/select/number/boolean/multiline as-is
  | { kind: "password"; present: boolean }         // password: just presence, no value
  | { kind: "file"; status: FileFieldStatus };     // file: metadata only

export async function readMasked(
  moduleDir: string,
  fm: Frontmatter,
): Promise<Record<string, MaskedValue>> {
  const spec = fm.credentials ?? {};
  const entries = Object.entries(spec);
  const [json, fileStatuses] = await Promise.all([
    readJsonCreds(moduleDir),
    Promise.all(
      entries.map(([key, declRaw]) =>
        isFileField(declRaw ?? {})
          ? fileFieldStatus(fileFieldPath(moduleDir, key, declRaw ?? {}))
          : Promise.resolve(null),
      ),
    ),
  ]);
  const out: Record<string, MaskedValue> = {};
  entries.forEach(([key, declRaw], i) => {
    const decl = declRaw ?? {};
    const status = fileStatuses[i];
    if (status !== null) {
      out[key] = { kind: "file", status };
      return;
    }
    const v = json[key];
    if (decl.type === "password") {
      out[key] = { kind: "password", present: typeof v === "string" && v.length > 0 };
      return;
    }
    out[key] = { kind: "string", value: v === undefined || v === null ? "" : String(v) };
  });
  return out;
}

/**
 * Write submitted form values. The submitted record can contain:
 *   - string fields → written into credentials.json
 *   - password fields → KEEP_PASSWORD_SENTINEL means "don't change"; empty string deletes
 *   - file fields → key absent means "don't change"; explicit `__delete:<KEY>` flag deletes
 *
 * File contents are written to `files/<KEY>.<format>` with the declared mode.
 */
export interface WriteSubmission {
  /** key → value for string/password fields and new file contents. */
  values: Record<string, string>;
  /** Keys flagged for explicit deletion (file-field semantics, but works for any). */
  deletes?: string[];
}

export async function writeSubmitted(
  moduleDir: string,
  fm: Frontmatter,
  submitted: WriteSubmission,
): Promise<void> {
  const spec = fm.credentials ?? {};
  const json = await readJsonCreds(moduleDir);
  const deletes = new Set(submitted.deletes ?? []);

  for (const [key, declRaw] of Object.entries(spec)) {
    const decl = declRaw ?? {};
    const submitted_v = submitted.values[key];

    if (isFileField(decl)) {
      const path = fileFieldPath(moduleDir, key, decl);
      if (deletes.has(key)) {
        await rm(path, { force: true });
        continue;
      }
      if (submitted_v === undefined || submitted_v === "") {
        continue; // no change
      }
      await mkdir(dirname(path), { recursive: true, mode: FILES_DIR_MODE });
      await writeFile(path, submitted_v, { mode: fileFieldMode(decl) });
      await chmod(path, fileFieldMode(decl));
      // Defensive: ensure no stale string lives in credentials.json for this key
      delete json[key];
      continue;
    }

    // string-typed fields
    if (submitted_v === undefined) continue;
    if (decl.type === "password" && submitted_v === KEEP_PASSWORD_SENTINEL) continue;
    if (submitted_v === "" || deletes.has(key)) {
      delete json[key];
    } else {
      json[key] = submitted_v;
    }
  }

  await writeJsonCreds(moduleDir, json);
}

/** Per-field completeness for the dashboard's "ready / partial / missing" badge. */
export type FieldStatus = "present" | "absent" | "n/a";

export async function fieldStatuses(
  moduleDir: string,
  fm: Frontmatter,
): Promise<Record<string, FieldStatus>> {
  const spec = fm.credentials ?? {};
  const entries = Object.entries(spec);
  const [json, fileExists] = await Promise.all([
    readJsonCreds(moduleDir),
    Promise.all(
      entries.map(([key, declRaw]) =>
        isFileField(declRaw ?? {})
          ? fileFieldStatus(fileFieldPath(moduleDir, key, declRaw ?? {})).then((s) => s.exists)
          : Promise.resolve(null),
      ),
    ),
  ]);
  const out: Record<string, FieldStatus> = {};
  entries.forEach(([key, declRaw], i) => {
    const decl = declRaw ?? {};
    const optional = decl.required === false || "default" in (decl as Record<string, unknown>);
    const fileExistsResult = fileExists[i];
    if (fileExistsResult !== null) {
      out[key] = fileExistsResult ? "present" : optional ? "n/a" : "absent";
      return;
    }
    const v = json[key];
    const present = typeof v === "string" ? v.length > 0 : v !== undefined && v !== null;
    out[key] = present ? "present" : optional ? "n/a" : "absent";
  });
  return out;
}

/** Migrate a single field from `type: multiline` string in credentials.json to a file. */
export async function migrateField(
  moduleDir: string,
  key: string,
  decl: CredentialField,
): Promise<"migrated" | "already-file" | "no-value" | "skipped"> {
  if (!isFileField(decl)) return "skipped";
  const path = fileFieldPath(moduleDir, key, decl);
  const json = await readJsonCreds(moduleDir);
  const fileAlreadyExists = (await fileFieldStatus(path)).exists;
  const v = json[key];
  if (fileAlreadyExists && (v === undefined || v === null || v === "")) {
    return "already-file";
  }
  if (typeof v !== "string" || v.length === 0) {
    return fileAlreadyExists ? "already-file" : "no-value";
  }
  await mkdir(dirname(path), { recursive: true, mode: FILES_DIR_MODE });
  await writeFile(path, v, { mode: fileFieldMode(decl) });
  await chmod(path, fileFieldMode(decl));
  delete json[key];
  await writeJsonCreds(moduleDir, json);
  return "migrated";
}

export { join };
