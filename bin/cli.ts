#!/usr/bin/env node
/**
 * Trove CLI entry — dispatches to `validate` or `ui` subcommands.
 */

import pkg from "../package.json" with { type: "json" };
import { runValidate } from "./trove-validate";
import { runMigrate } from "./migrate";
import { runInstall } from "./install";
import { startServer } from "../ui/server";

const HELP = `Trove — local-first resource manager for AI coding agents

Usage:
  trove ui                       Start local Web UI at http://127.0.0.1:7821
  trove install <module>...      Copy library modules into ~/.trove/
  trove install --list           Show every available library module
  trove validate <module-dir>    Check a module against the Trove spec (read-only)
  trove validate --all           Check every module under ~/.trove/
  trove validate --library       Check every bundled library/ module
  trove migrate <module>         Relocate legacy multiline creds → files/ (SPEC §2.3)
  trove migrate --all            Migrate every module under ~/.trove/

Flags:
  -h, --help                     Show this help
  -v, --version                  Print version
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === "-v" || cmd === "--version" || cmd === "version") {
    console.log(pkg.version);
    return 0;
  }

  if (cmd === "validate") return runValidate(rest);
  if (cmd === "migrate") return runMigrate(rest);
  if (cmd === "install") return runInstall(rest);

  if (cmd === "ui") {
    startServer();
    return new Promise(() => {});
  }

  console.error(`unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
