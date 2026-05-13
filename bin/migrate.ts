/**
 * trove migrate — move legacy multiline-string credentials into the files/
 * subdirectory expected by `type: file` schema (SPEC §2.3).
 *
 * Idempotent: already-migrated fields are skipped silently.
 */

import { resolve, basename } from "node:path";
import { homedir } from "node:os";
import { fileFieldPath, isFileField, migrateField } from "../ui/credentials";
import { listDirs, readModuleMd } from "../ui/modules";
import type { CredentialField } from "../ui/modules";

export async function runMigrate(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.error(
      "Usage:\n" +
        "  trove migrate <module>    # migrate one module from ~/.trove/<module>\n" +
        "  trove migrate --all       # migrate every module in ~/.trove/\n\n" +
        "Migration is idempotent: already-migrated fields are skipped.",
    );
    return args.length === 0 ? 1 : 0;
  }

  let moduleDirs: string[];
  if (args[0] === "--all") {
    moduleDirs = await listDirs(resolve(process.env.HOME ?? homedir(), ".trove"));
  } else {
    moduleDirs = args.map((a) => {
      if (a.includes("/")) return resolve(a);
      return resolve(process.env.HOME ?? homedir(), ".trove", a);
    });
  }

  let totalMigrated = 0;
  let totalSkipped = 0;
  let errors = 0;

  for (const dir of moduleDirs) {
    const name = basename(dir);
    const { fm, error } = await readModuleMd(dir).catch(() => ({ fm: null as never, error: "no module.md" }));
    if (error || !fm) {
      console.log(`\n\x1b[31m✗\x1b[0m ${name}: ${error ?? "no readable module.md"}`);
      errors++;
      continue;
    }
    const credSpec = (fm.credentials ?? {}) as Record<string, CredentialField>;
    const fileFields = Object.entries(credSpec).filter(([, d]) => isFileField(d ?? {}));
    if (fileFields.length === 0) continue;

    console.log(`\n• ${name}`);
    for (const [key, decl] of fileFields) {
      try {
        const outcome = await migrateField(dir, key, decl);
        const path = fileFieldPath(dir, key, decl);
        if (outcome === "migrated") {
          console.log(`  \x1b[32m✓ migrated\x1b[0m ${key} → files/${basename(path)}`);
          totalMigrated++;
        } else if (outcome === "already-file") {
          console.log(`  \x1b[90m· already file\x1b[0m ${key}`);
          totalSkipped++;
        } else if (outcome === "no-value") {
          console.log(`  \x1b[33m⚠ no value\x1b[0m ${key} — fill via \`trove ui\` after migrate`);
          totalSkipped++;
        }
      } catch (e) {
        console.log(`  \x1b[31m✗ failed\x1b[0m ${key}: ${(e as Error).message}`);
        errors++;
      }
    }
  }

  console.log(
    `\n${totalMigrated} migrated · ${totalSkipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`,
  );
  return errors > 0 ? 1 : 0;
}
