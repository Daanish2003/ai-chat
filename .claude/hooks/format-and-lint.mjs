// PostToolUse (Edit|Write|MultiEdit): formats the edited file, applies safe lint
// fixes, and reports remaining lint errors back to Claude (exit 2 shows stderr).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

// The tools' own entry points, run without a shell: the file path comes from tool
// input and must not be interpreted by one.
const run = (tool, args) =>
  spawnSync(process.execPath, [join(root, "node_modules", tool, "bin", tool), ...args], {
    cwd: root,
    encoding: "utf8",
  });

if (/\.(m?[jt]sx?|cjs|json|jsonc|css|md|ya?ml)$/.test(filePath)) {
  run("oxfmt", ["--no-error-on-unmatched-pattern", filePath]);
}

if (/\.(m?[jt]sx?|cjs)$/.test(filePath)) {
  const lint = run("oxlint", ["--fix", "--deny-warnings", filePath]);
  if (lint.status !== 0) {
    process.stderr.write(`Lint errors remain in ${filePath}:\n${lint.stdout}${lint.stderr}`);
    process.exit(2);
  }
}
