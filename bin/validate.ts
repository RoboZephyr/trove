/**
 * trove validate — checks that a module directory conforms to Trove v0.1 spec.
 * Read-only: never writes, mutates, or migrates. Use `trove migrate` for that.
 *
 * Invoked via `trove validate ...` (see bin/cli.ts).
 */

import { readFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fileFieldMode,
  fileFieldPath,
  fileFieldStatus,
  isFileField,
} from "../ui/credentials";
import { listDirs, readModuleMd } from "../ui/modules";
import type { CredentialField } from "../ui/modules";

async function tryReadJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const REQUIRED_FIELDS = ["name", "version", "trove_spec"];
const RECOMMENDED_FIELDS = ["category", "description", "applies_to"];

interface Result {
  module: string;
  errors: string[];
  warnings: string[];
}

async function validateModule(dir: string): Promise<Result> {
  const result: Result = { module: basename(dir), errors: [], warnings: [] };

  const { fm, body, error } = await readModuleMd(dir).catch((): { fm: never; body: never; error: string } => ({
    fm: undefined as never,
    body: undefined as never,
    error: "module.md not found",
  }));
  if (error) {
    result.errors.push(error);
    return result;
  }

  for (const key of REQUIRED_FIELDS) {
    if (!(fm as Record<string, unknown>)[key]) result.errors.push(`missing required field: ${key}`);
  }

  if (fm.name && fm.name !== result.module) {
    result.errors.push(
      `frontmatter name "${fm.name}" doesn't match directory "${result.module}"`,
    );
  }

  for (const key of RECOMMENDED_FIELDS) {
    if (!(fm as Record<string, unknown>)[key]) result.warnings.push(`recommended field missing: ${key}`);
  }

  if (body.trim().length < 200) {
    result.warnings.push(
      "skill body is < 200 chars — module is likely under-documented (gotchas / examples / pricing missing?)",
    );
  }

  if (!fm.last_verified) {
    result.warnings.push(
      "missing `last_verified` field — release-quality gate (see SPEC §2.1). Tag with `YYYY-MM-DD · <method>` or `pending — <reason>`",
    );
  }

  // SPEC §2.1: gotchas-first convention
  const firstHeading = body.match(/^##\s+(.+)$/m)?.[1] ?? "";
  const looksLikeGotchas = /constraint|gotcha|warning|critical|important|⚠/i.test(firstHeading);
  if (firstHeading && !looksLikeGotchas) {
    result.warnings.push(
      `first H2 heading is "${firstHeading}" — SPEC §2.1 recommends leading with gotchas/constraints, not happy path`,
    );
  }

  // SPEC §2.2 + §2.3: credentials.json + files/ alignment
  if (fm.credentials && typeof fm.credentials === "object") {
    const credSpec = fm.credentials as Record<string, CredentialField>;
    const mustBePresent = Object.entries(credSpec)
      .filter(([, declRaw]) => {
        const decl = declRaw ?? {};
        if ("default" in (decl as Record<string, unknown>)) return false;
        if (decl.required === false) return false;
        return true;
      })
      .map(([k]) => k);

    const fileKeys = new Set(
      Object.entries(credSpec)
        .filter(([, decl]) => isFileField(decl ?? {}))
        .map(([k]) => k),
    );

    // Installed-mode keys off credentials.json existence; library/template-mode
    // (only credentials.example.json) skips files/ existence checks.
    let cred = await tryReadJson(resolve(dir, "credentials.json"));
    const installed = cred !== null;
    if (cred === null) cred = await tryReadJson(resolve(dir, "credentials.example.json"));
    const credSource = installed ? "credentials.json" : "credentials.example.json";

    if (cred !== null) {
      const storedNonFile = Object.keys(cred).filter((k) => !fileKeys.has(k));
      const fileKeysStuckAsString = Object.keys(cred).filter(
        (k) => fileKeys.has(k) && typeof cred![k] === "string" && (cred![k] as string).length > 0,
      );
      const missingStringKeys = mustBePresent.filter((k) => !fileKeys.has(k) && !(k in cred!));
      const extra = storedNonFile.filter((k) => !(k in credSpec));

      if (missingStringKeys.length > 0) {
        result.warnings.push(
          `${credSource} missing required string keys (no default + required != false): ${missingStringKeys.join(", ")}`,
        );
      }
      if (extra.length > 0) {
        result.warnings.push(`${credSource} has undeclared keys: ${extra.join(", ")}`);
      }
      if (fileKeysStuckAsString.length > 0) {
        result.warnings.push(
          `${credSource} contains ${fileKeysStuckAsString.join(", ")} as a string but their schema is \`type: file\` — run \`trove migrate ${basename(dir)}\` to relocate into files/`,
        );
      }
    } else if (mustBePresent.length > 0) {
      result.warnings.push(
        `neither credentials.json nor credentials.example.json found, but required keys exist: ${mustBePresent.join(", ")}`,
      );
    }

    // File-typed field checks (installed-mode only) — stat in parallel
    if (installed) {
      const fileFields = Object.entries(credSpec).filter(([, decl]) => isFileField(decl ?? {}));
      const statuses = await Promise.all(
        fileFields.map(([key, decl]) => fileFieldStatus(fileFieldPath(dir, key, decl))),
      );
      for (let i = 0; i < fileFields.length; i++) {
        const [key, decl] = fileFields[i];
        const status = statuses[i];
        const path = fileFieldPath(dir, key, decl);
        const required = !(decl.required === false || "default" in (decl as Record<string, unknown>));
        if (!status.exists) {
          if (required) result.warnings.push(`file-typed credential \`${key}\` missing at files/${basename(path)}`);
          continue;
        }
        if (status.size === 0) {
          result.warnings.push(`file-typed credential \`${key}\` is empty (files/${basename(path)})`);
        }
        const declMode = fileFieldMode(decl);
        if (status.mode !== null && status.mode !== declMode) {
          result.warnings.push(
            `file-typed credential \`${key}\` has mode 0${status.mode.toString(8)} but schema expects 0${declMode.toString(8)} — chmod to lock down`,
          );
        }
      }
    }
  }

  return result;
}

export async function runValidate(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.error(
      "Usage:\n" +
        "  trove validate <module-dir>     # validate single module\n" +
        "  trove validate --all            # validate all modules in ~/.trove/\n" +
        "  trove validate --library        # validate all library/ entries in this repo",
    );
    return args.length === 0 ? 1 : 0;
  }

  let modules: string[];
  if (args[0] === "--all") {
    modules = await listDirs(resolve(process.env.HOME!, ".trove"));
  } else if (args[0] === "--library") {
    const here = dirname(fileURLToPath(import.meta.url));
    modules = await listDirs(resolve(here, "..", "library"));
  } else {
    modules = args.map((a) => resolve(a));
  }

  let errors = 0;
  let warnings = 0;
  for (const dir of modules) {
    const r = await validateModule(dir);
    const symbol = r.errors.length === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`\n${symbol} ${r.module}`);
    for (const e of r.errors) console.log(`  \x1b[31m✗ ERROR:\x1b[0m ${e}`);
    for (const w of r.warnings) console.log(`  \x1b[33m⚠ WARN: \x1b[0m ${w}`);
    errors += r.errors.length;
    warnings += r.warnings.length;
  }

  console.log(
    `\n${modules.length} module${modules.length === 1 ? "" : "s"} · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`,
  );
  return errors > 0 ? 1 : 0;
}
