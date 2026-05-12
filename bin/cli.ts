#!/usr/bin/env node
/**
 * Trove CLI entry — dispatches to `validate` or `ui` subcommands.
 */

import pkg from "../package.json" with { type: "json" };
import { runValidate } from "./trove-validate";
import { startServer } from "../ui/server";

const HELP = `Trove — local-first resource manager for AI coding agents

Usage:
  trove ui                       Start local Web UI at http://127.0.0.1:7821
  trove validate <module-dir>    Check a module against the Trove spec
  trove validate --all           Check every module under ~/.trove/
  trove validate --library       Check every bundled library/ module

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

  if (cmd === "ui") {
    startServer();
    return new Promise(() => {});
  }

  console.error(`unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
