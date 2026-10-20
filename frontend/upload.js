/* =========================================================
   upload.js  (classic script, deferred)
   Makes "upload your data" easy to find on every page:
     - button in the sidebar footer
     - button next to the live status in the page header
     - floating "Upload CSV" button (bottom right)
     - modal: drop a CSV / Excel file, check which column is which
       (suggested automatically), then upload
   On the Data page the existing upload box opens the same modal.
   Endpoints: POST /api/upload/preview and POST /api/upload
   (fields: file, mapping (JSON), sheet).
   ========================================================= */
(function () {
    "use strict";

    var API = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
    var REQUIRED = ["date", "product", "region", "sales", "cost", "units"];

    function token() {
        try { return localStorage.getItem("access_token"); } catch (e) { return null; }
    }

    function authHeaders() {
        var t = token();
        return t ? { "Authorization": "Bearer " + t } : {};
    }

    function fmtSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1024 / 1024).toFixed(2) + " MB";
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
        });
    }

    /* ---------- sample CSV ---------- */
    function sampleCsv() {
        var products = [["Laptop", 12500, 8500, 25], ["Monitor", 6800, 4200, 34], ["Keyboard", 3200, 1800, 80], ["Mouse", 2100, 1100, 95]];
        var regions = ["Athens", "Thessaloniki", "Larissa"];
        var lines = [REQUIRED.join(",")];
        for (var m = 0; m < 12; m++) {
            var month = String(m + 1).padStart(2, "0");
            for (var p = 0; p < products.length; p++) {
                var seasonal = 1 + 0.15 * Math.sin((m / 12) * Math.PI * 2) + m * 0.02;
                var region = regions[(m + p) % regions.length];
                var sales = Math.round(products[p][1] * seasonal);
                var cost = Math.round(products[p][2] * seasonal * 0.98);
                var units = Math.round(products[p][3] * seasonal);
                lines.push(["2025-" + month + "-" + String(5 + p * 6).padStart(2, "0"), products[p][0], region, sales, cost, units].join(","));
            }
        }
        return lines.join("\n") + "\n";
    }

    function downloadSample() {
        var blob = new Blob([sampleCsv()], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "sample_sales.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* ---------- modal ---------- */
    var modal = null;
    var ACCEPT = /\.(csv|tsv|txt|xlsx|xlsm)$/i;
    var KIND_LABEL = { date: "date", number: "number", text: "text", empty: "empty" };
    var state = { file: null, busy: false, preview: null, sheet: null };

    function buildModal() {
        modal = document.createElement("div");
        modal.className = "upload-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Upload dataset");
        modal.innerHTML =
            '<div class="upload-modal-backdrop" data-close></div>' +
            '<div class="upload-modal-box">' +
            '<button class="upload-modal-x" data-close aria-label="Close">&times;</button>' +
            '<h3 id="umTitle">Upload your data</h3>' +
            '<p class="um-sub" id="umSub">Add a CSV or Excel file. Any columns, any names: you choose what each one means.</p>' +

            '<div id="umStepPick">' +
            '<div class="um-drop" id="umDrop" tabindex="0">' +
            '<div class="um-icon">&#8679;</div>' +
            '<strong>Drag &amp; drop a CSV or Excel file here</strong>' +
            '<span>or click to choose a file (.csv, .xlsx)</span>' +
            '<input type="file" id="umFile" accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
            '</div>' +
            '<div class="um-cols"><span>We look for</span>' +
            '<code>date</code><code>sales</code><code>category</code><code>region</code><code>cost</code><code>units</code>' +
            '<span class="um-opt">(only date and sales are needed)</span></div>' +
            '</div>' +

            '<div id="umStepMap" hidden>' +
            '<div class="um-file" id="umFileInfo"></div>' +
            '<div class="um-sheet" id="umSheetRow" hidden><label for="umSheet">Sheet</label><select id="umSheet"></select></div>' +
            '<div class="um-found" id="umFound"></div>' +
            '<h4 class="um-h">What does each column mean?</h4>' +
            '<div class="um-map" id="umMap"></div>' +
            '<h4 class="um-h">Preview</h4>' +
            '<div class="um-preview" id="umPreview"></div>' +
            '</div>' +

            '<div id="umStepDone" hidden></div>' +

            '<div class="um-status" id="umStatus" role="status"></div>' +
            '<div class="um-actions">' +
            '<button type="button" class="um-link" id="umSample">Download sample CSV</button>' +
            '<span class="um-btns">' +
            '<button type="button" class="um-secondary" id="umBack" hidden>Choose another file</button>' +
            '<button type="button" class="um-primary" id="umUpload" disabled hidden>Upload</button>' +
            '<button type="button" class="um-primary" id="umDone" hidden>Show my data</button>' +
            '</span>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);

        modal.addEventListener("click", function (e) {
            if (e.target.hasAttribute && e.target.hasAttribute("data-close")) closeModal();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
        });

        var drop = modal.querySelector("#umDrop");
        var input = modal.querySelector("#umFile");
        drop.addEventListener("click", function () { input.click(); });
        drop.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
        });
        input.addEventListener("change", function () { if (input.files[0]) chooseFile(input.files[0]); });
        ["dragenter", "dragover"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-drag"); });
        });
        drop.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) chooseFile(f);
        });

        modal.querySelector("#umSample").addEventListener("click", downloadSample);
        modal.querySelector("#umUpload").addEventListener("click", doUpload);
        modal.querySelector("#umBack").addEventListener("click", showPick);
        modal.querySelector("#umDone").addEventListener("click", function () { window.location.reload(); });
        modal.querySelector("#umSheet").addEventListener("change", function (e) { loadPreview(e.target.value); });
        modal.querySelector("#umMap").addEventListener("change", onMapChange);
    }

    function $(id) { return modal.querySelector("#" + id); }

    function setStatus(html, kind) {
        var el = $("umStatus");
        el.className = "um-status" + (kind ? " " + kind : "");
        el.innerHTML = html || "";
    }

    function show(id, on) { $(id).hidden = !on; }

    function showPick() {
        if (state.busy) return;
        state.file = null;
        state.preview = null;
        $("umFile").value = "";
        show("umStepPick", true); show("umStepMap", false); show("umStepDone", false);
        show("umUpload", false); show("umBack", false); show("umDone", false);
        $("umTitle").textContent = "Upload your data";
        $("umSub").hidden = false;
        modal.querySelector(".upload-modal-box").classList.remove("wide");
        setStatus("", "");
    }

    function authFetch(url, options) {
        options = options || {};
        options.headers = authHeaders();
        return fetch(API + url, options).then(function (res) {
            if (res.status === 401) {
                try { localStorage.removeItem("access_token"); } catch (e) { /* ignore */ }
                window.location.href = "index.html";
                throw new Error("unauthorized");
            }
            return res.json().then(function (body) { return { ok: res.ok, body: body || {} }; });
        });
    }

    /* ----- step 1 -> 2: read the file and ask the server what it sees ----- */
    function chooseFile(file) {
        if (!ACCEPT.test(file.name)) {
            var hint = /\.xls$/i.test(file.name) ? "Old .xls files are not supported. Save it as .xlsx or .csv first." : "Please choose a .csv or .xlsx file.";
            setStatus(hint, "err");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setStatus("This file is " + fmtSize(file.size) + ". The maximum size is 10 MB.", "err");
            return;
        }
        state.file = file;
        state.sheet = null;
        loadPreview(null);
    }

    function loadPreview(sheet) {
        var form = new FormData();
        form.append("file", state.file);
        if (sheet) form.append("sheet", sheet);
        state.busy = true;
        setStatus("Reading your file…", "");
        authFetch("/api/upload/preview", { method: "POST", body: form })
            .then(function (r) {
                state.busy = false;
                var b = r.body;
                if (!r.ok || !b.success) {
                    setStatus(esc(b.message || b.detail || "Could not read this file."), "err");
                    return;
                }
                state.preview = b;
                state.sheet = b.sheet;
                renderMap(b);
            })
            .catch(function (err) {
                state.busy = false;
                if (err && err.message === "unauthorized") return;
                setStatus("Could not reach the server. Make sure it is running.", "err");
            });
    }

    function colOptions(columns, selected, allowNone) {
        var html = allowNone ? '<option value="">— not in my file —</option>' : '<option value="" disabled>Choose a column…</option>';
        columns.forEach(function (c) {
            html += '<option value="' + esc(c.name) + '"' + (c.name === selected ? " selected" : "") + ">" +
                esc(c.name) + " (" + (KIND_LABEL[c.kind] || c.kind) + ")</option>";
        });
        return html;
    }

    var CONF_TEXT = { name: "matched by name", data: "guessed from the values" };
    var HELP = {
        date: "When the sale happened",
        sales: "Money earned (revenue)",
        product: "What was sold, or any category",
        region: "Where, or any second grouping (store, channel…)",
        cost: "What it cost you",
        units: "How many were sold",
        profit: "Use this if you have profit instead of cost"
    };

    function renderMap(b) {
        show("umStepPick", false); show("umStepMap", true); show("umStepDone", false);
        show("umUpload", true); show("umBack", true);
        $("umTitle").textContent = "Check your columns";
        modal.querySelector(".upload-modal-box").classList.add("wide");
        $("umSub").hidden = true;
        $("umFileInfo").innerHTML = "<b>" + esc(b.filename) + "</b><span>" + Number(b.rows).toLocaleString() + " rows · " + b.columns.length + " columns · " + fmtSize(state.file.size) + "</span>";

        var sheetRow = $("umSheetRow");
        if (b.sheets && b.sheets.length > 1) {
            sheetRow.hidden = false;
            $("umSheet").innerHTML = b.sheets.map(function (n) {
                return '<option value="' + esc(n) + '"' + (n === b.sheet ? " selected" : "") + ">" + esc(n) + "</option>";
            }).join("");
        } else {
            sheetRow.hidden = true;
        }

        // categories the file contains
        var texts = b.columns.filter(function (c) { return c.kind === "text" && c.unique > 1; });
        $("umFound").innerHTML = texts.length
            ? "<span>Categories found:</span>" + texts.map(function (c) {
                var top = (c.top_values || []).slice(0, 3).map(function (t) { return esc(t.value); }).join(", ");
                return '<span class="um-chip" title="' + esc(top) + '"><b>' + esc(c.name) + "</b> " + c.unique + " values</span>";
            }).join("")
            : "";

        $("umMap").innerHTML = b.fields.map(function (f) {
            var current = b.mapping[f.key] || "";
            var conf = b.confidence[f.key];
            return '<div class="um-field' + (f.required ? " req" : "") + '" data-field="' + f.key + '">' +
                '<label for="umf_' + f.key + '"><b>' + esc(f.label) + "</b>" + (f.required ? '<i title="required">*</i>' : "") +
                "<small>" + esc(HELP[f.key] || "") + "</small></label>" +
                '<select id="umf_' + f.key + '" data-field="' + f.key + '">' + colOptions(b.columns, current, !f.required) + "</select>" +
                '<em class="um-conf">' + (current && CONF_TEXT[conf] ? CONF_TEXT[conf] : "") + "</em></div>";
        }).join("");

        renderPreview();
        validate();
    }

    function currentMapping() {
        var m = {};
        modal.querySelectorAll("#umMap select").forEach(function (sel) { m[sel.dataset.field] = sel.value || null; });
        return m;
    }

    function onMapChange(e) {
        var sel = e.target.closest("select");
        if (sel) {
            var conf = sel.parentNode.querySelector(".um-conf");
            if (conf) conf.textContent = sel.value ? "your choice" : "";
        }
        renderPreview();
        validate();
    }

    function renderPreview() {
        var b = state.preview;
        if (!b) return;
        var m = currentMapping();
        var role = {};
        Object.keys(m).forEach(function (k) { if (m[k]) role[m[k]] = k; });
        var head = b.columns.map(function (c) {
            var r = role[c.name];
            return "<th" + (r ? ' class="mapped"' : "") + ">" + esc(c.name) + (r ? "<span>" + esc(r) + "</span>" : "") + "</th>";
        }).join("");
        var rows = b.preview_rows.map(function (row) {
            return "<tr>" + row.map(function (cell, i) {
                return "<td" + (role[b.columns[i].name] ? ' class="mapped"' : "") + ">" + esc(cell) + "</td>";
            }).join("") + "</tr>";
        }).join("");
        $("umPreview").innerHTML = "<table><thead><tr>" + head + "</tr></thead><tbody>" + rows + "</tbody></table>";
    }

    function validate() {
        var m = currentMapping();
        var btn = $("umUpload");
        var problems = [];
        if (!m.date) problems.push("Choose the date column.");
        if (!m.sales) problems.push("Choose the sales column.");
        var used = {};
        Object.keys(m).forEach(function (k) {
            if (!m[k]) return;
            if (used[m[k]]) problems.push("'" + m[k] + "' is used for both " + used[m[k]] + " and " + k + ".");
            used[m[k]] = k;
        });
        var notes = [];
        if (!m.cost && !m.profit) notes.push("No cost column: profit and margin will equal sales.");
        if (!m.units) notes.push("No units column: each row counts as 1 unit.");
        if (!m.product) notes.push("No category column: everything is grouped as “All products”.");
        if (!m.region) notes.push("No region column: everything is grouped as “All regions”.");
        btn.disabled = problems.length > 0 || state.busy;
        if (problems.length) setStatus(esc(problems[0]), "err");
        else setStatus(notes.length ? "<span class='um-note'>" + notes.map(esc).join("<br>") + "</span>" : "", "");
    }

    /* ----- step 2 -> 3: save ----- */
    function doUpload() {
        if (!state.file || state.busy) return;
        var btn = $("umUpload");
        var form = new FormData();
        form.append("file", state.file);
        form.append("mapping", JSON.stringify(currentMapping()));
        if (state.sheet) form.append("sheet", state.sheet);
        state.busy = true;
        btn.disabled = true;
        btn.textContent = "Uploading…";
        setStatus("Uploading and validating…", "");

        authFetch("/api/upload", { method: "POST", body: form })
            .then(function (r) {
                var b = r.body;
                state.busy = false;
                btn.textContent = "Upload";
                if (r.ok && b.success) {
                    try { localStorage.setItem("dataset_changed_at", String(Date.now())); } catch (e) { /* ignore */ }
                    renderDone(b);
                    return;
                }
                setStatus(esc(b.message || b.detail || "Upload failed."), "err");
                btn.disabled = false;
            })
            .catch(function (err) {
                state.busy = false;
                btn.textContent = "Upload";
                btn.disabled = false;
                if (err && err.message === "unauthorized") return;
                setStatus("Could not reach the server. Make sure it is running.", "err");
            });
    }

    function chips(list, total) {
        var html = list.slice(0, 12).map(function (v) { return '<span class="um-chip">' + esc(v) + "</span>"; }).join("");
        if (total > 12) html += '<span class="um-chip more">+' + (total - 12) + " more</span>";
        return html;
    }

    function renderDone(b) {
        var sum = b.summary || {};
        show("umStepMap", false); show("umStepDone", true);
        show("umUpload", false); show("umBack", false); show("umDone", true);
        $("umTitle").textContent = "Your data is ready";
        $("umStepDone").innerHTML =
            '<div class="um-result">' +
            "<p><b>" + esc(b.filename) + "</b> · " + Number(b.rows).toLocaleString() + " rows" +
            (sum.date_min ? " · " + esc(sum.date_min) + " → " + esc(sum.date_max) : "") + "</p>" +
            (sum.products ? '<div class="um-found"><span>' + sum.product_count + " categories:</span>" + chips(sum.products, sum.product_count) + "</div>" : "") +
            (sum.regions ? '<div class="um-found"><span>' + sum.region_count + " groups:</span>" + chips(sum.regions, sum.region_count) + "</div>" : "") +
            ((b.warnings && b.warnings.length) ? '<ul class="um-warn">' + b.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") +
            "</div>";
        setStatus("Uploaded successfully. Every page now uses this file.", "ok");
    }

    function openModal(file) {
        if (!modal) buildModal();
        showPick();
        modal.classList.add("open");
        document.body.classList.add("modal-open");
        if (file) chooseFile(file);
        else setTimeout(function () { $("umDrop").focus(); }, 50);
    }

    function closeModal() {
        if (!modal || state.busy) return;
        var done = !$("umStepDone").hidden;
        modal.classList.remove("open");
        document.body.classList.remove("modal-open");
        if (done) window.location.reload();
    }

    /* ---------- entry points ---------- */
    function addTriggers() {
        // floating button
        var fab = document.createElement("button");
        fab.type = "button";
        fab.className = "fab-upload";
        fab.setAttribute("data-open-upload", "");
        fab.innerHTML = '<span>&#8679;</span> Upload data';
        document.body.appendChild(fab);

        // sidebar
        var footer = document.querySelector(".nav-footer");
        if (footer) {
            var side = document.createElement("button");
            side.type = "button";
            side.className = "nav-upload";
            side.setAttribute("data-open-upload", "");
            side.innerHTML = '<span>&#8679;</span> Upload data';
            footer.insertBefore(side, footer.firstChild);
        }

        // page header
        var status = document.querySelector(".page-hero .dashboard-status, .page-hero .overview-data-status");
        if (status && status.parentNode) {
            var wrap = document.createElement("div");
            wrap.className = "hero-actions";
            var hb = document.createElement("button");
            hb.type = "button";
            hb.className = "hero-upload";
            hb.setAttribute("data-open-upload", "");
            hb.innerHTML = '<span>&#8679;</span> Upload data';
            status.parentNode.insertBefore(wrap, status);
            wrap.appendChild(hb);
            wrap.appendChild(status);
        }

        document.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-open-upload]") : null;
            if (t) { e.preventDefault(); openModal(); }
        });
    }

    function syncSession() {
        document.body.classList.toggle("has-session", !!token());
    }

    /* ---------- Data page: drag & drop on the existing box ---------- */
    function enhanceDataPage() {
        var area = document.querySelector(".upload-area");
        var input = document.getElementById("csvFile");
        if (!area || !input) return;

        var hint = document.createElement("div");
        hint.className = "upload-hint";
        hint.innerHTML = "<strong>Drag &amp; drop a CSV or Excel file here</strong><span>or use the file picker below. Any column names work: you choose what each column means. Only <code>date</code> and <code>sales</code> are required.</span>";
        area.insertBefore(hint, area.firstChild);

        ["dragenter", "dragover"].forEach(function (ev) {
            area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.add("is-drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.remove("is-drag"); });
        });
        area.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) openModal(f);
        });
        // Picking a file here opens the same "check your columns" screen.
        input.addEventListener("change", function () {
            var f = input.files && input.files[0];
            if (f) { openModal(f); input.value = ""; }
        });

        var sample = document.createElement("button");
        sample.type = "button";
        sample.className = "sample-link";
        sample.textContent = "Download sample CSV";
        sample.addEventListener("click", downloadSample);
        var status = document.getElementById("uploadStatus");
        if (status) area.insertBefore(sample, status);
    }

    function boot() {
        if (!document.querySelector(".main-nav")) return; // admin page etc.
        addTriggers();
        enhanceDataPage();
        syncSession();
        setInterval(syncSession, 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
