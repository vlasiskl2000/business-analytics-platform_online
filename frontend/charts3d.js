/* =========================================================
   charts3d.js  (ES module, Three.js from CDN via importmap)

   Interactive 3D charts that show their data:
     - value label above every bar (thinned out when crowded)
     - category label on the floor under every bar
     - hover tooltip, click / arrow keys to select a bar
     - a side panel with summary stats + the selected bar's details
     - toolbar: auto-rotate, reset view, page specific toggles

   A chart is declared in the page as an empty section:
       <section class="card" data-chart3d="monthly"></section>
   and is filled from `ba:*` events that app.js dispatches
   (the last payload is also kept in window.__ba[event]).

   Everything except the WebGL drawing is plain HTML, so the panel
   and labels keep working when Three.js / WebGL is unavailable.
   ========================================================= */

let THREE = null;
try {
    THREE = await import("three");
} catch (error) {
    console.warn("[charts3d] Three.js could not be loaded - 3D view disabled.", error);
}

const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const cache = (window.__ba = window.__ba || {});

/* ---------------------------------------------------------
   Colours + formatting helpers
   --------------------------------------------------------- */
const C = {
    violet: 0x7c6cf0, cyan: 0x22d3ee, pink: 0xf472b6, green: 0x34d399, amber: 0xfbbf24,
    rose: 0xfb7185, red: 0xef4444, orange: 0xf97316, blue: 0x60a5fa, indigo: 0x5b6cf0
};
const PALETTE = [C.violet, C.cyan, C.pink, C.green, C.amber, C.blue, C.rose, C.indigo];

function lighten(hex, t) {
    const f = (c) => Math.round(c + (255 - c) * t);
    return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255);
}
const css = (hex) => "#" + hex.toString(16).padStart(6, "0");

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const num = (v) => nf0.format(Math.round(Number(v) || 0));
const eur = (v) => {
    const n = Math.round(Number(v) || 0);
    return (n < 0 ? "-€" : "€") + nf0.format(Math.abs(n));
};
function eurC(v) {
    v = Number(v) || 0;
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (a >= 1e9) return s + "€" + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e7) return s + "€" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e6) return s + "€" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return s + "€" + (a / 1e3).toFixed(1) + "k";
    return s + "€" + nf0.format(Math.round(a));
}
const pct1 = (v) => (Number(v) || 0).toFixed(1) + "%";
const sgn = (v) => {
    v = Number(v) || 0;
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
};
const tone = (v) => (Number(v) >= 0 ? "up" : "down");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const idxMax = (arr, fn) => arr.reduce((b, x, i) => (fn(x) > fn(arr[b]) ? i : b), 0);
const idxMin = (arr, fn) => arr.reduce((b, x, i) => (fn(x) < fn(arr[b]) ? i : b), 0);

/* ---------------------------------------------------------
   Adapters: turn the page's data into rows of bars.
   row = { label, bars:[{v,h,c1,c2,name}], top, info:[[k,v,tone]], band?:{lo,hi}, flag? }
   --------------------------------------------------------- */
const ADAPTERS = {

    /* ---- Overview: monthly revenue + profit ---- */
    monthly: {
        events: { "ba:monthly": "monthly" },
        title: "3D Revenue Skyline",
        sub: "Monthly revenue and profit as an interactive 3D city",
        legend: [{ c: C.violet, t: "Revenue" }, { c: C.green, t: "Profit" }],
        layout: "frontback",
        empty: "No monthly data to display yet.",
        build(d) {
            const m = d.monthly;
            if (!Array.isArray(m) || !m.length) return null;
            const rows = m.map((r) => ({
                label: String(r.date),
                bars: [
                    { v: r.revenue, h: Math.max(0, r.revenue), c1: C.violet, c2: C.cyan, name: "Revenue" },
                    { v: r.profit, h: Math.abs(r.profit), c1: r.profit >= 0 ? C.green : C.rose, c2: lighten(r.profit >= 0 ? C.green : C.rose, 0.25), name: "Profit" }
                ],
                top: eurC(r.revenue),
                info: [
                    ["Revenue", eur(r.revenue)],
                    ["Cost", eur(r.cost)],
                    ["Profit", eur(r.profit), r.profit < 0 ? "down" : ""],
                    ["Margin", r.revenue ? pct1((r.profit / r.revenue) * 100) : "-"],
                    ["Units", num(r.units)],
                    ["vs previous month", sgn(r.growth_percent), tone(r.growth_percent)]
                ]
            }));
            const peak = idxMax(m, (x) => x.revenue);
            const avg = m.reduce((s, x) => s + x.revenue, 0) / m.length;
            const stats = [
                { k: "Peak month", v: m[peak].date, s: eurC(m[peak].revenue) },
                { k: "Average / month", v: eurC(avg), s: m.length + " months" }
            ];
            if (m.length > 1) {
                const g = m.slice(1);
                const best = idxMax(g, (x) => x.growth_percent);
                const worst = idxMin(g, (x) => x.growth_percent);
                stats.push({ k: "Best growth", v: sgn(g[best].growth_percent), s: g[best].date, t: "up" });
                stats.push({ k: "Worst growth", v: sgn(g[worst].growth_percent), s: g[worst].date, t: "down" });
            }
            return { rows, stats, sel: peak };
        }
    },

    /* ---- Sales: products / regions by metric ---- */
    sales: {
        events: { "ba:products": "products", "ba:regions": "regions" },
        title: "3D Product & Region Explorer",
        sub: "Compare products or regions on any metric - click a bar for details",
        legend: [],
        layout: "single",
        state: { entity: "products", metric: "revenue" },
        toggles: [
            { group: "entity", label: "Group by", options: [["products", "Products"], ["regions", "Regions"]] },
            { group: "metric", label: "Metric", options: [["revenue", "Revenue"], ["profit", "Profit"], ["units", "Units"], ["margin", "Margin"]] }
        ],
        empty: "No data for this selection yet.",
        build(d, s) {
            const arr = d[s.entity];
            if (!Array.isArray(arr) || !arr.length) return null;
            const key = s.entity === "products" ? "product" : "region";
            const money = s.metric === "revenue" || s.metric === "profit";
            const short = s.metric === "units" ? num : s.metric === "margin" ? pct1 : eurC;
            const full = s.metric === "units" ? num : s.metric === "margin" ? pct1 : eur;
            const name = { revenue: "Revenue", profit: "Profit", units: "Units", margin: "Margin" }[s.metric];
            const totalRev = arr.reduce((t, r) => t + (r.revenue || 0), 0);
            const rows = arr.map((r, i) => {
                const col = PALETTE[i % PALETTE.length];
                return {
                    label: String(r[key]),
                    bars: [{ v: r[s.metric], h: Math.max(0, r[s.metric]), c1: col, c2: lighten(col, 0.4), name }],
                    top: short(r[s.metric]),
                    info: [
                        ["Revenue", eur(r.revenue)],
                        ["Cost", eur(r.cost)],
                        ["Profit", eur(r.profit), r.profit < 0 ? "down" : ""],
                        ["Margin", pct1(r.margin)],
                        ["Units", num(r.units)],
                        ["Share of revenue", totalRev ? pct1((r.revenue / totalRev) * 100) : "-"]
                    ]
                };
            });
            const hi = idxMax(arr, (x) => x[s.metric]);
            const lo = idxMin(arr, (x) => x[s.metric]);
            const stats = [
                { k: "Leader", v: String(arr[hi][key]), s: short(arr[hi][s.metric]) },
                { k: "Lowest", v: String(arr[lo][key]), s: short(arr[lo][s.metric]) }
            ];
            if (money || s.metric === "units") {
                const tot = arr.reduce((t, r) => t + (r[s.metric] || 0), 0);
                stats.push({ k: "Total", v: short(tot), s: arr.length + " " + s.entity });
                stats.push({ k: "Leader share", v: tot ? pct1((arr[hi][s.metric] / tot) * 100) : "-", s: "of " + name.toLowerCase() });
            } else {
                const rev = arr.reduce((t, r) => t + (r.revenue || 0), 0);
                const pro = arr.reduce((t, r) => t + (r.profit || 0), 0);
                stats.push({ k: "Overall margin", v: rev ? pct1((pro / rev) * 100) : "-", s: arr.length + " " + s.entity });
                stats.push({ k: "Spread", v: (arr[hi].margin - arr[lo].margin).toFixed(1) + " pp", s: "leader vs lowest" });
            }
            return { rows, stats, sel: hi };
        }
    },

    /* ---- Forecast: actual vs forecast with confidence band ---- */
    forecast: {
        events: { "ba:forecast": "fc" },
        title: "3D Forecast Outlook",
        sub: "Recent actual revenue and the forecast with its confidence range",
        legend: [{ c: C.violet, t: "Actual" }, { c: C.amber, t: "Forecast" }, { c: C.orange, t: "Confidence range" }],
        layout: "single",
        empty: "No forecast available yet.",
        build(d) {
            const f = d.fc;
            if (!f) return null;
            const histAll = f.historical || [];
            const hist = histAll.slice(-12);
            const fc = f.forecast || [];
            if (!hist.length && !fc.length) return null;
            const last = hist.length ? hist[hist.length - 1].revenue : 0;
            const rows = hist.map((h) => ({
                label: String(h.date),
                bars: [{ v: h.revenue, h: Math.max(0, h.revenue), c1: C.violet, c2: C.cyan, name: "Actual" }],
                top: eurC(h.revenue),
                info: [["Actual revenue", eur(h.revenue)]]
            }));
            fc.forEach((p) => {
                const vs = last ? ((p.revenue - last) / last) * 100 : 0;
                rows.push({
                    label: String(p.date),
                    bars: [{ v: p.revenue, h: Math.max(0, p.revenue), c1: C.amber, c2: C.pink, name: "Forecast" }],
                    band: { lo: Math.max(0, p.lower_bound), hi: Math.max(0, p.upper_bound) },
                    top: eurC(p.revenue),
                    info: [
                        ["Forecast revenue", eur(p.revenue)],
                        ["Lower bound", eur(p.lower_bound)],
                        ["Upper bound", eur(p.upper_bound)],
                        ["vs last actual", sgn(vs), tone(vs)]
                    ]
                });
            });
            const stats = [{ k: "Last actual", v: eurC(last), s: hist.length ? hist[hist.length - 1].date : "-" }];
            if (fc.length) {
                const n0 = fc[0];
                const g = last ? ((n0.revenue - last) / last) * 100 : 0;
                stats.push({ k: "Next forecast", v: eurC(n0.revenue), s: n0.date });
                stats.push({ k: "Expected change", v: sgn(g), s: "vs last actual", t: tone(g) });
                stats.push({ k: "Next month range", v: eurC(n0.lower_bound) + " - " + eurC(n0.upper_bound), s: "confidence band" });
            }
            return { rows, stats, sel: fc.length ? hist.length : rows.length - 1, note: histAll.length > hist.length ? "Showing the last 12 months of history." : "" };
        }
    },

    /* ---- Anomalies: revenue timeline with flagged months ---- */
    anomalies: {
        events: { "ba:anomalies": "an" },
        title: "3D Anomaly Timeline",
        sub: "Monthly revenue - months with unusual change stand out in red",
        legend: [{ c: C.violet, t: "Normal month" }, { c: C.red, t: "Anomaly" }],
        layout: "single",
        empty: "No monthly data to display yet.",
        build(d) {
            const a = d.an;
            const m = a && a.monthly;
            if (!Array.isArray(m) || !m.length) return null;
            const flags = {};
            (a.anomalies || []).forEach((x) => { flags[x.date] = x; });
            const rows = m.map((r) => {
                const fl = flags[r.date];
                const info = [["Revenue", eur(r.revenue)], ["vs previous month", sgn(r.growth_percent), tone(r.growth_percent)]];
                if (fl) info.push(["Status", "Anomaly", "down"]);
                return {
                    label: String(r.date),
                    flag: !!fl,
                    bars: [{ v: r.revenue, h: Math.max(0, r.revenue), c1: fl ? C.red : C.violet, c2: fl ? C.orange : C.cyan, name: "Revenue" }],
                    top: eurC(r.revenue),
                    info
                };
            });
            const list = a.anomalies || [];
            const gOf = (x) => Number(x.growth_percent ?? x.growth ?? 0);
            const stats = [{ k: "Detected events", v: String(list.length), s: list.length ? "of " + m.length + " months" : "all months normal", t: list.length ? "down" : "up" }];
            if (list.length) {
                const up = list.reduce((b, x) => (gOf(x) > gOf(b) ? x : b), list[0]);
                const dn = list.reduce((b, x) => (gOf(x) < gOf(b) ? x : b), list[0]);
                stats.push({ k: "Biggest jump", v: sgn(gOf(up)), s: up.date, t: gOf(up) >= 0 ? "up" : "down" });
                stats.push({ k: "Biggest drop", v: sgn(gOf(dn)), s: dn.date, t: gOf(dn) >= 0 ? "up" : "down" });
            }
            const avgG = m.length > 1 ? m.slice(1).reduce((s, x) => s + x.growth_percent, 0) / (m.length - 1) : 0;
            stats.push({ k: "Average change", v: sgn(avgG), s: "month over month", t: tone(avgG) });
            const firstFlag = rows.findIndex((r) => r.flag);
            return { rows, stats, sel: firstFlag >= 0 ? firstFlag : idxMax(m, (x) => x.revenue) };
        }
    },

    /* ---- Simulator: current vs scenario ---- */
    simulator: {
        events: { "ba:simulator": "sim" },
        title: "3D Scenario Impact",
        sub: "Current dataset versus your what-if scenario",
        legend: [{ c: C.violet, t: "Current" }, { c: C.cyan, t: "Scenario" }],
        layout: "side",
        empty: "Run a scenario to see it here.",
        build(d) {
            const r = d.sim;
            if (!r || !r.current || !r.scenario) return null;
            const defs = [["Revenue", "revenue", false], ["Cost", "cost", true], ["Profit", "profit", false]];
            const rows = defs.map(([label, key, inverse]) => {
                const a = r.current[key];
                const b = r.scenario[key];
                const diff = b - a;
                const p = a ? (diff / Math.abs(a)) * 100 : 0;
                const good = inverse ? diff <= 0 : diff >= 0;
                return {
                    label,
                    bars: [
                        { v: a, h: Math.abs(a), c1: C.violet, c2: lighten(C.violet, 0.35), name: "Current" },
                        { v: b, h: Math.abs(b), c1: C.cyan, c2: lighten(C.cyan, 0.35), name: "Scenario" }
                    ],
                    top: eurC(b),
                    info: [
                        ["Current", eur(a)],
                        ["Scenario", eur(b)],
                        ["Change", (diff >= 0 ? "+" : "") + eur(diff), good ? "up" : "down"],
                        ["Change %", sgn(p), good ? "up" : "down"]
                    ]
                };
            });
            const im = r.impact || {};
            const stats = [
                { k: "Revenue", v: sgn(im.revenue_change_pct), s: (im.revenue_change >= 0 ? "+" : "") + eurC(im.revenue_change), t: tone(im.revenue_change_pct) },
                { k: "Cost", v: sgn(im.cost_change_pct), s: (im.cost_change >= 0 ? "+" : "") + eurC(im.cost_change), t: Number(im.cost_change_pct) <= 0 ? "up" : "down" },
                { k: "Profit", v: sgn(im.profit_change_pct), s: (im.profit_change >= 0 ? "+" : "") + eurC(im.profit_change), t: tone(im.profit_change_pct) },
                { k: "Margin", v: (im.margin_change_pp >= 0 ? "+" : "") + Number(im.margin_change_pp || 0).toFixed(1) + " pp", s: pct1(r.current.margin) + " -> " + pct1(r.scenario.margin), t: tone(im.margin_change_pp) }
            ];
            return { rows, stats, sel: 2 };
        }
    },

    /* ---- Goals: progress towards each target ---- */
    goals: {
        events: { "ba:goals": "goals" },
        title: "3D Goal Progress",
        sub: "How far each goal has come - the glass column is the target",
        legend: [{ c: C.green, t: "Progress" }, { c: C.blue, t: "Target (100%)" }],
        layout: "single",
        empty: "Add a goal to see its progress here.",
        build(d) {
            const g = d.goals;
            if (!g || !Array.isArray(g.goals) || !g.goals.length) return null;
            const fmt = (metric, v) => (metric === "margin" ? pct1(v) : metric === "units" ? num(v) : eur(v));
            const rows = g.goals.map((x) => {
                const cur = Number(g.values[x.metric] || 0);
                const tgt = Number(x.target) || 0;
                const p = tgt ? Math.max(0, (cur / tgt) * 100) : 0;
                const done = p >= 100;
                return {
                    label: String(x.metric).toUpperCase(),
                    bars: [{ v: p, h: Math.min(p, 130), c1: done ? C.green : C.amber, c2: done ? lighten(C.green, 0.3) : lighten(C.orange, 0.2), name: "Progress" }],
                    band: { lo: 0, hi: 100 },
                    top: Math.round(p) + "%",
                    info: [["Current", fmt(x.metric, cur)], ["Target", fmt(x.metric, tgt)], ["Progress", Math.round(p) + "%", done ? "up" : ""], ["Remaining", done ? "Reached" : fmt(x.metric, Math.max(0, tgt - cur)), done ? "up" : ""]]
                };
            });
            const done = rows.filter((r) => r.bars[0].v >= 100).length;
            const avg = rows.reduce((s, r) => s + r.bars[0].v, 0) / rows.length;
            const best = idxMax(rows, (r) => r.bars[0].v);
            const low = idxMin(rows, (r) => r.bars[0].v);
            const stats = [
                { k: "Goals reached", v: done + " / " + rows.length, s: "100% or more", t: done ? "up" : "" },
                { k: "Average progress", v: Math.round(avg) + "%", s: "across all goals" },
                { k: "Closest", v: rows[best].label, s: Math.round(rows[best].bars[0].v) + "%" },
                { k: "Furthest away", v: rows[low].label, s: Math.round(rows[low].bars[0].v) + "%" }
            ];
            return { rows, stats, sel: best };
        }
    }
};

/* ---------------------------------------------------------
   Convex hull + point test (for picking projected boxes)
   --------------------------------------------------------- */
function hullOf(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const q of p) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
        lower.push(q);
    }
    const upper = [];
    for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
        upper.push(q);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

function inHull(h, x, y) {
    if (h.length < 3) return false;
    let sign = 0;
    for (let i = 0; i < h.length; i++) {
        const a = h[i];
        const b = h[(i + 1) % h.length];
        const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (c !== 0) {
            const s = c > 0 ? 1 : -1;
            if (sign === 0) sign = s;
            else if (s !== sign) return false;
        }
    }
    return true;
}

/* ---------------------------------------------------------
   The chart component
   --------------------------------------------------------- */
const MAX_H = 5.2;

class Chart3D {
    constructor(card) {
        this.card = card;
        this.kind = card.dataset.chart3d;
        this.ad = ADAPTERS[this.kind];
        this.state = Object.assign({}, this.ad.state || {});
        this.data = {};
        this.model = null;
        this.rows = [];
        this.bars = [];
        this.sel = -1;
        this.hover = -1;
        this.autoRotate = !reduceMotion;
        this.orbit = { yaw: -0.5, pitch: 0.58, dist: 16 };
        this.swayAmp = 1;
        this.dragging = false;
        this.pointerInside = false;
        this.visible = false;
        this.dirty = true;
        this.growStart = 0;
        this.growDone = false;
        this.last = performance.now();
        this.gl = false;
        this.disposables = [];

        this.buildDom();
        this.initGL();
        this.bind();

        Object.keys(this.ad.events).forEach((ev) => {
            const key = this.ad.events[ev];
            window.addEventListener(ev, (e) => { this.data[key] = e.detail; this.safeRefresh(); });
            if (cache[ev] !== undefined) this.data[key] = cache[ev];
        });
        this.safeRefresh();
        requestAnimationFrame((t) => this.loop(t));
        card.__chart3d = this;
    }

    /* ---------- DOM ---------- */
    buildDom() {
        const ad = this.ad;
        const card = this.card;
        card.classList.add("sky-card");
        const title = card.dataset.title || ad.title;
        const sub = card.dataset.sub || ad.sub;
        const legend = ad.legend.map((l) => '<span><i style="background:' + css(l.c) + '"></i>' + esc(l.t) + "</span>").join("");
        const toggles = (ad.toggles || []).map((g) =>
            '<div class="sky-toggle" role="group" aria-label="' + esc(g.label) + '">' +
            g.options.map(([v, t]) => '<button type="button" data-group="' + g.group + '" data-value="' + v + '" aria-pressed="' + (this.state[g.group] === v) + '">' + esc(t) + "</button>").join("") +
            "</div>").join("");
        card.innerHTML =
            '<div class="card-header"><div><h3>' + esc(title) + "</h3><p>" + esc(sub) + '</p></div><div class="sky-legend">' + legend + "</div></div>" +
            '<div class="sky-toolbar">' + toggles + '<span class="sky-spacer"></span>' +
            '<button type="button" class="sky-tool" data-act="rotate" aria-pressed="' + this.autoRotate + '">Auto-rotate</button>' +
            '<button type="button" class="sky-tool" data-act="reset">Reset view</button></div>' +
            '<div class="sky-body">' +
            '<div class="sky-stage" tabindex="0" role="application" aria-label="' + esc(title) + ' - drag to rotate, arrow keys to move between bars">' +
            '<div class="sky-labels" aria-hidden="true"></div><div class="sky-tooltip"></div>' +
            '<div class="sky-empty">Loading 3D view…</div>' +
            '<div class="sky-hint-tag">Drag to rotate · click a bar</div></div>' +
            '<aside class="sky-panel" aria-live="polite"><div class="sky-stats"></div><div class="sky-sel"></div><p class="sky-note"></p></aside>' +
            "</div>";
        this.stage = card.querySelector(".sky-stage");
        this.labelsEl = card.querySelector(".sky-labels");
        this.tipEl = card.querySelector(".sky-tooltip");
        this.emptyEl = card.querySelector(".sky-empty");
        this.statsEl = card.querySelector(".sky-stats");
        this.selEl = card.querySelector(".sky-sel");
        this.noteEl = card.querySelector(".sky-note");
    }

    /* ---------- WebGL ---------- */
    initGL() {
        if (!THREE) {
            this.glMessage = "3D view unavailable (Three.js could not be loaded). The numbers on the right still work.";
            return;
        }
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (error) {
            this.glMessage = "3D view needs WebGL, which is not available in this browser. The numbers on the right still work.";
            return;
        }
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.stage.insertBefore(this.renderer.domElement, this.stage.firstChild);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
        this.scene.add(new THREE.AmbientLight(0x9aa4ff, 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 1.25);
        key.position.set(6, 12, 8);
        this.scene.add(key);
        const rimA = new THREE.PointLight(0x22d3ee, 55, 40, 2);
        rimA.position.set(-10, 6, -6);
        this.scene.add(rimA);
        const rimB = new THREE.PointLight(0x7c6cf0, 55, 40, 2);
        rimB.position.set(10, 5, 8);
        this.scene.add(rimB);

        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
        this.barMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.3 });
        this.dummy = new THREE.Object3D();
        this.tmpColor = new THREE.Color();
        this.proj = new THREE.Vector3();
        this.target = new THREE.Vector3(0, MAX_H * 0.32, 0);
        this.gl = true;
    }

    /* ---------- events ---------- */
    bind() {
        const stage = this.stage;
        let startX = 0, startY = 0, lastX = 0, lastY = 0, moved = 0;

        this.card.addEventListener("click", (e) => {
            const b = e.target.closest("button");
            if (!b || !this.card.contains(b)) return;
            if (b.dataset.group) {
                this.state[b.dataset.group] = b.dataset.value;
                this.card.querySelectorAll('button[data-group="' + b.dataset.group + '"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
                this.sel = -1;
                this.refresh();
            } else if (b.dataset.act === "rotate") {
                this.autoRotate = !this.autoRotate;
                b.setAttribute("aria-pressed", String(this.autoRotate));
                this.dirty = true;
            } else if (b.dataset.act === "reset") {
                this.orbit.yaw = -0.5;
                this.orbit.pitch = 0.58;
                this.dirty = true;
            }
        });

        stage.addEventListener("pointerdown", (e) => {
            this.dragging = true;
            moved = 0;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            stage.classList.add("is-dragging");
            try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });
        stage.addEventListener("pointermove", (e) => {
            this.pointerInside = true;
            if (this.dragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);
                this.orbit.yaw -= dx * 0.008;
                this.orbit.pitch = Math.min(1.25, Math.max(0.12, this.orbit.pitch + dy * 0.006));
                this.tipEl.classList.remove("show");
                this.dirty = true;
                return;
            }
            this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
        });
        const end = (e) => {
            if (!this.dragging) return;
            this.dragging = false;
            stage.classList.remove("is-dragging");
            try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (moved < 5) {
                const i = this.pick(e.clientX, e.clientY);
                if (i >= 0) this.select(i);
            }
        };
        stage.addEventListener("pointerup", end);
        stage.addEventListener("pointercancel", end);
        stage.addEventListener("pointerleave", () => {
            this.pointerInside = false;
            this.setHover(-1);
        });
        stage.addEventListener("keydown", (e) => {
            if (!this.rows.length) return;
            let i = this.sel;
            if (e.key === "ArrowRight") i = Math.min(this.rows.length - 1, i + 1);
            else if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
            else if (e.key === "Home") i = 0;
            else if (e.key === "End") i = this.rows.length - 1;
            else return;
            e.preventDefault();
            this.select(i);
        });

        if ("IntersectionObserver" in window) {
            new IntersectionObserver((entries) => {
                this.visible = entries.some((en) => en.isIntersecting);
                if (this.visible) { this.resize(); this.dirty = true; }
            }, { threshold: 0.05 }).observe(stage);
        } else {
            this.visible = true;
        }
        if ("ResizeObserver" in window) new ResizeObserver(() => this.resize()).observe(stage);
        else window.addEventListener("resize", () => this.resize());
    }

    /* ---------- data -> scene ---------- */
    // refresh() that never throws: a problem is shown inside the card instead of
    // leaving "Loading 3D view..." on screen forever.
    safeRefresh() {
        try {
            this.refresh();
        } catch (error) {
            console.error("[charts3d] could not draw " + this.card.dataset.chart3d + ":", error);
            this.showProblem("Could not draw this chart: " + (error && error.message ? error.message : error));
        }
    }

    showProblem(text) {
        if (!this.emptyEl) return;
        this.emptyEl.style.display = "grid";
        this.emptyEl.textContent = text;
    }

    refresh() {
        const model = this.ad.build(this.data, this.state);
        this.model = model;
        this.clearScene();

        if (!model) {
            this.rows = [];
            this.bars = [];
            this.emptyEl.style.display = "grid";
            this.emptyEl.textContent = this.ad.empty || "No data to display yet.";
            this.statsEl.innerHTML = "";
            this.selEl.innerHTML = "";
            this.noteEl.textContent = "";
            return;
        }
        this.rows = model.rows;
        const keep = this.sel >= 0 && this.sel < this.rows.length ? this.sel : model.sel;
        this.sel = keep >= 0 ? keep : 0;
        this.hover = -1;

        if (this.gl) {
            this.emptyEl.style.display = "none";
            this.buildScene();
        } else {
            this.emptyEl.style.display = "grid";
            this.emptyEl.textContent = this.glMessage;
        }
        this.renderPanel();
        this.noteEl.textContent = model.note || "";
        this.growStart = performance.now();
        this.growDone = reduceMotion;
        this.labelsEl.classList.toggle("ready", reduceMotion);
        this.dirty = true;
    }

    clearScene() {
        if (!this.gl) return;
        while (this.world.children.length) {
            const c = this.world.children[0];
            this.world.remove(c);
            if (c.geometry && c.geometry !== this.boxGeo && c.geometry.dispose) c.geometry.dispose();
            if (c.material && c.material !== this.barMat && c.material.dispose) c.material.dispose();
            if (c.dispose) c.dispose();
        }
        this.labelsEl.innerHTML = "";
        this.valEls = [];
        this.catEls = [];
        this.mesh = null;
    }

    buildScene() {
        const rows = this.rows;
        const n = rows.length;
        let maxV = 0;
        rows.forEach((r) => {
            r.bars.forEach((b) => { maxV = Math.max(maxV, b.h); });
            if (r.band) maxV = Math.max(maxV, r.band.hi);
        });
        if (maxV <= 0) maxV = 1;

        const spacing = Math.min(2.3, 16 / n);
        const bw = Math.min(spacing * 0.62, 1.0);
        this.layout = { spacing, bw, span: (n - 1) * spacing + bw * 2, maxV };

        const bars = [];
        rows.forEach((r, i) => {
            const x = (i - (n - 1) / 2) * spacing;
            const nb = r.bars.length;
            r.x = x;
            r.topH = 0;
            r.front = 0;
            r.bars.forEach((b, k) => {
                let bx = x, z = 0, w = bw, d = bw;
                if (nb === 2 && this.ad.layout === "frontback") {
                    if (k === 0) { z = -bw * 0.25; } else { z = bw * 0.78; w = bw * 0.62; d = bw * 0.62; }
                } else if (nb === 2) {
                    w = bw * 0.5; d = bw * 0.9; bx = x + (k === 0 ? -1 : 1) * w * 0.56;
                }
                const h = Math.max(0.05, (b.h / maxV) * MAX_H);
                r.topH = Math.max(r.topH, h);
                r.front = Math.max(r.front, z + d / 2 + 0.55);
                const col = new THREE.Color(b.c1).lerp(new THREE.Color(b.c2), 0.6 * Math.min(1, b.h / maxV));
                bars.push({ row: i, k, x: bx, z, w, d, h, col });
            });
            if (r.band) r.topH = Math.max(r.topH, (r.band.hi / maxV) * MAX_H);
        });
        this.bars = bars;

        this.mesh = new THREE.InstancedMesh(this.boxGeo, this.barMat, bars.length);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.world.add(this.mesh);
        this.paintColors();

        /* translucent target / confidence columns */
        rows.forEach((r) => {
            if (!r.band) return;
            const hLo = (r.band.lo / maxV) * MAX_H;
            const hHi = (r.band.hi / maxV) * MAX_H;
            const hh = Math.max(0.05, hHi - hLo);
            const color = r.bars[0].c1;
            const mesh = new THREE.Mesh(this.boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
            mesh.scale.set(bw * 1.2, hh, bw * 1.2);
            mesh.position.set(r.x, hLo + hh / 2, 0);
            this.world.add(mesh);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.boxGeo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }));
            edges.scale.copy(mesh.scale);
            edges.position.copy(mesh.position);
            this.world.add(edges);
        });

        /* floor + grid */
        const floorW = this.layout.span + 5;
        const floorD = bw * 6 + 4;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), new THREE.MeshBasicMaterial({ color: 0x151b4a, transparent: true, opacity: 0.55 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.02;
        this.world.add(floor);
        const grid = new THREE.GridHelper(floorW, Math.max(8, Math.round(floorW)), 0x3a4690, 0x28316d);
        grid.scale.z = floorD / floorW;
        grid.material.transparent = true;
        grid.material.opacity = 0.45;
        this.world.add(grid);

        /* HTML labels */
        this.valEls = rows.map((r) => {
            const el = document.createElement("div");
            el.className = "sky-val";
            el.textContent = r.top;
            this.labelsEl.appendChild(el);
            return el;
        });
        this.catEls = rows.map((r) => {
            const el = document.createElement("div");
            el.className = "sky-cat";
            el.textContent = r.label.length > 14 ? r.label.slice(0, 13) + "…" : r.label;
            el.title = r.label;
            this.labelsEl.appendChild(el);
            return el;
        });
        this.resize();
    }

    paintColors() {
        if (!this.mesh) return;
        this.bars.forEach((b, i) => {
            this.tmpColor.copy(b.col);
            if (b.row === this.sel) this.tmpColor.lerp(new THREE.Color(0xffffff), 0.16);
            if (b.row === this.hover) this.tmpColor.lerp(new THREE.Color(0xffffff), 0.12);
            this.mesh.setColorAt(i, this.tmpColor);
        });
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    /* ---------- panel ---------- */
    renderPanel() {
        const stats = (this.model && this.model.stats) || [];
        this.statsEl.innerHTML = stats.map((s) =>
            '<div class="sky-stat"><span>' + esc(s.k) + '</span><strong class="fit-num ' + (s.t || "") + '">' + esc(s.v) + "</strong><small>" + esc(s.s || "") + "</small></div>").join("");
        this.renderSelected();
    }

    renderSelected() {
        const r = this.rows[this.sel];
        if (!r) { this.selEl.innerHTML = ""; return; }
        this.selEl.innerHTML =
            '<div class="sky-sel-head"><span>Selected</span><h4>' + esc(r.label) + "</h4></div><dl>" +
            r.info.map((x) => "<div><dt>" + esc(x[0]) + '</dt><dd class="fit-num ' + (x[2] || "") + '">' + esc(x[1]) + "</dd></div>").join("") +
            "</dl>";
        if (window.baFitAll) window.baFitAll(this.card);
    }

    select(i) {
        if (i === this.sel || i < 0 || i >= this.rows.length) return;
        this.sel = i;
        this.paintColors();
        this.renderSelected();
        this.dirty = true;
    }

    /* ---------- hover / picking ---------- */
    setHover(i, cx, cy) {
        if (i !== this.hover) {
            this.hover = i;
            this.paintColors();
            this.dirty = true;
        }
        if (i < 0) { this.tipEl.classList.remove("show"); return; }
        const r = this.rows[i];
        this.tipEl.innerHTML = "<b>" + esc(r.label) + "</b>" + r.info.slice(0, 4).map((x) => esc(x[0]) + ": " + esc(x[1])).join("<br>");
        const rect = this.stage.getBoundingClientRect();
        let x = cx - rect.left + 16;
        let y = cy - rect.top + 16;
        const tw = this.tipEl.offsetWidth || 170;
        const th = this.tipEl.offsetHeight || 90;
        if (x + tw > rect.width - 8) x = cx - rect.left - tw - 16;
        if (y + th > rect.height - 8) y = cy - rect.top - th - 16;
        this.tipEl.style.left = Math.max(8, x) + "px";
        this.tipEl.style.top = Math.max(8, y) + "px";
        this.tipEl.classList.add("show");
    }

    project(x, y, z) {
        this.proj.set(x, y, z).project(this.camera);
        return { x: (this.proj.x + 1) / 2 * this.w, y: (1 - this.proj.y) / 2 * this.h, z: this.proj.z };
    }

    pick(cx, cy) {
        if (!this.gl || !this.bars.length) return -1;
        const rect = this.stage.getBoundingClientRect();
        const px = cx - rect.left;
        const py = cy - rect.top;
        this.placeCamera(this.currentYaw || this.orbit.yaw);
        let best = -1, bestD = Infinity;
        for (let i = 0; i < this.bars.length; i++) {
            const b = this.bars[i];
            const pts = [];
            for (let dx = -1; dx <= 1; dx += 2) for (let dz = -1; dz <= 1; dz += 2) for (let dy = 0; dy <= 1; dy++) {
                pts.push(this.project(b.x + dx * b.w / 2, dy * b.h, b.z + dz * b.d / 2));
            }
            if (inHull(hullOf(pts), px, py)) {
                const dist = this.camera.position.distanceTo(this.proj.set(b.x, b.h / 2, b.z));
                if (dist < bestD) { bestD = dist; best = b.row; }
            }
        }
        return best;
    }

    /* ---------- camera / size ---------- */
    resize() {
        if (!this.gl) return;
        const w = this.stage.clientWidth;
        const h = this.stage.clientHeight;
        if (!w || !h) return;
        this.w = w;
        this.h = h;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (this.layout && this.bars.length) this.fitCamera();
        this.dirty = true;
    }

    /* Move the camera back until every bar and its labels stay inside the
       stage for the default view and the gentle sway around it. */
    fitCamera() {
        const vFov = THREE.MathUtils.degToRad(this.camera.fov);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
        const pts = [];
        this.bars.forEach((b) => {
            for (let dx = -1; dx <= 1; dx += 2) for (let dz = -1; dz <= 1; dz += 2) {
                pts.push([b.x + dx * b.w / 2, 0, b.z + dz * b.d / 2]);
                pts.push([b.x + dx * b.w / 2, b.h, b.z + dz * b.d / 2]);
            }
        });
        this.rows.forEach((r) => {
            pts.push([r.x, r.topH + 0.45, 0]);   // value label above the tallest bar
            pts.push([r.x, 0, r.front]);         // category label on the floor
        });
        const yaws = [-0.8, -0.5, -0.2];
        const w = this.w, h = this.h;
        const fits = (dist) => {
            this.orbit.dist = dist;
            for (const yaw of yaws) {
                this.placeCamera(yaw);
                for (const p of pts) {
                    const q = this.project(p[0], p[1], p[2]);
                    if (q.x < w * 0.05 || q.x > w * 0.95 || q.y < h * 0.07 || q.y > h * 0.93) return false;
                }
            }
            return true;
        };
        let dist = Math.max(8, ((this.layout.span + 3) / 2 / Math.tan(hFov / 2)) * 0.6);
        let guard = 0;
        while (!fits(dist) && guard++ < 60) dist *= 1.05;
        this.orbit.dist = Math.min(dist, 90);
    }

    placeCamera(yaw) {
        const o = this.orbit;
        const cp = Math.cos(o.pitch);
        this.camera.position.set(
            this.target.x + o.dist * Math.sin(yaw) * cp,
            this.target.y + o.dist * Math.sin(o.pitch),
            this.target.z + o.dist * Math.cos(yaw) * cp
        );
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld();
    }

    /* ---------- animation ---------- */
    updateMatrices(now) {
        if (!this.mesh) return false;
        let done = true;
        for (let i = 0; i < this.bars.length; i++) {
            const b = this.bars[i];
            const t = reduceMotion ? 1 : Math.min(1, Math.max(0, (now - this.growStart - b.row * 28) / 900));
            if (t < 1) done = false;
            const e = 1 - Math.pow(1 - t, 3);
            const lift = b.row === this.sel || b.row === this.hover ? 1.08 : 1;
            const h = Math.max(0.001, b.h * e);
            this.dummy.position.set(b.x, h / 2, b.z);
            this.dummy.scale.set(b.w * lift, h, b.d * lift);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (done && !this.growDone) {
            this.growDone = true;
            this.labelsEl.classList.add("ready");
        }
        return !done;
    }

    updateLabels() {
        if (!this.valEls || !this.valEls.length) return;
        const n = this.rows.length;
        const items = [];
        for (let i = 0; i < n; i++) {
            const r = this.rows[i];
            const top = this.project(r.x, r.topH + 0.28, 0);
            const base = this.project(r.x, 0, r.front);
            items.push({ el: this.valEls[i], x: top.x, y: top.y, v: true, i });
            items.push({ el: this.catEls[i], x: base.x, y: base.y, v: false, i });
        }
        const isForced = (it) => it.i === this.sel || it.i === this.hover;
        const order = items.filter(isForced).sort((a, b) => (a.i === this.sel ? 0 : 1) - (b.i === this.sel ? 0 : 1))
            .concat(items.filter((it) => !isForced(it) && it.v), items.filter((it) => !isForced(it) && !it.v));

        const placed = [];
        const hit = (q) => placed.some((p) => q[0] < p[2] + 4 && q[2] > p[0] - 4 && q[1] < p[3] + 2 && q[3] > p[1] - 2);
        order.forEach((it) => {
            const el = it.el;
            if (!el.__w && el.offsetWidth) { el.__w = el.offsetWidth; el.__h = el.offsetHeight; }
            const w = el.__w || 56;
            const h = el.__h || 20;
            const q = it.v ? [it.x - w / 2, it.y - h, it.x + w / 2, it.y] : [it.x - w / 2, it.y, it.x + w / 2, it.y + h];
            const inside = q[0] >= 0 && q[2] <= this.w && q[1] >= 0 && q[3] <= this.h;
            const show = isForced(it) || (inside && !hit(q));
            if (show) placed.push(q);
            el.style.transform = "translate3d(" + it.x.toFixed(1) + "px," + it.y.toFixed(1) + "px,0) translate(-50%," + (it.v ? "-100%" : "0") + ")";
            el.classList.toggle("is-hidden", !show);
            el.classList.toggle("is-sel", it.i === this.sel);
            if (it.v) {
                el.classList.toggle("is-hover", it.i === this.hover);
                el.classList.toggle("is-flag", !!this.rows[it.i].flag);
                el.style.zIndex = it.i === this.sel ? 3 : it.i === this.hover ? 2 : 1;
            }
        });
    }

    loop(now) {
        requestAnimationFrame((t) => this.loop(t));
        if (!this.gl || !this.model || !this.mesh) return;
        if (!this.visible || document.hidden || !this.stage.clientWidth) return;
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;

        const growing = this.updateMatrices(now);
        const wantSway = this.autoRotate && !this.dragging && !this.pointerInside;
        this.swayAmp += ((wantSway ? 1 : 0) - this.swayAmp) * Math.min(1, dt * 3);
        const swaying = this.autoRotate && this.swayAmp > 0.004;
        if (!(growing || swaying || this.dragging || this.dirty)) return;

        this.currentYaw = this.orbit.yaw + (this.autoRotate ? Math.sin(now / 1000 * 0.35) * 0.3 * this.swayAmp : 0);
        try {
            this.placeCamera(this.currentYaw);
            this.renderer.render(this.scene, this.camera);
            this.updateLabels();
        } catch (error) {
            console.error("[charts3d] render failed:", error);
            this.gl = false;
            this.showProblem("3D rendering failed (" + (error && error.message ? error.message : error) + "). The numbers on the right still work.");
            return;
        }
        this.dirty = false;
    }
}

/* ---------------------------------------------------------
   Boot: build a chart for every declared card
   --------------------------------------------------------- */
function boot() {
    document.querySelectorAll("[data-chart3d]").forEach((card) => {
        if (card.__chart3d || !ADAPTERS[card.dataset.chart3d]) return;
        try { new Chart3D(card); } catch (error) {
            console.error("[charts3d] chart failed", error);
            if (!card.querySelector(".sky-empty")) card.innerHTML = '<div class="sky-empty" style="display:grid">3D chart could not start: ' + esc(error && error.message ? error.message : error) + "</div>";
        }
    });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
