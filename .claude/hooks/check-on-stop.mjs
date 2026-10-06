// Stop: when code changed, runs the typecheck and lint on the changed files before
// Claude finishes. Exit 2 keeps Claude working with the failures on stderr.
// `stop_hook_active` is set when Claude is already continuing because of this
// hook; it then gives up rather than looping. Changed files come from git, so
// outside a git repository the hook does nothing.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// -z: NUL-separated, unquoted paths. A rename entry is followed by its old path.
let entries;
try {
  entries = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\0");
} catch {
  process.exit(0);
}
const changed = [];
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  if (entry.length < 4) continue;
  if (entry[0] === "R" || entry[0] === "C") i++;
  const path = entry.slice(3);
  if (/\.(m?[jt]sx?|cjs)$/.test(path) && existsSync(join(root, path))) changed.push(path);
}
if (changed.length === 0) process.exit(0);

const failures = [];

// A fixed command string, so a shell is safe here; Turbo replays unchanged packages from cache.
const types = spawnSync("pnpm check-types", { cwd: root, encoding: "utf8", shell: true });
if (types.status !== 0) {
  const errors = `${types.stdout}${types.stderr}`
    .split("\n")
    .filter((line) => /error TS\d+/.test(line))
    .slice(0, 30)
    .join("\n");
  failures.push(`pnpm check-types failed:\n${errors}`);
}

// The tool's own entry point, run without a shell: the paths come from the working tree.
const lint = spawnSync(
  process.execPath,
  [join(root, "node_modules", "oxlint", "bin", "oxlint"), "--deny-warnings", ...changed],
  { cwd: root, encoding: "utf8" },
);
if (lint.status !== 0) failures.push(`oxlint failed:\n${lint.stdout}${lint.stderr}`);

if (failures.length > 0) {
  process.stderr.write(`Fix before finishing.\n\n${failures.join("\n\n")}\n`);
  process.exit(2);
}
