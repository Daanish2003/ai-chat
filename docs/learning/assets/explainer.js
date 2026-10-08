// The lesson explainer video: animated SVG scenes, narrated by the browser's built-in voice,
// with a caption and a full transcript (so it works muted and on paper).
//
//   Explainer.mount("#video", { title, width, height, scenes: [{ say, show?, draw(t, A) }] });
//
// `draw(t, A)` returns an SVG inner string for time t (0 → 1) in the scene. A has lerp, ease,
// step(t, from, to) → 0..1, and fade(t, from, to, svg) → svg wrapped with a growing opacity.
(function () {
  const A = {
    lerp: (a, b, t) => a + (b - a) * t,
    ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    step: (t, from, to) => Math.max(0, Math.min(1, (t - from) / (to - from))),
    fade: (t, from, to, svg) => `<g opacity="${A.step(t, from, to).toFixed(3)}">${svg}</g>`,
  };
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  // About 2.6 spoken words a second, plus a pause, so muted playback keeps the same pace.
  const sceneMs = (s) => Math.max(5000, (s.say.split(/\s+/).length / 2.6) * 1000 + 1200);

  function mount(selector, { title, width = 800, height = 300, scenes }) {
    const root = document.querySelector(selector);
    root.classList.add("explainer");
    root.innerHTML = `
      <div class="ex-title">▶ ${esc(title)}</div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"></svg>
      <div class="ex-progress"><div></div></div>
      <div class="ex-caption" aria-live="polite"></div>
      <div class="ex-controls">
        <button class="ex-play" type="button">▶ Play</button>
        <button class="ex-sound" type="button" aria-pressed="true">🔊 Sound on</button>
        ${scenes.map((_, i) => `<button class="ex-chap" type="button" title="Scene ${i + 1}">${i + 1}</button>`).join("")}
      </div>
      <details><summary>Transcript</summary><ol>${scenes.map((s) => `<li>${esc(s.say)}</li>`).join("")}</ol></details>`;
    const svg = root.querySelector("svg");
    const caption = root.querySelector(".ex-caption");
    const bar = root.querySelector(".ex-progress div");
    const play = root.querySelector(".ex-play");
    const sound = root.querySelector(".ex-sound");
    const chaps = [...root.querySelectorAll(".ex-chap")];
    const total = scenes.reduce((n, s) => n + sceneMs(s), 0);
    const startOf = (i) => scenes.slice(0, i).reduce((n, s) => n + sceneMs(s), 0);

    let index = 0,
      elapsed = 0,
      playing = false,
      last = 0,
      soundOn = true;
    const speech = "speechSynthesis" in window ? window.speechSynthesis : null;

    function show(i, t) {
      svg.innerHTML = scenes[i].draw(t, A);
      caption.textContent = scenes[i].show || scenes[i].say;
      chaps.forEach((c, k) => c.classList.toggle("on", k === i));
      bar.style.width = `${(((startOf(i) + t * sceneMs(scenes[i])) / total) * 100).toFixed(2)}%`;
    }
    function say(i) {
      if (!speech) return;
      speech.cancel();
      if (!soundOn || !playing) return;
      const u = new SpeechSynthesisUtterance(scenes[i].say);
      u.rate = 1.02;
      speech.speak(u);
    }
    function frame(now) {
      if (!playing) return;
      elapsed += now - last;
      last = now;
      const len = sceneMs(scenes[index]);
      if (elapsed >= len) {
        if (index === scenes.length - 1) {
          show(index, 1);
          stop();
          return;
        }
        index += 1;
        elapsed = 0;
        say(index);
      }
      show(index, Math.min(1, elapsed / len));
      requestAnimationFrame(frame);
    }
    function start() {
      playing = true;
      play.textContent = "❚❚ Pause";
      last = performance.now();
      say(index);
      requestAnimationFrame(frame);
    }
    function stop() {
      playing = false;
      play.textContent = "▶ Play";
      speech?.cancel();
    }
    play.addEventListener("click", () => {
      if (playing) return stop();
      if (index === scenes.length - 1 && elapsed >= sceneMs(scenes[index]) - 50) {
        index = 0;
        elapsed = 0;
      }
      start();
    });
    sound.addEventListener("click", () => {
      soundOn = !soundOn;
      sound.textContent = soundOn ? "🔊 Sound on" : "🔇 Sound off";
      sound.setAttribute("aria-pressed", String(soundOn));
      if (!soundOn) speech?.cancel();
      else say(index);
    });
    chaps.forEach((c, i) =>
      c.addEventListener("click", () => {
        index = i;
        elapsed = 0;
        show(i, playing ? 0 : 1);
        if (playing) say(i);
      }),
    );
    // The poster: the first scene, fully drawn.
    show(0, 1);
    caption.textContent = "Press Play for a one-minute preview of this lesson.";
  }

  window.Explainer = { mount };
})();
