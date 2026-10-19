/* =========================================================
   modern-ui.js  (classic script, loaded with `defer`)
   - Chart.js theme (gradients, rounded bars, glass tooltips)
   - 3D tilt + glare on small tiles
   - Count-up animation for KPI numbers
   - Scroll reveal for cards
   Nothing here touches the data logic in app.js.
   ========================================================= */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    /* ---------------------------------------------------------
       1. Chart.js theme
       --------------------------------------------------------- */
    var PALETTE = ["#7c6cf0", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#a78bfa"];
    var PAIRS = [
        ["#7c6cf0", "#22d3ee"],
        ["#34d399", "#22d3ee"],
        ["#f472b6", "#7c6cf0"],
        ["#fbbf24", "#f472b6"],
        ["#60a5fa", "#7c6cf0"],
        ["#fb7185", "#fbbf24"]
    ];

    function hexToRgba(hex, alpha) {
        var h = hex.replace("#", "");
        var r = parseInt(h.substring(0, 2), 16);
        var g = parseInt(h.substring(2, 4), 16);
        var b = parseInt(h.substring(4, 6), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    function verticalGradient(chart, from, to) {
        var ctx = chart.ctx;
        var h = (chart.chartArea && chart.chartArea.bottom) || chart.height || 300;
        var g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, from);
        g.addColorStop(1, to);
        return g;
    }

    function setupChartTheme() {
        if (typeof window.Chart === "undefined") return;
        var C = window.Chart;

        C.defaults.font.family = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        C.defaults.font.size = 12;
        C.defaults.color = "#64748b";
        C.defaults.borderColor = "rgba(100, 116, 139, 0.14)";
        C.defaults.elements.line.tension = 0.38;
        C.defaults.elements.line.borderWidth = 3;
        C.defaults.elements.point.radius = 2.5;
        C.defaults.elements.point.hoverRadius = 6;
        C.defaults.elements.bar.borderRadius = 9;
        C.defaults.elements.bar.borderSkipped = false;

        if (!reduceMotion) {
            C.defaults.animation = { duration: 1100, easing: "easeOutQuart" };
        } else {
            C.defaults.animation = false;
        }

        var tooltip = C.defaults.plugins.tooltip;
        tooltip.backgroundColor = "rgba(10, 14, 38, 0.92)";
        tooltip.titleColor = "#ffffff";
        tooltip.bodyColor = "#dbe2ff";
        tooltip.borderColor = "rgba(124, 108, 240, 0.5)";
        tooltip.borderWidth = 1;
        tooltip.padding = 12;
        tooltip.cornerRadius = 14;
        tooltip.boxPadding = 5;
        tooltip.usePointStyle = true;

        C.defaults.plugins.legend.labels.usePointStyle = true;
        C.defaults.plugins.legend.labels.boxWidth = 8;
        C.defaults.plugins.legend.labels.padding = 16;

        // Give datasets that have no colour of their own a gradient look.
        C.register({
            id: "baTheme",
            beforeUpdate: function (chart) {
                var type = chart.config.type;
                var datasets = chart.data.datasets || [];
                datasets.forEach(function (ds, i) {
                    var dsType = ds.type || type;
                    var hasColor = ds.borderColor !== undefined || ds.backgroundColor !== undefined;
                    if (hasColor) return;
                    var pair = PAIRS[i % PAIRS.length];

                    if (dsType === "line") {
                        ds.borderColor = pair[0];
                        ds.backgroundColor = function (context) {
                            return verticalGradient(context.chart, hexToRgba(pair[0], 0.30), hexToRgba(pair[1], 0.01));
                        };
                        ds.pointBackgroundColor = "#ffffff";
                        ds.pointBorderColor = pair[0];
                        ds.pointBorderWidth = 2;
                        if (ds.fill === undefined && datasets.length <= 3) ds.fill = true;
                    } else if (dsType === "bar") {
                        ds.backgroundColor = function (context) {
                            return verticalGradient(context.chart, pair[0], hexToRgba(pair[1], 0.75));
                        };
                        ds.borderWidth = 0;
                    } else if (dsType === "pie" || dsType === "doughnut" || dsType === "polarArea") {
                        ds.backgroundColor = PALETTE.slice();
                        ds.borderWidth = 2;
                        ds.borderColor = "#ffffff";
                    }
                });
            }
        });
    }

    /* ---------------------------------------------------------
       2. 3D tilt + glare for small tiles
       --------------------------------------------------------- */
    var TILT_SELECTOR = ".kpi-card, .performer-item, .quick-actions-grid a, .scenario-metric, .forecast-metric, .system-node";

    function makeTilt(el) {
        if (el.dataset.tiltReady) return;
        el.dataset.tiltReady = "1";
        el.classList.add("tiltable");

        var glare = document.createElement("span");
        glare.className = "tilt-glare";
        glare.setAttribute("aria-hidden", "true");
        el.appendChild(glare);

        var max = el.classList.contains("kpi-card") ? 9 : 7;
        var frame = null;

        function onMove(e) {
            var rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var px = (e.clientX - rect.left) / rect.width;
            var py = (e.clientY - rect.top) / rect.height;
            var ry = (px - 0.5) * 2 * max;
            var rx = (0.5 - py) * 2 * max;
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(function () {
                el.style.setProperty("--rx", rx.toFixed(2) + "deg");
                el.style.setProperty("--ry", ry.toFixed(2) + "deg");
                el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
                el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
            });
            el.classList.add("tilt-active");
        }

        function onLeave() {
            if (frame) cancelAnimationFrame(frame);
            el.classList.remove("tilt-active");
            el.style.setProperty("--rx", "0deg");
            el.style.setProperty("--ry", "0deg");
        }

        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        el.addEventListener("pointercancel", onLeave);
    }

    function setupTilt() {
        if (reduceMotion || !finePointer) return;
        document.querySelectorAll(TILT_SELECTOR).forEach(makeTilt);
    }

    /* ---------------------------------------------------------
       3. Count-up for KPI numbers
       --------------------------------------------------------- */
    var NUMBER_RE = /^([^\d\-+]*)(-?[\d,]+(?:\.\d+)?)(.*)$/;
    var KPI_IDS = ["revenue", "profit", "cost", "units", "margin"];

    function animateNumber(el, text) {
        var m = NUMBER_RE.exec(text.trim());
        if (!m) return false;
        var prefix = m[1];
        var raw = m[2];
        var suffix = m[3];
        var target = parseFloat(raw.replace(/,/g, ""));
        if (!isFinite(target)) return false;
        var decimals = raw.indexOf(".") >= 0 ? raw.split(".")[1].length : 0;

        var duration = 1100;
        var start = performance.now();
        el.__baBusy = true;

        function fmt(v) {
            return prefix + v.toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }) + suffix;
        }

        function step(now) {
            var t = Math.min(1, (now - start) / duration);
            var eased = 1 - Math.pow(1 - t, 4);
            el.textContent = fmt(target * eased);
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = text; // exact original text at the end
                setTimeout(function () { el.__baBusy = false; fitEl(el); }, 0);
            }
        }
        requestAnimationFrame(step);
        return true;
    }

    function setupCountUp() {
        if (reduceMotion) return;
        KPI_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            var last = null;
            var observer = new MutationObserver(function () {
                if (el.__baBusy) return;
                var text = el.textContent;
                if (!text || text === last) return;
                last = text;
                animateNumber(el, text);
            });
            observer.observe(el, { childList: true, characterData: true, subtree: true });
        });
    }

    /* ---------------------------------------------------------
       4. Scroll reveal
       --------------------------------------------------------- */
    function setupReveal() {
        var targets = Array.prototype.slice.call(
            document.querySelectorAll(".section-intro, .card:not(.kpi-card):not(.tiltable), .custom-dashboard-grid")
        ).filter(function (el) {
            return !el.closest(".executive-grid");
        });
        if (!targets.length) return;

        if (reduceMotion || !("IntersectionObserver" in window)) return;

        targets.forEach(function (el) { el.classList.add("reveal"); });

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-in");
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

        targets.forEach(function (el, i) {
            el.style.transitionDelay = Math.min(i * 40, 200) + "ms";
            io.observe(el);
        });

        // Safety net: never leave content hidden.
        setTimeout(function () {
            targets.forEach(function (el) { el.classList.add("is-in"); });
        }, 3500);
    }


    /* ---------------------------------------------------------
       5. Keep big numbers inside their boxes
          (a revenue like EUR 72,203,136.00 is wider than a KPI tile)
       --------------------------------------------------------- */
    var FIT_SELECTOR = [
        ".kpi-card h2", ".gauge-value h2", ".health-grid strong", ".performer-item strong",
        ".performer-item small", ".forecast-metric strong", ".scenario-metric strong",
        ".model-info-item strong", ".risk-grid strong", ".quality-grid strong",
        ".report-kpis strong", ".detail-metrics strong", ".custom-kpi-value",
        ".goal-item strong", ".comparison-metric strong", ".fit-num"
    ].join(",");

    function boxWidth(el) {
        var cs = getComputedStyle(el);
        var node = el;
        if (cs.display === "inline") {
            node = el.parentElement || el;
            cs = getComputedStyle(node);
        }
        return node.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    }

    function textWidth(el) {
        if (getComputedStyle(el).display === "inline") return el.getBoundingClientRect().width;
        return el.scrollWidth;
    }

    function setSize(el, px) {
        el.style.setProperty("font-size", px + "px", "important");
    }

    function fitEl(el) {
        if (el.__baBusy) return;
        var avail = boxWidth(el);
        if (!(avail > 0)) return; // hidden for now - fitted again once it shows
        var key = el.textContent + "|" + Math.round(avail);
        if (el.__baFitKey === key) return;
        el.style.removeProperty("font-size");
        var size = parseFloat(getComputedStyle(el).fontSize);
        var need = textWidth(el);
        if (need > avail + 0.5) {
            var min = Math.max(10, size * 0.5);
            var next = Math.max(min, Math.floor((size * avail / need) * 100) / 100 - 0.3);
            setSize(el, next);
            var guard = 0;
            while (textWidth(el) > avail + 0.5 && next > min && guard++ < 14) {
                next = Math.max(min, next - 1);
                setSize(el, next);
            }
        }
        el.__baFitKey = key;
    }

    function fitAll(root) {
        (root || document).querySelectorAll(FIT_SELECTOR).forEach(fitEl);
    }
    window.baFitAll = fitAll;

    function setupFit() {
        var queued = false;
        function queue() {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function () { queued = false; fitAll(document); });
        }
        new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
        window.addEventListener("resize", queue);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
        [300, 1200, 3000].forEach(function (ms) { setTimeout(queue, ms); });
        queue();
    }

    /* ---------------------------------------------------------
       Boot
       --------------------------------------------------------- */
    setupChartTheme();

    function boot() {
        setupTilt();
        setupCountUp();
        setupReveal();
        setupFit();
        // tiles created later (dashboard widgets, KPI tiles on new pages)
        setTimeout(setupTilt, 1500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
