// Checks a lesson in a real browser (headless Edge on Windows) over the DevTools protocol:
// waits for load (and the #lab-out panel, if any), clicks every "Show solution" button so each
// exercise runs its reference solution against its tests, then prints the results, a few counts,
// and any console errors or exceptions.
//
//   node .claude/skills/teach/check-lesson.mjs lessons/0003-decode-a-real-frame.html
//
// Every exercise should report "N/N passing", BUDGET should end in "ok", and ERRORS should be "none".
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const EDGE = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = Number(process.env.PORT) || 9300 + Math.floor(Math.random() * 600);
const url = pathToFileURL(resolve(process.argv[2])).href;
const browser = spawn(
  EDGE,
  [
    "--headless=new",
    "--no-first-run",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpdir()}/check-lesson-profile-${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Runtime.exceptionThrown")
    errors.push(
      "EXCEPTION " +
        (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text),
    );
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")
    errors.push("CONSOLE " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))
    .result?.result?.value;
const until = async (expr, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await ev(expr);
    if (v) return v;
    await sleep(400);
  }
  return null;
};

await send("Runtime.enable");
await send("Page.navigate", { url });
await until(`document.readyState === "complete"`);
const lab = await until(
  `(() => { const el = document.getElementById("lab-out"); if (!el) return "(no lab)"; const t = el.textContent; return /fed|rror|Couldn't|Could not|ready|decoded/i.test(t) ? t : null; })()`,
);
console.log("LAB:", lab);
await ev(
  `window.confirm = () => true; [...document.querySelectorAll(".exercise .bar button")].filter(b => b.textContent.includes("Show solution")).forEach(b => b.click()); true`,
);
const hasExercises = await ev(`document.querySelectorAll(".exercise").length > 0`);
const results = !hasExercises
  ? "RESULTS: (no exercises)"
  : await until(
      `(() => { const r = [...document.querySelectorAll(".exercise .results")]; return r.every(x => x.querySelector(".summary")) ? r.map((x, i) => "Exercise " + (i + 1) + ":\\n" + x.innerText).join("\\n") : null; })()`,
      180000,
    );
console.log(results ?? "RESULTS: timed out waiting for every exercise to finish");
console.log(
  "counts:",
  await ev(
    `JSON.stringify({ exercises: document.querySelectorAll(".exercise").length, quizzes: document.querySelectorAll(".quiz").length, diagrams: document.querySelectorAll("svg.diagram").length, namesButton: !!document.querySelector(".names-btn"), takeaways: !!document.querySelector(".takeaways"), explainerScenes: document.querySelectorAll(".explainer .ex-chap").length })`,
  ),
);
// Budget from LESSON-STYLE.md. "Reading text" = what the learner must read: everything in <main> except
// code, quizzes, exercises, the video, pictures, "Go deeper", takeaways and the footer.
console.log(
  "BUDGET:",
  await ev(`(() => {
  const m = document.querySelector("main").cloneNode(true);
  m.querySelectorAll("script, pre, textarea, svg, canvas, .exercise, .quiz, .explainer, details, .takeaways, .footer-box, .kicker, .meta, .words").forEach((e) => e.remove());
  const words = (s) => (s.match(/\\S+/g) || []).length;
  const prose = words(m.textContent);
  const main = document.querySelector("main");
  const sections = [...main.querySelectorAll(":scope > h2")].filter((h) => !/words you|warm-up|try it/i.test(h.textContent)).length;
  const visuals = main.querySelectorAll("figure:not(.explainer), .tlv, .win").length;
  const longCaps = [...main.querySelectorAll("figcaption")].filter((c) => words(c.textContent) > 20).length;
  const newWords = main.querySelectorAll(".words dt").length;
  const quizzes = main.querySelectorAll(".quiz").length, exercises = main.querySelectorAll(".exercise").length;
  const scenes = main.querySelectorAll(".explainer .ex-chap").length;
  const bad = [];
  if (prose > 900) bad.push("reading text " + prose + " words > 900");
  if (sections > 4) bad.push(sections + " sections > 4");
  if (newWords > 4) bad.push(newWords + " new words > 4");
  if (quizzes > 3) bad.push(quizzes + " quizzes > 3");
  if (exercises > 2) bad.push(exercises + " exercises > 2");
  if (visuals && prose / visuals > 150) bad.push(Math.round(prose / visuals) + " words per picture > 150");
  if (longCaps) bad.push(longCaps + " captions > 20 words");
  if (scenes && (scenes < 4 || scenes > 6)) bad.push(scenes + " video scenes, want 4-6");
  return "reading " + prose + " words, " + sections + " sections, " + visuals + " pictures/toys (" + (visuals ? Math.round(prose / visuals) : "-") + " words each), " +
    newWords + " new words, " + quizzes + " quizzes, " + exercises + " exercises → " + (bad.length ? "OVER: " + bad.join("; ") : "ok");
})()`),
);
console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
ws.close();
browser.kill();
process.exit(0);
