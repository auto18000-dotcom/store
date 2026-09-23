// TourGuid Store -- Supabase Auth + client, shared by every Store page that
// calls a live backend function. Loads after vendor/supabase.min.js and
// config.js.
//
// Key-safety guard: refuses to initialize with anything but a publishable
// key, and never echoes the rejected value anywhere (console, DOM, storage).
(function () {
  var cfg = window.TOURGUID_STORE_CONFIG || {};
  var key = cfg.SUPABASE_ANON_KEY || "";

  function keyShape(k) {
    if (k.indexOf("sb_publishable_") === 0) return "publishable";
    if (k.indexOf("sb_secret_") === 0) return "secret";
    if (k.indexOf("eyJ") === 0) return "legacy_jwt";
    return "unknown";
  }

  var shape = keyShape(key);
  var client = null;
  var initError = null;

  if (shape === "secret") {
    initError =
      "Refused to start: a secret key was configured instead of the publishable key. " +
      "This has been escalated -- do not use this build until it is replaced.";
    console.error("[TourGuid Store] " + initError);
  } else if (shape === "legacy_jwt") {
    initError =
      "Refused to start: that key was revoked (legacy JWT format). Ask for the current sb_publishable_... key.";
    console.error("[TourGuid Store] " + initError);
  } else if (shape === "unknown") {
    initError = "Store is not configured yet (no valid Supabase key set).";
    console.warn("[TourGuid Store] " + initError);
  } else if (!cfg.SUPABASE_URL) {
    initError = "Store is not configured yet (no Supabase URL set).";
    console.warn("[TourGuid Store] " + initError);
  } else {
    client = window.supabase.createClient(cfg.SUPABASE_URL, key);
  }

  var pendingResolvers = [];

  function currentSession() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) {
      return (r.data && r.data.session) || null;
    });
  }

  function openModal(mode) {
    var existing = document.getElementById("tg-auth-modal");
    if (existing) existing.remove();

    var wrap = document.createElement("div");
    wrap.id = "tg-auth-modal";
    wrap.className = "tg-auth-overlay";
    wrap.innerHTML =
      '<div class="tg-auth-box" role="dialog" aria-modal="true" aria-label="Sign in to TourGuid">' +
      '<button type="button" class="tg-auth-close" aria-label="Close">×</button>' +
      '<h2 class="tg-auth-title">' + (mode === "signup" ? "Create your TourGuid account" : "Sign in to TourGuid") + "</h2>" +
      '<p class="tg-auth-lead">Signing in lets the Store search live results and save them to a Journey.</p>' +
      '<form class="tg-auth-form" id="tg-auth-form">' +
      '<label>Email<input type="email" id="tg-auth-email" required autocomplete="email"></label>' +
      '<label>Password<input type="password" id="tg-auth-password" required minlength="8" autocomplete="' +
      (mode === "signup" ? "new-password" : "current-password") +
      '"></label>' +
      '<p class="tg-auth-status" id="tg-auth-status" role="status" aria-live="polite"></p>' +
      '<button type="submit" class="btn btn-primary">' + (mode === "signup" ? "Create account" : "Sign in") + "</button>" +
      "</form>" +
      '<button type="button" class="tg-auth-switch" id="tg-auth-switch">' +
      (mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account") +
      "</button>" +
      "</div>";
    document.body.appendChild(wrap);

    wrap.querySelector(".tg-auth-close").addEventListener("click", function () {
      wrap.remove();
    });
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) wrap.remove();
    });
    wrap.querySelector("#tg-auth-switch").addEventListener("click", function () {
      openModal(mode === "signup" ? "signin" : "signup");
    });

    var form = wrap.querySelector("#tg-auth-form");
    var status = wrap.querySelector("#tg-auth-status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!client) {
        status.textContent = initError || "Store is not configured yet.";
        return;
      }
      var email = form.querySelector("#tg-auth-email").value.trim();
      var password = form.querySelector("#tg-auth-password").value;
      status.textContent = mode === "signup" ? "Creating your account…" : "Signing in…";
      var call =
        mode === "signup"
          ? client.auth.signUp({ email: email, password: password })
          : client.auth.signInWithPassword({ email: email, password: password });
      call.then(function (result) {
        if (result.error) {
          status.textContent = result.error.message;
          return;
        }
        if (mode === "signup" && !(result.data && result.data.session)) {
          status.textContent = "Check your email to confirm your account, then sign in.";
          return;
        }
        wrap.remove();
        var resolvers = pendingResolvers.slice();
        pendingResolvers = [];
        currentSession().then(function (session) {
          resolvers.forEach(function (r) {
            r(session);
          });
        });
      });
    });

    return wrap;
  }

  // Resolves with the active session, prompting sign-in first if needed.
  // Never auto-creates an anonymous session -- a billable call must have a
  // real signed-in user behind it (F-01).
  function requireSession() {
    return currentSession().then(function (session) {
      if (session) return session;
      return new Promise(function (resolve) {
        pendingResolvers.push(resolve);
        openModal("signin");
      });
    });
  }

  window.TourGuidAuth = {
    client: client,
    initError: initError,
    getSession: currentSession,
    requireSession: requireSession,
    openSignIn: function () {
      openModal("signin");
    },
  };
})();
