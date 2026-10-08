// The package map of ai-chat: the seven workspace packages and who imports whom, measured from
// the `import … from "@ai-chat/…"` lines in each package's src (October 2026, branch main).
// Lessons reuse it to show where a step of the flow happens.
//
//   PackageMap.render("#map", { highlight: "api", onPick(id) {} });  // returns { select(id) }
(function () {
  const PACKAGES = [
    {
      id: "web",
      label: "apps/web",
      floor: 0,
      job: "The host app. Routes, server entry points and the wiring that joins every package.",
    },
    {
      id: "chat-react",
      label: "@ai-chat/chat-react",
      floor: 1,
      job: "The chat UI as React components. It doesn't know the host app's router.",
    },
    {
      id: "chat-core",
      label: "@ai-chat/chat-core",
      floor: 2,
      job: "Client logic with no React: pure functions such as branchFrom and toUIMessages.",
    },
    {
      id: "ui",
      label: "@ai-chat/ui",
      floor: 2,
      side: true,
      job: "Generic UI parts (shadcn, prompt-kit). It knows nothing about chat.",
    },
    {
      id: "api",
      label: "@ai-chat/api",
      floor: 3,
      job: "All server logic: oRPC routers, the chat run, credentials, search and sharing.",
    },
    { id: "auth", label: "@ai-chat/auth", floor: 4, job: "Better Auth: users and sessions." },
    {
      id: "db",
      label: "@ai-chat/db",
      floor: 5,
      job: "Drizzle tables and the stored shape of Message parts. It imports nothing.",
    },
  ];
  /** from → the packages it imports. */
  const DEPS = {
    web: ["chat-react", "api", "auth", "db", "ui"],
    "chat-react": ["chat-core", "api", "db", "ui"],
    "chat-core": ["api", "db"],
    ui: [],
    api: ["auth", "db"],
    auth: ["db"],
    db: [],
  };

  const X = 250,
    W = 210,
    H = 44,
    cy = (f) => 38 + 66 * f,
    top = (f) => 16 + 66 * f;
  const byId = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));
  // Skip edges run down lanes on the left: [lane x, exit dy, entry dy].
  const LANES = {
    "web>db": [70, -10, -12],
    "web>auth": [90, 0, -6],
    "web>api": [110, 10, -10],
    "chat-react>db": [135, -6, -4],
    "chat-react>api": [155, 6, 0],
    "chat-core>db": [185, 0, 4],
    "api>db": [215, 10, 12],
  };
  const UI_LANES = { web: 640, "chat-react": 590 };

  function points(from, to) {
    const a = byId[from],
      b = byId[to];
    if (to === "ui")
      return [
        [X + W, cy(a.floor)],
        [UI_LANES[from], cy(a.floor)],
        [UI_LANES[from], top(b.floor)],
      ];
    const lane = LANES[`${from}>${to}`];
    if (!lane)
      return [
        [X + W / 2, top(a.floor) + H],
        [X + W / 2, top(b.floor)],
      ];
    const [lx, out, inn] = lane;
    return [
      [X, cy(a.floor) + out],
      [lx, cy(a.floor) + out],
      [lx, cy(b.floor) + inn],
      [X, cy(b.floor) + inn],
    ];
  }

  function draw(selected) {
    const D = window.Diagrams;
    const edges = [];
    for (const [from, tos] of Object.entries(DEPS))
      for (const to of tos) edges.push({ from, to, on: from === selected, into: to === selected });
    // Faint edges first, so the highlighted ones sit on top.
    edges.sort((e, f) => Number(e.on || e.into) - Number(f.on || f.into));
    const lines = edges.map((e) =>
      D.route(points(e.from, e.to), {
        tone: e.on ? "accent" : e.into ? "blue" : "faint",
        width: e.on || e.into ? 2.4 : 1.4,
        id: `${e.from}>${e.to}`,
      }),
    );
    const boxes = PACKAGES.map((p) => {
      const x = p.side ? 540 : X,
        w = p.side ? 180 : W;
      const tone = p.id === selected ? "accent" : "";
      return D.box(x, top(p.floor), w, H, p.label, {
        tone,
        mono: true,
        id: p.id,
        extra: "clickable",
      });
    });
    const legend = selected
      ? D.text(20, 392, "red = imports   blue = imported by", { tone: "muted", size: 12 })
      : D.text(20, 392, "Click a package to see its imports", { tone: "muted", size: 12 });
    return lines.join("") + boxes.join("") + legend;
  }

  function render(selector, { highlight = null, onPick } = {}) {
    const el = typeof selector === "string" ? document.querySelector(selector) : selector;
    const holder = document.createElement("div");
    el.prepend(holder);
    const select = (id) => {
      holder.innerHTML = window.Diagrams.svg(760, 404, draw(id), {
        label: "The seven ai-chat packages and their imports",
      });
      holder.querySelectorAll("[data-id]").forEach((g) =>
        g.addEventListener("click", () => {
          select(g.dataset.id);
          onPick?.(g.dataset.id);
        }),
      );
    };
    select(highlight);
    return { select };
  }

  const importedBy = (id) => Object.keys(DEPS).filter((k) => DEPS[k].includes(id));
  window.PackageMap = { PACKAGES, DEPS, byId, importedBy, render, draw };
})();
