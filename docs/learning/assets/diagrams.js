// SVG string helpers shared by lesson figures and explainer videos. Every helper returns a
// string; `Diagrams.svg` wraps them. Colours come from classes in style.css (tone = accent,
// ok, warn, blue, faint), so pictures follow light and dark mode.
(function () {
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const cls = (base, tone, extra = "") => [base, tone, extra].filter(Boolean).join(" ");

  function svg(width, height, inner, { label = "", className = "diagram" } = {}) {
    return `<svg class="${className}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
  }

  /** A rounded box with a centred label and an optional second line (`sub`). */
  function box(
    x,
    y,
    w,
    h,
    label,
    { tone = "", sub = "", mono = false, opacity = 1, id = "", extra = "" } = {},
  ) {
    const cy = sub ? y + h / 2 - 7 : y + h / 2;
    return `<g${id ? ` data-id="${esc(id)}"` : ""} opacity="${opacity}" class="${extra}">
      <rect class="${cls("d-box", tone)}" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>
      <text class="${cls("d-text", "", mono ? "mono" : "")}" x="${x + w / 2}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-weight="600">${esc(label)}</text>
      ${sub ? `<text class="d-text muted" x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" dominant-baseline="middle" font-size="12">${esc(sub)}</text>` : ""}
    </g>`;
  }

  function text(
    x,
    y,
    s,
    { tone = "", size = 14, anchor = "start", weight = 400, mono = false, opacity = 1 } = {},
  ) {
    return `<text class="${cls("d-text", tone, mono ? "mono" : "")}" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" dominant-baseline="middle" opacity="${opacity}">${esc(s)}</text>`;
  }

  function head(x, y, angle, tone) {
    const a = 9,
      b = 4.5;
    const p = (dx, dy) => [
      x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
    const pts = [p(0, 0), p(-a, -b), p(-a, b)]
      .map((q) => q.map((n) => n.toFixed(1)).join(","))
      .join(" ");
    return `<polygon class="${cls("d-head", tone)}" points="${pts}"/>`;
  }

  /** A straight arrow from (x1,y1) to (x2,y2). */
  function arrow(
    x1,
    y1,
    x2,
    y2,
    { tone = "", dashed = false, label = "", width = 1.6, opacity = 1 } = {},
  ) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - 8 * Math.cos(ang),
      ey = y2 - 8 * Math.sin(ang);
    const mid = label ? text((x1 + x2) / 2 + 6, (y1 + y2) / 2, label, { tone, size: 12 }) : "";
    return `<g opacity="${opacity}"><line class="${cls("d-line", tone, dashed ? "dashed" : "")}" stroke-width="${width}" x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/>${head(x2, y2, ang, tone)}${mid}</g>`;
  }

  /** An arrow along a polyline of [x,y] points; the head sits on the last point. */
  function route(points, { tone = "", dashed = false, width = 1.6, opacity = 1, id = "" } = {}) {
    const n = points.length;
    const [px, py] = points[n - 2],
      [x, y] = points[n - 1];
    const ang = Math.atan2(y - py, x - px);
    const pts = points.slice(0, -1).concat([[x - 8 * Math.cos(ang), y - 8 * Math.sin(ang)]]);
    const d = pts.map(([a, b], i) => `${i ? "L" : "M"}${a},${b}`).join(" ");
    return `<g${id ? ` data-edge="${esc(id)}"` : ""} opacity="${opacity}"><path class="${cls("d-line", tone, dashed ? "dashed" : "")}" stroke-width="${width}" d="${d}"/>${head(x, y, ang, tone)}</g>`;
  }

  function dot(x, y, r = 6, { tone = "" } = {}) {
    return `<circle class="${cls("d-dot", tone)}" cx="${x}" cy="${y}" r="${r}"/>`;
  }

  /** Renders an SVG string into the element matching `selector`. */
  function render(selector, svgString) {
    const el = typeof selector === "string" ? document.querySelector(selector) : selector;
    el.insertAdjacentHTML("afterbegin", svgString);
    return el.querySelector("svg");
  }

  window.Diagrams = { svg, box, text, arrow, route, dot, render, esc };
})();
