/* =========================================================
   labels.js  (classic script, deferred)
   Shows the names the user gave to their columns instead of
   the generic words "Product" and "Region".

   Example: the file has columns "Κατηγορία" and "Κατάστημα"
     "Sales by Product" -> "Sales by Κατηγορία"
     "All Regions"      -> "All Κατάστημα"

   Only interface text is changed (headings, labels, buttons,
   placeholders, the empty "All ..." filter option). Table cells,
   chart labels and the values of the data are never touched.
   The names come from GET /api/labels.
   ========================================================= */
(function () {
    "use strict";

    var CACHE_KEY = "ba_labels_v1";
    var RE = { product: /\bProducts?\b/gi, region: /\bRegions?\b/gi };
    var ATTRS = ["placeholder", "title", "aria-label"];
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CANVAS: 1, TD: 1, NOSCRIPT: 1, SVG: 1, CODE: 1 };
    // places where data (names of products, regions...) is drawn: leave them alone
    var SKIP_SELECTOR = "td, canvas, .sky-val, .sky-cat, .sky-tooltip, .sky-sel, .sky-stats, [data-nolabel]";
    // elements that hold interface text even when app.js creates them later
    var UI_TAGS = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, LABEL: 1, TH: 1, BUTTON: 1, LEGEND: 1, B: 1 };

    var labels = { product: "Product", region: "Region" };
    var tracked = [];            // {kind: "text"|"attr", node, attr, original}
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;

    function token() { try { return localStorage.getItem("access_token"); } catch (e) { return null; } }

    function readCache() {
        try {
            var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
            if (c && typeof c.product === "string" && typeof c.region === "string") return c;
        } catch (e) { /* ignore */ }
        return null;
    }

    function writeCache(l) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ }
    }

    function isDefault() { return labels.product === "Product" && labels.region === "Region"; }

    // "Product(s)" -> the user's name as written; "product(s)" -> lower case version
    function swap(name) {
        return function (match) {
            return match.charAt(0) === match.charAt(0).toUpperCase() ? name : name.toLowerCase();
        };
    }

    function convert(text) {
        return text.replace(RE.product, swap(labels.product)).replace(RE.region, swap(labels.region));
    }

    function hasWord(text) {
        return text.search(RE.product) >= 0 || text.search(RE.region) >= 0;
    }

    function skipped(el) {
        for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
            if (SKIP_TAGS[n.tagName.toUpperCase()]) return true;
        }
        return !!(el.closest && el.closest(SKIP_SELECTOR));
    }

    function remember(entry) {
        if (seen) {
            if (entry.kind === "text" && seen.has(entry.node)) return false;
            if (entry.kind === "text") seen.add(entry.node);
        }
        tracked.push(entry);
        return true;
    }

    function trackText(node) {
        var parent = node.parentNode;
        if (!parent || parent.nodeType !== 1 || skipped(parent)) return;
        var text = node.nodeValue;
        if (!text || !hasWord(text)) return;
        if (!remember({ kind: "text", node: node, original: text })) return;
        if (!isDefault()) node.nodeValue = convert(text);
    }

    function trackAttrs(el) {
        if (skipped(el)) return;
        ATTRS.forEach(function (a) {
            var v = el.getAttribute && el.getAttribute(a);
            if (v && hasWord(v)) {
                remember({ kind: "attr", node: el, attr: a, original: v });
                if (!isDefault()) el.setAttribute(a, convert(v));
            }
        });
    }

    // Initial page: every piece of static text.
    function scanStatic(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = walker.nextNode())) {
            if (n.nodeType === 3) trackText(n); else trackAttrs(n);
        }
    }

    // Content added later by app.js: only elements that hold interface text.
    function scanAdded(el) {
        var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll ? el.querySelectorAll("*") : []));
        all.forEach(function (node) {
            var tag = node.tagName && node.tagName.toUpperCase();
            if (!tag || skipped(node)) return;
            var isUi = UI_TAGS[tag] || (tag === "OPTION" && node.value === "");
            if (!isUi) return;
            for (var c = node.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3 && c.nodeValue.trim().length <= 60) trackText(c);
            }
        });
    }

    function apply(next) {
        if (next.product === labels.product && next.region === labels.region) return;
        labels = { product: next.product, region: next.region };
        tracked.forEach(function (t) {
            var value = isDefault() ? t.original : convert(t.original);
            if (t.kind === "text") { if (t.node.nodeValue !== value) t.node.nodeValue = value; }
            else if (t.node.getAttribute(t.attr) !== value) t.node.setAttribute(t.attr, value);
        });
    }

    function fetchLabels() {
        var t = token();
        if (!t) { writeCache({ product: "Product", region: "Region" }); apply({ product: "Product", region: "Region" }); return; }
        var base = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
        fetch(base + "/api/labels", { headers: { "Authorization": "Bearer " + t } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (l) {
                if (!l || typeof l.product !== "string" || typeof l.region !== "string") return;
                writeCache(l);
                apply(l);
            })
            .catch(function () { /* keep what we have */ });
    }

    function boot() {
        var cached = readCache();
        if (cached && token()) labels = { product: cached.product, region: cached.region };
        scanStatic(document.body);

        if (typeof MutationObserver === "function") {
            new MutationObserver(function (records) {
                records.forEach(function (r) {
                    Array.prototype.forEach.call(r.addedNodes, function (n) {
                        if (n.nodeType === 1) scanAdded(n);
                    });
                });
            }).observe(document.body, { childList: true, subtree: true });
        }
        fetchLabels();
        window.addEventListener("storage", function (e) { if (e.key === "dataset_changed_at") fetchLabels(); });
        // the active dataset can change while the page is open (Data page)
        window.baRefreshLabels = fetchLabels;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
