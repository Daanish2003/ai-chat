// PreToolUse (Edit|Write|MultiEdit): blocks edits that must not be made by hand.
// Exit 2 blocks the tool call and shows stderr to Claude.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = relative(root, resolve(root, filePath)).replaceAll("\\", "/");

function block(reason) {
  process.stderr.write(`Blocked: ${rel}. ${reason}\n`);
  process.exit(2);
}

if (rel === "pnpm-lock.yaml") {
  block("The lockfile is generated. Change package.json and run pnpm install.");
}
// .env.schema (varlock) and .env.example hold no secrets; every other .env file may.
if (/(^|\/)\.env(\.|$)/.test(rel) && !/\.env\.(schema|example)$/.test(rel)) {
  block("Env files hold secrets. Edit .env.schema and tell the user which value to set.");
}
