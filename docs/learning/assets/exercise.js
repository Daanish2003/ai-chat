// In-browser code exercises with instant test feedback.
//
//   Exercise.mount("#ex1", {
//     title: "Write reaches(from, to)",
//     task: "One-line description of the task (HTML allowed).",
//     storageKey: "lesson1-reaches",      // keep it stable so saved code survives edits
//     fnName: "reaches",                   // the function the tests call
//     starter: "function reaches(from, to) { … }",
//     solution: "function reaches(from, to) { … }",
//     tests: [{ name: "plain words with the answer", args: [...], expect: value }],
//     onResult(fn, allPassed) {},          // optional payoff: drive a picture with the learner's fn
//   });
//
// Results land in `.results`, ending in a `.summary` line "N/N passing".
(function () {
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  // Deep equality where object key order doesn't matter.
  const canon = (v) =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canon(v[k])]),
          )
        : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));
  const load = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  };

  function mount(selector, opts) {
    const root = document.querySelector(selector);
    root.classList.add("exercise");
    root.innerHTML = `
      <div class="ex-head"><strong>Try it</strong>${esc(opts.title)}${opts.task ? `<div>${opts.task}</div>` : ""}</div>
      <textarea spellcheck="false" aria-label="Your code"></textarea>
      <div class="bar">
        <button type="button" class="primary run">Run tests</button>
        <button type="button" class="reset">Reset</button>
        <button type="button" class="solution">Show solution</button>
      </div>
      <div class="results" aria-live="polite"></div>`;
    const area = root.querySelector("textarea");
    const results = root.querySelector(".results");
    area.value = load(opts.storageKey) ?? opts.starter;

    area.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: t } = area;
        area.setRangeText("  ", s, t, "end");
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
    });
    area.addEventListener("input", () => save(opts.storageKey, area.value));

    function run() {
      let fn;
      try {
        fn = new Function(`${area.value}\nreturn ${opts.fnName};`)();
        if (typeof fn !== "function") throw new Error(`${opts.fnName} is not a function`);
      } catch (err) {
        results.innerHTML = `<div class="t fail">Your code doesn't run: ${esc(err.message)}</div><div class="summary">0/${opts.tests.length} passing</div>`;
        return;
      }
      let passed = 0;
      const rows = opts.tests.map((t) => {
        let got, err;
        try {
          got = fn(...t.args);
        } catch (e) {
          err = e;
        }
        const ok = !err && same(got, t.expect);
        if (ok) passed += 1;
        const detail = ok
          ? ""
          : `<div class="got">${err ? `threw: ${esc(err.message)}` : `got ${esc(show(got))}, want ${esc(show(t.expect))}`}</div>`;
        return `<div class="t ${ok ? "pass" : "fail"}">${esc(t.name)}${detail}</div>`;
      });
      const all = passed === opts.tests.length;
      results.innerHTML = `${rows.join("")}<div class="summary">${passed}/${opts.tests.length} passing${all ? " 🎉" : ""}</div>`;
      opts.onResult?.(fn, all);
    }

    root.querySelector(".run").addEventListener("click", run);
    root.querySelector(".reset").addEventListener("click", () => {
      if (!confirm("Replace your code with the starter?")) return;
      area.value = opts.starter;
      save(opts.storageKey, area.value);
      results.innerHTML = "";
    });
    root.querySelector(".solution").addEventListener("click", () => {
      if (!confirm("Replace your code with the solution? Try it yourself first.")) return;
      area.value = opts.solution;
      save(opts.storageKey, area.value);
      run();
    });
  }

  window.Exercise = { mount };
})();
