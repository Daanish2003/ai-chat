// PreToolUse (Bash|PowerShell): blocks commands that destroy work or bypass review.
// Exit 2 blocks the call and shows stderr to Claude. The user can still run any
// of these themselves; this only stops Claude doing it on its own.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input.tool_input?.command ?? "";

const rules = [
  [
    /\bgit\s+push\b[^;&|]*\s(--force\b|-f\b|--force-with-lease\b)/,
    "Force-push rewrites shared history.",
  ],
  [
    /\bgit\s+push\b[^;&|]*\s(origin\s+)?(HEAD:)?(main|master)\b/,
    "main changes only through a reviewed PR (/pr).",
  ],
  [/\bgit\s+reset\s+--hard\b/, "reset --hard discards uncommitted work; stash or commit first."],
  [/\bgit\s+clean\s+-[a-z]*f/, "git clean -f deletes untracked files."],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, "This discards every uncommitted change."],
  [/\bgit\s+branch\s+-D\b/, "Deleting an unmerged branch loses its commits."],
  [/--no-verify\b/, "Hooks are the local checks; fix the failure instead of skipping them."],
  [/\bgh\s+secret\s+(set|delete|remove)\b/, "Secrets are changed by a human, not by Claude."],
  [/\bgh\s+workflow\s+run\b/, "Dispatching a workflow can deploy; a human triggers it."],
];

for (const [pattern, reason] of rules) {
  if (pattern.test(command)) {
    process.stderr.write(`Blocked: ${reason} Ask the user to run it if it is really intended.\n`);
    process.exit(2);
  }
}
