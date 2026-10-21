/* =========================================================
   demo.js  (classic script, deferred)
   - Any element with data-demo starts the read-only demo:
     it asks the server for a demo token and opens the app.
   - While the demo is active, a small bar says so and offers
     "Create account" / "Exit demo"; upload buttons are hidden
     (the server refuses changes in demo mode anyway).
   Used on the landing page, the login screen and every app page.
   ========================================================= */
(function () {
    "use strict";

    var BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
    var APP = window.location.protocol === "file:" ? "index.html" : "/app";

    function getToken() { try { return localStorage.getItem("access_token"); } catch (e) { return null; } }

    function role(token) {
        try {
            var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            return JSON.parse(atob(part)).role || null;
        } catch (e) { return null; }
    }

    function isDemo() { var t = getToken(); return !!t && role(t) === "demo"; }

    function startDemo(trigger) {
        var label = trigger && trigger.textContent;
        if (trigger) { trigger.disabled = true; trigger.textContent = "Opening the demo…"; }
        fetch(BASE + "/api/demo-login", { method: "POST" })
            .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
            .then(function (r) {
                if (!r.ok || !r.body.access_token) throw new Error(r.body.detail || "demo unavailable");
                try {
                    localStorage.setItem("access_token", r.body.access_token);
                    localStorage.removeItem("ba_labels_v1");
                } catch (e) { /* ignore */ }
                window.location.href = APP;
            })
            .catch(function (err) {
                if (trigger) { trigger.disabled = false; trigger.textContent = label; }
                window.alert("The demo could not be started: " + (err && err.message ? err.message : "please try again."));
            });
    }

    function leaveDemo(goToRegister) {
        try { localStorage.removeItem("access_token"); localStorage.removeItem("ba_labels_v1"); } catch (e) { /* ignore */ }
        window.location.href = APP + (goToRegister ? "#register" : "");
        // same page + only a hash change would not reload, so force it
        if (window.location.pathname.replace(/\/$/, "") === APP.replace(/\/$/, "")) window.location.reload();
    }

    function showBar() {
        document.body.classList.add("is-demo");
        var bar = document.createElement("div");
        bar.className = "demo-bar";
        bar.setAttribute("role", "status");
        bar.innerHTML =
            '<span class="demo-pill">DEMO</span>' +
            "<span>You are exploring sample data. Changes are turned off.</span>" +
            '<button type="button" class="demo-create">Create an account</button>' +
            '<button type="button" class="demo-exit">Exit demo</button>';
        document.body.appendChild(bar);
        bar.querySelector(".demo-create").addEventListener("click", function () { leaveDemo(true); });
        bar.querySelector(".demo-exit").addEventListener("click", function () { leaveDemo(false); });
    }

    function boot() {
        document.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-demo]") : null;
            if (t) { e.preventDefault(); startDemo(t); }
        });
        if (isDemo() && document.querySelector(".main-nav")) showBar();
    }

    window.baIsDemo = isDemo;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
