/* =========================================================
   auth-extras.js  (classic script, deferred; index.html only)
   Extra cards on the sign-in screen:
     - "Forgot password?"  -> reset with the recovery code
     - recovery code shown once after registration (or reset)
   The sign-in and register cards themselves live in app.js.
   ========================================================= */
(function () {
    "use strict";

    var BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
    var CARDS = ["loginCard", "registerCard", "resetCard", "recoveryCard"];

    function $(id) { return document.getElementById(id); }

    function show(id) {
        CARDS.forEach(function (c) { var el = $(c); if (el) el.style.display = c === id ? "block" : "none"; });
        var msg = $("authMessage"); if (msg && id !== "loginCard") msg.textContent = "";
    }

    function post(url, body) {
        return fetch(BASE + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); });
    }

    /* ----- recovery code card ----- */
    function showRecovery(code, title, note, after) {
        $("recoveryContinue").dataset.after = after || "You can sign in now.";
        $("recoveryTitle").textContent = title || "Save your recovery code";
        $("recoveryNote").textContent = note || "If you forget your password, this code is the only way to reset it. It is shown once. Write it down or store it in a password manager.";
        $("recoveryCode").textContent = code;
        $("recoverySaved").checked = false;
        $("recoveryContinue").disabled = true;
        $("recoveryCopy").textContent = "Copy";
        show("recoveryCard");
    }
    window.baShowRecovery = showRecovery;

    function bind() {
        var login = document.querySelector("#authScreen .auth-card");
        if (login && !login.id) login.id = "loginCard";

        $("showReset") && $("showReset").addEventListener("click", function () { show("resetCard"); });
        $("resetBack") && $("resetBack").addEventListener("click", function () { show("loginCard"); });

        $("recoverySaved").addEventListener("change", function () { $("recoveryContinue").disabled = !this.checked; });
        $("recoveryContinue").addEventListener("click", function () {
            show("loginCard");
            var msg = $("authMessage");
            if (msg) msg.textContent = $("recoveryContinue").dataset.after || "You can sign in now.";
        });
        $("recoveryCopy").addEventListener("click", function () {
            var code = $("recoveryCode").textContent, btn = this;
            var done = function () { btn.textContent = "Copied"; };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, done);
            else done();
        });

        $("resetButton").addEventListener("click", function () {
            var username = $("resetUsername").value.trim();
            var code = $("resetCode").value.trim();
            var pw = $("resetPassword").value;
            var pw2 = $("resetPassword2").value;
            var msg = $("resetMessage");
            if (!username || !code || !pw) { msg.textContent = "Please fill in all fields."; return; }
            if (pw !== pw2) { msg.textContent = "The passwords do not match."; return; }
            var btn = this; btn.disabled = true; msg.textContent = "Checking…";
            post("/api/reset-password", { username: username, recovery_code: code, new_password: pw })
                .then(function (r) {
                    btn.disabled = false;
                    if (r.status === 429) { msg.textContent = r.body.detail || "Too many attempts. Try again later."; return; }
                    if (!r.body.success) { msg.textContent = r.body.message || "Could not reset the password."; return; }
                    ["resetUsername", "resetCode", "resetPassword", "resetPassword2"].forEach(function (i) { $(i).value = ""; });
                    msg.textContent = "";
                    showRecovery(r.body.recovery_code, "Password changed", "Your old recovery code no longer works. Save this new one: it is shown once.", "Password changed. You can sign in with the new password.");
                })
                .catch(function () { btn.disabled = false; msg.textContent = "Could not reach the server."; });
        });

        // "Create an account" bar in the demo leads here
        if (window.location.hash === "#register" && $("registerCard")) {
            show("registerCard");
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
})();
