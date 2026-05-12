#!/usr/bin/env bun
/**
 * trove validate — checks that a module directory conforms to Trove v0.1 spec.
 *
 * Usage:
 *   bun bin/trove-validate.ts <module-dir>           # validate single module
 *   bun bin/trove-validate.ts --all                  # validate all modules under ~/.trove/
 *   bun bin/trove-validate.ts --library              # validate every library/* in this repo
 */

import { parse as parseYaml } from "yaml";
import { readFile, readdir } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const REQUIRED_FIELDS = ["name", "version", "trove_spec"];
const RECOMMENDED_FIELDS = ["category", "description", "applies_to"];

interface Result {
  module: string;
  errors: string[];
  warnings: string[];
}

async function validateModule(dir: string): Promise<Result> {
  const result: Result = { module: basename(dir), errors: [], warnings: [] };

  let content: string;
  try {
    content = await readFile(resolve(dir, "module.md"), "utf8");
  } catch {
    result.errors.push("module.md not found");
    return result;
  }

  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    result.errors.push("module.md has no YAML frontmatter (missing --- delimiters)");
    return result;
  }

  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(match[1]) as Record<string, unknown>;
  } catch (e) {
    result.errors.push(`frontmatter YAML parse error: ${(e as Error).message}`);
    return result;
  }

  if (typeof fm !== "object" || fm === null) {
    result.errors.push("frontmatter is not a YAML object");
    return result;
  }

  for (const key of REQUIRED_FIELDS) {
    if (!fm[key]) result.errors.push(`missing required field: ${key}`);
  }

  if (fm.name && fm.name !== result.module) {
    result.errors.push(
      `frontmatter name "${fm.name}" doesn't match directory "${result.module}"`,
    );
  }

  for (const key of RECOMMENDED_FIELDS) {
    if (!fm[key]) result.warnings.push(`recommended field missing: ${key}`);
  }

  if (match[2].trim().length < 200) {
    result.warnings.push(
      "skill body is < 200 chars — module is likely under-documented (gotchas / examples / pricing missing?)",
    );
  }

  // Critical check: skill body should lead with constraints/gotchas, not happy path
  const firstHeading = match[2].match(/^##\s+(.+)$/m)?.[1] ?? "";
  const looksLikeGotchas = /constraint|gotcha|warning|critical|important|⚠/i.test(
    firstHeading,
  );
  if (firstHeading && !looksLikeGotchas) {
    result.warnings.push(
      `first H2 heading is "${firstHeading}" — SPEC §2.1 recommends leading with gotchas/constraints, not happy path`,
    );
  }

  // credentials.json alignment check
  // Per SPEC §2.2: a key only needs to appear in credentials.json if it has
  // neither a `default:` nor `required: false`. Fields with defaults / explicitly
  // optional fields can be omitted (default value applies).
  if (fm.credentials && typeof fm.credentials === "object") {
    const credSpec = fm.credentials as Record<string, unknown>;
    const mustBePresent = Object.entries(credSpec)
      .filter(([, decl]) => {
        if (typeof decl !== "object" || decl === null) return true; // shorthand
        const d = decl as Record<string, unknown>;
        if ("default" in d) return false;
        if (d.required === false) return false;
        return true;
      })
      .map(([k]) => k);

    // Look for credentials.json first; fall back to credentials.example.json
    // (templates use .example.json suffix to avoid committing real secrets)
    let credText: string | null = null;
    let credSource = "credentials.json";
    try {
      credText = await readFile(resolve(dir, "credentials.json"), "utf8");
    } catch {
      try {
        credText = await readFile(resolve(dir, "credentials.example.json"), "utf8");
        credSource = "credentials.example.json";
      } catch {}
    }

    if (credText !== null) {
      const cred = JSON.parse(credText) as Record<string, unknown>;
      const stored = Object.keys(cred);

      const missing = mustBePresent.filter((k) => !(k in cred));
      const extra = stored.filter((k) => !(k in credSpec));

      if (missing.length > 0) {
        result.warnings.push(
          `${credSource} missing required keys (no default + required != false): ${missing.join(", ")}`,
        );
      }
      if (extra.length > 0) {
        result.warnings.push(
          `${credSource} has undeclared keys: ${extra.join(", ")}`,
        );
      }
    } else if (mustBePresent.length > 0) {
      result.warnings.push(
        `neither credentials.json nor credentials.example.json found, but required keys exist: ${mustBePresent.join(", ")}`,
      );
    }
  }

  return result;
}

async function listModules(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => resolve(root, e.name));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.error(
      "Usage:\n" +
        "  bun bin/trove-validate.ts <module-dir>     # validate single module\n" +
        "  bun bin/trove-validate.ts --all            # validate all modules in ~/.trove/\n" +
        "  bun bin/trove-validate.ts --library        # validate all library/ entries in this repo",
    );
    process.exit(args.length === 0 ? 1 : 0);
  }

  let modules: string[];
  if (args[0] === "--all") {
    modules = await listModules(resolve(process.env.HOME!, ".trove"));
  } else if (args[0] === "--library") {
    const here = dirname(fileURLToPath(import.meta.url));
    modules = await listModules(resolve(here, "..", "library"));
  } else {
    modules = args.map((a) => resolve(a));
  }

  let errors = 0,
    warnings = 0;
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
  process.exit(errors > 0 ? 1 : 0);
}

main();
