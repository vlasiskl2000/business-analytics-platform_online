/* =========================================================
   upload.js  (classic script, deferred)
   Makes "upload your data" easy to find on every page:
     - button in the sidebar footer
     - button next to the live status in the page header
     - floating "Upload CSV" button (bottom right)
     - modal with drag & drop, required-columns hint and a
       downloadable sample CSV
   On the Data page the existing upload box also accepts
   drag & drop.  The upload itself uses the same endpoint as
   before (POST /api/upload, field "file").
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
    var state = { file: null, busy: false };

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
            '<h3>Upload your data</h3>' +
            '<p class="um-sub">Add a CSV file and every page updates to use it.</p>' +
            '<div class="um-drop" id="umDrop" tabindex="0">' +
            '<div class="um-icon">&#8679;</div>' +
            '<strong>Drag &amp; drop a CSV here</strong>' +
            '<span>or click to choose a file</span>' +
            '<input type="file" id="umFile" accept=".csv,text/csv" hidden>' +
            '</div>' +
            '<div class="um-file" id="umFileInfo" hidden></div>' +
            '<div class="um-cols"><span>Required columns</span>' +
            REQUIRED.map(function (c) { return "<code>" + c + "</code>"; }).join("") +
            '</div>' +
            '<div class="um-status" id="umStatus" role="status"></div>' +
            '<div class="um-actions">' +
            '<button type="button" class="um-link" id="umSample">Download sample CSV</button>' +
            '<button type="button" class="um-primary" id="umUpload" disabled>Upload</button>' +
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
        input.addEventListener("change", function () { if (input.files[0]) setFile(input.files[0]); });
        ["dragenter", "dragover"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-drag"); });
        });
        drop.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) setFile(f);
        });

        modal.querySelector("#umSample").addEventListener("click", downloadSample);
        modal.querySelector("#umUpload").addEventListener("click", doUpload);
    }

    function setStatus(html, kind) {
        var el = modal.querySelector("#umStatus");
        el.className = "um-status" + (kind ? " " + kind : "");
        el.innerHTML = html || "";
    }

    function setFile(file) {
        var info = modal.querySelector("#umFileInfo");
        var btn = modal.querySelector("#umUpload");
        if (!/\.csv$/i.test(file.name)) {
            state.file = null;
            info.hidden = true;
            btn.disabled = true;
            setStatus("Please choose a .csv file.", "err");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            state.file = null;
            info.hidden = true;
            btn.disabled = true;
            setStatus("This file is " + fmtSize(file.size) + ". The maximum size is 10 MB.", "err");
            return;
        }
        state.file = file;
        info.hidden = false;
        info.innerHTML = "<b>" + esc(file.name) + "</b><span>" + fmtSize(file.size) + "</span>";
        btn.disabled = false;
        setStatus("", "");
    }

    function openModal() {
        if (!modal) buildModal();
        state.file = null;
        modal.querySelector("#umFileInfo").hidden = true;
        modal.querySelector("#umUpload").disabled = true;
        modal.querySelector("#umFile").value = "";
        setStatus("", "");
        modal.classList.add("open");
        document.body.classList.add("modal-open");
        setTimeout(function () { modal.querySelector("#umDrop").focus(); }, 50);
    }

    function closeModal() {
        if (!modal || state.busy) return;
        modal.classList.remove("open");
        document.body.classList.remove("modal-open");
    }

    function doUpload() {
        if (!state.file || state.busy) return;
        var btn = modal.querySelector("#umUpload");
        var form = new FormData();
        form.append("file", state.file);
        state.busy = true;
        btn.disabled = true;
        btn.textContent = "Uploading…";
        setStatus("Uploading and validating…", "");

        fetch(API + "/api/upload", { method: "POST", headers: authHeaders(), body: form })
            .then(function (res) {
                if (res.status === 401) {
                    try { localStorage.removeItem("access_token"); } catch (e) { /* ignore */ }
                    window.location.href = "index.html";
                    throw new Error("unauthorized");
                }
                return res.json().then(function (body) { return { ok: res.ok, body: body }; });
            })
            .then(function (r) {
                var b = r.body || {};
                if (r.ok && b.success) {
                    try { localStorage.setItem("dataset_changed_at", String(Date.now())); } catch (e) { /* ignore */ }
                    setStatus("Uploaded <b>" + esc(b.filename) + "</b> (" + Number(b.rows).toLocaleString() + " rows). Refreshing…", "ok");
                    setTimeout(function () { window.location.reload(); }, 900);
                    return;
                }
                var msg = b.message || b.detail || "Upload failed.";
                if (b.missing_columns && b.missing_columns.length) {
                    msg += " Missing: " + b.missing_columns.map(function (c) { return "<code>" + esc(c) + "</code>"; }).join(" ");
                }
                setStatus(msg, "err");
                state.busy = false;
                btn.disabled = false;
                btn.textContent = "Upload";
            })
            .catch(function (err) {
                if (err && err.message === "unauthorized") return;
                setStatus("Could not reach the server. Make sure it is running.", "err");
                state.busy = false;
                btn.disabled = false;
                btn.textContent = "Upload";
            });
    }

    /* ---------- entry points ---------- */
    function addTriggers() {
        // floating button
        var fab = document.createElement("button");
        fab.type = "button";
        fab.className = "fab-upload";
        fab.setAttribute("data-open-upload", "");
        fab.innerHTML = '<span>&#8679;</span> Upload CSV';
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
            hb.innerHTML = '<span>&#8679;</span> Upload CSV';
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
        hint.innerHTML = "<strong>Drag &amp; drop a CSV file here</strong><span>or use the file picker below. Required columns: " +
            REQUIRED.map(function (c) { return "<code>" + c + "</code>"; }).join(" ") + "</span>";
        area.insertBefore(hint, area.firstChild);

        ["dragenter", "dragover"].forEach(function (ev) {
            area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.add("is-drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.remove("is-drag"); });
        });
        area.addEventListener("drop", function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            try {
                var dt = new DataTransfer();
                dt.items.add(f);
                input.files = dt.files;
                var status = document.getElementById("uploadStatus");
                if (status) status.textContent = "Selected " + f.name + " (" + fmtSize(f.size) + "). Press Upload CSV.";
            } catch (err) { /* older browsers: use the picker */ }
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
