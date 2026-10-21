/* =========================================================
   account.js  (classic script, deferred; settings.html only)
   "Your data & privacy" card:
     - download everything stored about the account (JSON)
     - create a new recovery code (needs the password)
     - delete the account and all its data (needs the password)
   ========================================================= */
(function () {
    "use strict";

    var BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";

    function token() { try { return localStorage.getItem("access_token"); } catch (e) { return null; } }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }

    function api(url, options) {
        options = options || {};
        options.headers = Object.assign({ "Authorization": "Bearer " + token() }, options.headers || {});
        return fetch(BASE + url, options);
    }
    function postJson(url, body) {
        return api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); });
    }

    function build() {
        var grid = document.querySelector(".settings-grid");
        if (!grid || document.getElementById("accountDataCard")) return;
        if (window.baIsDemo && window.baIsDemo()) return;   // the shared demo account has nothing to export or delete
        var card = document.createElement("div");
        card.className = "card settings-card account-card";
        card.id = "accountDataCard";
        card.innerHTML =
            "<h3>Your data &amp; privacy</h3>" +
            '<p class="acc-note">Your data belongs to you. Read the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> and the <a href="/terms" target="_blank" rel="noopener">Terms of Use</a>.</p>' +

            '<div class="acc-block"><h4>Download my data</h4><p>Everything stored about your account (profile, datasets list, goals, alerts, widgets) as a JSON file. Your uploaded files stay available on the Data page.</p>' +
            '<button type="button" class="acc-btn" id="accExport">Download my data</button><p class="acc-msg" id="accExportMsg" role="status"></p></div>' +

            '<div class="acc-block"><h4>Recovery code</h4><p>Lets you reset a forgotten password. Creating a new code makes the old one stop working.</p>' +
            '<div class="acc-row"><input type="password" id="accCodePassword" placeholder="Your password" autocomplete="current-password"><button type="button" class="acc-btn" id="accNewCode">New recovery code</button></div>' +
            '<div class="acc-code" id="accCodeBox" hidden><code id="accCode"></code><span>Save it now: it is shown only once.</span></div>' +
            '<p class="acc-msg" id="accCodeMsg" role="status"></p></div>' +

            '<div class="acc-block acc-danger"><h4>Delete my account</h4><p>Permanently deletes your account, all uploaded datasets, goals, alerts and dashboards. This cannot be undone.</p>' +
            '<div class="acc-row"><input type="password" id="accDelPassword" placeholder="Your password" autocomplete="current-password"><input type="text" id="accDelConfirm" placeholder="Type DELETE to confirm" autocomplete="off"></div>' +
            '<button type="button" class="acc-btn danger" id="accDelete" disabled>Delete my account</button><p class="acc-msg" id="accDelMsg" role="status"></p></div>';
        grid.appendChild(card);

        var $ = function (id) { return document.getElementById(id); };

        $("accExport").addEventListener("click", function () {
            var msg = $("accExportMsg"); msg.textContent = "Preparing…";
            api("/api/account/export").then(function (r) {
                if (!r.ok) throw new Error("export failed");
                return r.blob();
            }).then(function (blob) {
                var url = URL.createObjectURL(blob), a = document.createElement("a");
                a.href = url; a.download = "my-data.json"; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                msg.textContent = "Downloaded.";
            }).catch(function () { msg.textContent = "Could not download your data. Please try again."; });
        });

        $("accNewCode").addEventListener("click", function () {
            var msg = $("accCodeMsg"), pw = $("accCodePassword").value;
            $("accCodeBox").hidden = true;
            if (!pw) { msg.textContent = "Enter your password first."; return; }
            msg.textContent = "Working…";
            postJson("/api/account/recovery-code", { password: pw }).then(function (r) {
                if (r.status === 429) { msg.textContent = r.body.detail || "Too many attempts. Try again later."; return; }
                if (!r.body.success) { msg.textContent = r.body.message || "Could not create a code."; return; }
                $("accCode").textContent = r.body.recovery_code;
                $("accCodeBox").hidden = false;
                $("accCodePassword").value = "";
                msg.textContent = "New code created. The old one no longer works.";
            }).catch(function () { msg.textContent = "Could not reach the server."; });
        });

        function syncDelete() { $("accDelete").disabled = !($("accDelPassword").value && $("accDelConfirm").value.trim() === "DELETE"); }
        $("accDelPassword").addEventListener("input", syncDelete);
        $("accDelConfirm").addEventListener("input", syncDelete);
        $("accDelete").addEventListener("click", function () {
            var msg = $("accDelMsg"); msg.textContent = "Deleting…";
            $("accDelete").disabled = true;
            postJson("/api/account/delete", { password: $("accDelPassword").value }).then(function (r) {
                if (r.status === 429) { msg.textContent = r.body.detail || "Too many attempts. Try again later."; syncDelete(); return; }
                if (!r.body.success) { msg.textContent = r.body.message || "Could not delete the account."; syncDelete(); return; }
                try { localStorage.clear(); } catch (e) { /* ignore */ }
                window.location.href = BASE ? "index.html" : "/";
            }).catch(function () { msg.textContent = "Could not reach the server."; syncDelete(); });
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();
