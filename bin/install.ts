/**
 * trove install — copy library modules into `~/.trove/`. Headless equivalent
 * of "click Install in the Web UI." Credentials are not prompted in TTY
 * (multiline / password input is too fiddly there); the user fills them via
 * `trove ui` or `$EDITOR` after the install copies the module template.
 */

import { resolve, basename } from "node:path";
import { homedir } from "node:os";
import { getInstalledModule, getLibraryItem, installFromLibrary, listLibrary, TROVE_HOME } from "../ui/modules";

export async function runInstall(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.error(
      "Usage:\n" +
        "  trove install <module>...     # install one or more named modules from the bundled library\n" +
        "  trove install --list          # list every available library module\n" +
        "  trove install --all           # install every library module (rarely what you want)\n" +
        "  trove install <m> --force     # re-copy the library's module.md over the installed one\n" +
        "                                # (preserves credentials.json and any other user-added files)\n\n" +
        "After install: fill credentials via `trove ui` or by editing ~/.trove/<module>/credentials.json directly.",
    );
    return args.length === 0 ? 1 : 0;
  }

  if (args[0] === "--list") {
    const library = await listLibrary();
    const installed = new Set((await listInstalledNames()));
    console.log(`\n${library.length} modules available in library:\n`);
    for (const m of library) {
      const status = installed.has(m.name) ? "\x1b[90m· installed\x1b[0m" : "\x1b[32m+ available\x1b[0m";
      const cat = m.frontmatter.category ? `\x1b[90m${m.frontmatter.category}\x1b[0m` : "";
      console.log(`  ${status}  ${m.name.padEnd(28)}  ${cat}`);
    }
    console.log("");
    return 0;
  }

  let targets: string[];
  const force = args.includes("--force");
  const filtered = args.filter((a) => a !== "--force");

  if (filtered[0] === "--all") {
    const library = await listLibrary();
    targets = library.map((m) => m.name);
  } else {
    targets = filtered;
  }

  let installed = 0;
  let skipped = 0;
  let errors = 0;

  for (const name of targets) {
    const lib = await getLibraryItem(name);
    if (!lib) {
      console.log(`\x1b[31m✗\x1b[0m ${name}: not in library`);
      errors++;
      continue;
    }
    const existing = await getInstalledModule(name);
    if (existing && !force) {
      console.log(`\x1b[90m·\x1b[0m ${name}: already installed at ${shortenHome(existing.dir)} (use --force to overwrite)`);
      skipped++;
      continue;
    }
    try {
      const mod = await installFromLibrary(name);
      const credCount = Object.keys(mod.frontmatter.credentials ?? {}).length;
      const credHint = credCount > 0 ? ` (declares ${credCount} credential${credCount === 1 ? "" : "s"})` : "";
      console.log(`\x1b[32m✓\x1b[0m ${name} → ${shortenHome(mod.dir)}${credHint}`);
      installed++;
    } catch (e) {
      console.log(`\x1b[31m✗\x1b[0m ${name}: ${(e as Error).message}`);
      errors++;
    }
  }

  console.log(
    `\n${installed} installed · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`,
  );
  if (installed > 0) {
    console.log(`\nNext: run \x1b[1mtrove ui\x1b[0m to fill credentials, or edit ~/.trove/<module>/credentials.json directly.`);
  }
  return errors > 0 ? 1 : 0;
}

async function listInstalledNames(): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(TROVE_HOME, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

function shortenHome(p: string): string {
  const home = process.env.HOME ?? homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}
