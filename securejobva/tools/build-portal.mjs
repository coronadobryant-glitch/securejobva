/* Composes status.html and admin.html from the chrome the other two pages
   already use, so the portal cannot drift away from the site around it. */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "careers.html";
const src = readFileSync(SRC, "utf8");
const L = src.split(/\r?\n/);
const nl = "\r\n";
const slice = (a, b) => L.slice(a - 1, b).join(nl);

/* Lifted verbatim rather than retyped: tokens, base, buttons, nav, the section
   helper, the footer, and the two things that must run before paint. */
const TOKENS_TO_NAV = slice(7, 185);
const SECTIONS      = slice(239, 244);
const FOOTER_CSS    = slice(349, 359);
const FONTS         = slice(2, 4);
const THEME_SCRIPT  = slice(683, 694);
const SVG_DEFS      = slice(695, 703);
const BRAND_SVG     = slice(726, 733);

const PAGE_CSS = `
/* ---------- portal ---------- */
.pt{padding:clamp(2.5rem,5vw,4rem) 0 clamp(3rem,6vw,4.5rem);min-height:60vh}
.pt__head{margin-bottom:2rem}
.pt__head h1{font-size:var(--step-3);margin:.5rem 0 .6rem}
.pt__head p{color:var(--ink-2);max-width:56ch;margin:0}

.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:clamp(1.4rem,3vw,2rem);box-shadow:var(--shadow)}
.card + .card{margin-top:1.1rem}

/* Google's mark must keep its own colours, so the button is light in both
   themes rather than inheriting the page's ink. */
.gbtn{
  display:inline-flex;align-items:center;gap:.7rem;
  padding:.8rem 1.15rem;border-radius:9px;cursor:pointer;
  background:#FFFFFF;color:#1F1F1F;border:1px solid #DADCE0;
  font-family:inherit;font-size:.98rem;font-weight:600;
}
.gbtn:hover{background:#F7F8F8}
.gbtn svg{flex:none}

.who{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;justify-content:space-between;margin-bottom:1.5rem}
.who__id{display:flex;align-items:center;gap:.6rem;min-width:0}
.who__av{width:34px;height:34px;border-radius:50%;flex:none;background:var(--accent-soft);display:grid;place-items:center;font-weight:700;color:var(--accent-deep);font-size:.9rem}
.who__t{min-width:0}
.who__n{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who__e{display:block;font-size:.82rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------- the four stages ---------- */
.stg{list-style:none;padding:0;margin:1.6rem 0 0;display:grid;gap:0}
.stg li{display:grid;grid-template-columns:2rem 1fr;gap:1rem;padding-bottom:1.6rem;position:relative}
.stg li:last-child{padding-bottom:0}
/* The rail is drawn behind the dots, stopping short of the last one. */
.stg li:not(:last-child)::before{
  content:"";position:absolute;left:.94rem;top:2rem;bottom:0;
  width:2px;background:var(--line);
}
.stg li.is-done:not(:last-child)::before{background:var(--accent)}
.stg__dot{
  width:2rem;height:2rem;border-radius:50%;display:grid;place-items:center;
  background:var(--surface-2);color:var(--muted);border:2px solid var(--line);
  font-family:"IBM Plex Mono",monospace;font-size:.75rem;font-weight:600;z-index:1;
}
.stg li.is-done .stg__dot{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.stg li.is-now .stg__dot{background:var(--signal);border-color:var(--signal);color:var(--signal-ink)}
.stg__t{font-weight:700;display:block;margin-top:.3rem}
.stg li:not(.is-done):not(.is-now) .stg__t{color:var(--muted);font-weight:600}
.stg__d{display:block;font-size:.9rem;color:var(--ink-2);margin-top:.2rem;line-height:1.55}
.stg__badge{
  display:inline-block;margin-top:.45rem;
  background:var(--signal);color:var(--signal-ink);
  font-family:"IBM Plex Mono",monospace;font-size:.63rem;letter-spacing:.11em;
  text-transform:uppercase;font-weight:600;padding:.22rem .5rem;border-radius:4px;
}

.meta{list-style:none;padding:0;margin:1.5rem 0 0;display:grid;gap:.55rem;font-size:.92rem}
.meta li{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:space-between;padding-bottom:.55rem;border-bottom:1px solid var(--line)}
.meta li:last-child{border-bottom:0;padding-bottom:0}
.meta b{color:var(--muted);font-weight:500}

.note{padding:1rem 1.15rem;border-radius:9px;background:var(--accent-soft);border-left:3px solid var(--accent);font-size:.92rem;color:var(--ink-2);line-height:1.55}
.note--warn{background:#FFF6E5;border-left-color:var(--signal);color:var(--ink-2)}
:root[data-theme="dark"] .note--warn{background:#2A2110}
.msg{margin-top:1rem;font-size:.92rem;color:var(--muted)}
.msg--bad{color:#B3261E}
:root[data-theme="dark"] .msg--bad{color:#F2B8B5}

.spin{display:inline-block;width:15px;height:15px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px;margin-right:.5rem}
@keyframes sp{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}

/* ---------- admin ---------- */
.adm__bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:1.2rem}
.adm__bar input,.adm__bar select{
  font-family:inherit;font-size:.93rem;padding:.55rem .7rem;
  border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);
}
.adm__bar input{flex:1;min-width:12rem}
.adm__count{font-family:"IBM Plex Mono",monospace;font-size:.75rem;color:var(--muted)}

.rows{display:grid;gap:.8rem}
.row{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:1.05rem 1.15rem}
.row__top{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:baseline;justify-content:space-between}
.row__n{font-weight:700}
.row__meta{font-size:.85rem;color:var(--muted)}
.row__tags{font-family:"IBM Plex Mono",monospace;font-size:.72rem;color:var(--muted);margin-top:.3rem}
.row__ctl{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-top:.85rem}
.row__ctl select{font-family:inherit;font-size:.9rem;padding:.45rem .6rem;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}
.row__ctl textarea{
  flex:1;min-width:14rem;font-family:inherit;font-size:.9rem;padding:.5rem .65rem;
  border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);
  resize:vertical;min-height:2.4rem;
}
.row__ok{font-size:.8rem;color:var(--accent);opacity:0;transition:opacity .18s ease}
.row__ok.is-on{opacity:1}
.pill{
  display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:.64rem;
  letter-spacing:.09em;text-transform:uppercase;font-weight:600;
  padding:.2rem .45rem;border-radius:4px;background:var(--surface-2);color:var(--muted);
}
.pill--applied{background:var(--surface-2);color:var(--ink-2)}
.pill--assessment{background:var(--accent-soft);color:var(--accent-deep)}
.pill--interview{background:var(--accent);color:var(--accent-ink)}
.pill--approved{background:var(--signal);color:var(--signal-ink)}
.pill--declined{background:var(--surface-2);color:var(--muted)}
`.trim();

/* The auth and data layer. Identical on both pages, so it is written once. */
const LIB = `
/* ── Supabase sign-in, without the SDK ────────────────────────────────────
   The rest of this site talks to PostgREST with fetch and no dependencies, so
   the portal does the same. Google is reached through Supabase's authorize
   endpoint, which hands the tokens back in the URL fragment. A fragment is
   never sent to a server, which is the property that makes this safe to do on
   a static page: Vercel never sees the token, only the browser does.

   The token is kept in sessionStorage rather than localStorage. It is a key to
   someone's personal data on a machine that may be shared, and closing the tab
   should end the session rather than leave it lying there for the next person. */
var SB   = "https://hmgravlkatfmerzbozct.supabase.co";
var ANON = "sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY";
var KEY  = "sjva-session";

function saveSession(s) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch (e) {}
}

/* A JWT's payload is base64url in the middle segment. Read locally only to
   show who is signed in and to pick a landing view — every actual permission
   decision is made by Postgres against the signature, never here. */
function readToken(tok) {
  try {
    var p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch (e) { return null; }
}

function signIn() {
  var back = location.origin + location.pathname;
  location.href = SB + "/auth/v1/authorize?provider=google&redirect_to=" +
    encodeURIComponent(back);
}

function signOut() {
  var s = loadSession();
  clearSession();
  if (s && s.access_token) {
    /* Best effort. The local session is already gone either way. */
    fetch(SB + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: ANON, Authorization: "Bearer " + s.access_token }
    }).catch(function () {});
  }
  location.reload();
}

/* Supabase returns the tokens in the fragment. Take them, then scrub the URL so
   a copied link never carries someone's credentials. */
function captureRedirect() {
  if (!location.hash || location.hash.indexOf("access_token") === -1) return false;
  var p = new URLSearchParams(location.hash.slice(1));
  var tok = p.get("access_token");
  if (!tok) return false;
  saveSession({
    access_token: tok,
    refresh_token: p.get("refresh_token") || "",
    expires_at: Date.now() + (parseInt(p.get("expires_in"), 10) || 3600) * 1000
  });
  history.replaceState(null, "", location.pathname);
  return true;
}

function authError() {
  if (!location.hash) return "";
  var p = new URLSearchParams(location.hash.slice(1));
  var e = p.get("error_description") || p.get("error");
  if (e) history.replaceState(null, "", location.pathname);
  return e ? decodeURIComponent(e.replace(/\\+/g, " ")) : "";
}

/* An expired token reads as "not signed in" rather than failing mid-request. */
function session() {
  var s = loadSession();
  if (!s || !s.access_token) return null;
  if (s.expires_at && Date.now() > s.expires_at - 30000) { clearSession(); return null; }
  return s;
}

function api(path, opts) {
  var s = session();
  if (!s) return Promise.reject(new Error("signed out"));
  opts = opts || {};
  var h = {
    apikey: ANON,
    Authorization: "Bearer " + s.access_token,
    "Content-Type": "application/json"
  };
  if (opts.headers) for (var k in opts.headers) h[k] = opts.headers[k];
  return fetch(SB + "/rest/v1/" + path, {
    method: opts.method || "GET",
    headers: h,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    if (r.status === 401) { clearSession(); throw new Error("signed out"); }
    if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
    return r.status === 204 ? null : r.json();
  });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* The four stages the careers page promises, in order. Declined is deliberately
   not in this list: it is an end, not a step along it. */
var STAGES = [
  ["applied",    "Application received",  "We have it, and a person reads every one."],
  ["assessment", "Exams and strengths test", "A written task in your track, the qualification exams, and the strengths test."],
  ["interview",  "Two interviews",        "One on how you work, one on your setup and connection."],
  ["approved",   "Approved &mdash; paid training", "You are through. Paid training starts within a week."]
];
var LABEL = { applied: "Applied", assessment: "Assessment", interview: "Interview",
              approved: "Approved", declined: "Declined" };

function stageIndex(s) {
  for (var i = 0; i < STAGES.length; i++) if (STAGES[i][0] === s) return i;
  return -1;
}
function when(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
`.trim();

function shell(o) {
  return [
    "<title>" + o.title + "</title>",
    FONTS,
    "",
    "<style>",
    TOKENS_TO_NAV,
    SECTIONS,
    FOOTER_CSS,
    PAGE_CSS,
    "</style>",
    "",
    THEME_SCRIPT,
    "",
    SVG_DEFS,
    "",
    '<header class="nav">',
    '  <div class="wrap">',
    '    <div class="nav__in">',
    '      <a class="brand" href="/" aria-label="SecureJobVA home">',
    BRAND_SVG,
    '        <span class="brand__word">SecureJob<b class="brand__va">VA</b></span>',
    "      </a>",
    '      <nav class="nav__links">',
    o.links,
    "      </nav>",
    '      <div class="nav__tools">',
    '        <button class="themetog" id="themetog" type="button" aria-label="Switch theme">',
    '          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 3v18" ></path><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"></path></svg>',
    "        </button>",
    "      </div>",
    "    </div>",
    "  </div>",
    "</header>",
    "",
    "<main>",
    o.body,
    "</main>",
    "",
    '<footer class="foot">',
    '  <div class="wrap">',
    '    <div class="foot__bot" style="margin-top:0;border-top:0;padding-top:0">',
    '      <span>&copy; SecureJobVA</span>',
    '      <span><a href="/">Home</a> &middot; <a href="/careers">Careers</a></span>',
    "    </div>",
    "  </div>",
    "</footer>",
    "",
    "<script>",
    "/* Theme toggle, same behaviour as the rest of the site. */",
    "(function () {",
    '  var b = document.getElementById("themetog");',
    "  if (!b) return;",
    '  b.addEventListener("click", function () {',
    "    var root = document.documentElement;",
    '    var next = (root.getAttribute("data-theme") || "light") === "dark" ? "light" : "dark";',
    '    root.setAttribute("data-theme", next);',
    '    try { localStorage.setItem("sjva-theme", next); } catch (e) {}',
    "  });",
    "})();",
    "</script>",
    "",
    "<script>",
    "(function () {",
    '  "use strict";',
    LIB,
    "",
    o.script,
    "})();",
    "</script>",
    ""
  ].join(nl);
}

/* ────────────────────────── status.html ────────────────────────── */

const STATUS_BODY = [
  '  <section class="pt">',
  '    <div class="wrap" style="max-width:52rem">',
  '      <div class="pt__head">',
  '        <span class="eyebrow">Your application</span>',
  "        <h1>Where you are in the process.</h1>",
  '        <p id="pt-lead">Sign in with the Google account whose address you applied with, and this page shows exactly which stage you have reached.</p>',
  "      </div>",
  '      <div id="pt-root"></div>',
  "    </div>",
  "  </section>"
].join(nl);

const STATUS_SCRIPT = `
var root = document.getElementById("pt-root");
var lead = document.getElementById("pt-lead");

function view(html) { root.innerHTML = html; }

function signedOut(msg) {
  view(
    '<div class="card">' +
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      '<button class="gbtn" id="go" type="button">' +
        '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
          '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.400 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"></path>' +
          '<path fill="#4285F4" d="M46.98 24.55c0-1.6-.15-3.15-.42-4.65H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.6 5.9c4.44-4.1 7.22-10.15 7.22-17.45z"></path>' +
          '<path fill="#FBBC05" d="M10.42 28.68A14.4 14.4 0 0 1 9.66 24c0-1.63.28-3.2.76-4.68l-7.8-6.1A24 24 0 0 0 0 24c0 3.87.92 7.52 2.62 10.78l7.8-6.1z"></path>' +
          '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.6-5.9c-2.12 1.42-4.84 2.26-8.3 2.26-6.3 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.44 42.6 14.55 48 24 48z"></path>' +
        "</svg>" +
        "Continue with Google" +
      "</button>" +
      '<p class="msg">We only read your email address, to find the application you already sent. We cannot see your Google account for anything else.</p>' +
    "</div>"
  );
  document.getElementById("go").addEventListener("click", signIn);
}

function stages(app) {
  var at = stageIndex(app.status);
  var out = "";
  for (var i = 0; i < STAGES.length; i++) {
    var s = STAGES[i];
    var done = at > i || app.status === "approved" && i <= at;
    var now  = at === i;
    var cls  = done && !now ? "is-done" : now ? "is-now is-done" : "";
    out +=
      '<li class="' + cls + '">' +
        '<span class="stg__dot">' + (done && !now ? "&#10003;" : String(i + 1)) + "</span>" +
        "<span>" +
          '<span class="stg__t">' + s[1] + "</span>" +
          '<span class="stg__d">' + s[2] + "</span>" +
          (now ? '<span class="stg__badge">You are here</span>' : "") +
        "</span>" +
      "</li>";
  }
  return '<ol class="stg">' + out + "</ol>";
}

function render(user, apps) {
  var initial = (user.email || "?").charAt(0).toUpperCase();
  var who =
    '<div class="who">' +
      '<div class="who__id">' +
        '<span class="who__av">' + esc(initial) + "</span>" +
        '<span class="who__t">' +
          '<span class="who__n">' + esc(user.name || "Signed in") + "</span>" +
          '<span class="who__e">' + esc(user.email) + "</span>" +
        "</span>" +
      "</div>" +
      '<button class="btn btn--ghost" id="out" type="button" style="padding:.5rem .9rem;font-size:.88rem">Sign out</button>' +
    "</div>";

  if (!apps.length) {
    lead.textContent = "Signed in as " + user.email + ".";
    view(who +
      '<div class="card">' +
        '<div class="note note--warn"><b>No application found for this address.</b> ' +
        "If you applied with a different email, sign out and use that one. " +
        "If you have not applied yet, the form is on the careers page.</div>" +
        '<p style="margin-top:1.2rem"><a class="btn btn--solid" href="/careers">Go to the careers page</a></p>' +
      "</div>");
    document.getElementById("out").addEventListener("click", signOut);
    return;
  }

  lead.textContent = "Signed in as " + user.email + ".";
  var html = who;

  for (var i = 0; i < apps.length; i++) {
    var a = apps[i];
    var declined = a.status === "declined";
    html +=
      '<div class="card">' +
        '<div class="row__top">' +
          "<span>" +
            '<span class="row__n">' + esc((a.tracks && a.tracks.length ? a.tracks.join(" + ") : a.track) || "Application") + "</span>" +
            '<span class="row__meta"> &middot; sent ' + esc(when(a.created_at)) + "</span>" +
          "</span>" +
          '<span class="pill pill--' + esc(a.status) + '">' + esc(LABEL[a.status] || a.status) + "</span>" +
        "</div>" +
        (declined
          ? '<div class="note note--warn" style="margin-top:1.2rem"><b>This application was not taken forward.</b> ' +
            "You are welcome to apply again — tell us what has changed since.</div>"
          : stages(a)) +
        '<ul class="meta">' +
          "<li><b>Shifts you offered</b><span>" + esc((a.shifts || []).join(", ") || "&mdash;") + "</span></li>" +
          "<li><b>Experience</b><span>" + esc(a.experience || "&mdash;") + "</span></li>" +
          "<li><b>Based in</b><span>" + esc(a.country || "&mdash;") + "</span></li>" +
          "<li><b>Last updated</b><span>" + esc(when(a.status_changed_at) || when(a.created_at)) + "</span></li>" +
        "</ul>" +
      "</div>";
  }

  html += '<p class="msg">Something look wrong? Reply to the email we sent you and a person will pick it up.</p>';
  view(html);
  document.getElementById("out").addEventListener("click", signOut);
}

function start() {
  captureRedirect();
  var err = authError();
  if (!session()) { signedOut(err); return; }

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) { clearSession(); signedOut("That sign-in did not carry an email address."); return; }
  var user = { email: claims.email, name: (claims.user_metadata || {}).full_name || "" };

  view('<div class="card"><span class="spin"></span>Looking up your application&hellip;</div>');

  api("applications?select=id,created_at,tracks,track,experience,shifts,country,status,status_changed_at&order=created_at.desc")
    .then(function (rows) { render(user, rows || []); })
    .catch(function (e) {
      if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
      view('<div class="card"><p class="msg msg--bad">We could not load your application just now. ' +
           "Refresh, or try again in a minute.</p></div>");
    });
}

start();
`.trim();

writeFileSync("status.html", shell({
  title: "Your application — SecureJobVA",
  links: [
    '        <a href="/careers">Careers</a>',
    '        <a href="/">Hiring a VA?</a>'
  ].join(nl),
  body: STATUS_BODY,
  script: STATUS_SCRIPT
}));

console.log("status.html written");

/* ────────────────────────── admin.html ────────────────────────── */

const ADMIN_BODY = [
  '  <section class="pt">',
  '    <div class="wrap" style="max-width:60rem">',
  '      <div class="pt__head">',
  '        <span class="eyebrow">Internal</span>',
  "        <h1>Applications.</h1>",
  '        <p id="pt-lead">Everyone who has applied, and the stage each one is at.</p>',
  "      </div>",
  '      <div id="pt-root"></div>',
  "    </div>",
  "  </section>"
].join(nl);

const ADMIN_SCRIPT = `
var root = document.getElementById("pt-root");
var lead = document.getElementById("pt-lead");
var ALL  = [];

function view(html) { root.innerHTML = html; }

function signedOut(msg) {
  view(
    '<div class="card">' +
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      '<button class="gbtn" id="go" type="button">Sign in with Google</button>' +
    "</div>"
  );
  document.getElementById("go").addEventListener("click", signIn);
}

/* Being refused here is the normal case for anyone who is not staff, so it
   reads as a closed door rather than a failure. The refusal is Postgres's:
   the query returned nothing because no policy let it through. */
function notAdmin(email) {
  view(
    '<div class="card">' +
      '<div class="note note--warn"><b>' + esc(email) + " is not an administrator.</b> " +
      "If you are looking for your own application, that is on the status page.</div>" +
      '<p style="margin-top:1.2rem">' +
        '<a class="btn btn--solid" href="/status">Go to your application</a> ' +
        '<button class="btn btn--ghost" id="out" type="button">Sign out</button>' +
      "</p>" +
    "</div>"
  );
  document.getElementById("out").addEventListener("click", signOut);
}

function options(cur) {
  var keys = ["applied", "assessment", "interview", "approved", "declined"];
  var out = "";
  for (var i = 0; i < keys.length; i++) {
    out += '<option value="' + keys[i] + '"' + (keys[i] === cur ? " selected" : "") + ">" +
           LABEL[keys[i]] + "</option>";
  }
  return out;
}

function rowHtml(a) {
  var tracks = (a.tracks && a.tracks.length ? a.tracks.join(" + ") : a.track) || "&mdash;";
  return (
    '<div class="row" data-id="' + esc(a.id) + '">' +
      '<div class="row__top">' +
        "<span>" +
          '<span class="row__n">' + esc(a.name || "(no name)") + "</span> " +
          '<span class="row__meta">' + esc(a.email || "") + (a.country ? " &middot; " + esc(a.country) : "") + "</span>" +
        "</span>" +
        '<span class="pill pill--' + esc(a.status) + '" data-pill>' + esc(LABEL[a.status] || a.status) + "</span>" +
      "</div>" +
      '<div class="row__tags">' + esc(tracks) + " &middot; " + esc(a.experience || "?") +
        " &middot; " + esc((a.shifts || []).join(", ") || "no shifts") +
        " &middot; applied " + esc(when(a.created_at)) + "</div>" +
      '<div class="row__ctl">' +
        '<select data-status aria-label="Stage">' + options(a.status) + "</select>" +
        '<textarea data-note rows="1" placeholder="Private note (staff only)">' + esc(a.note_text || "") + "</textarea>" +
        '<button class="btn btn--ghost" data-save type="button" style="padding:.45rem .8rem;font-size:.85rem">Save</button>' +
        '<span class="row__ok" data-ok>Saved</span>' +
      "</div>" +
    "</div>"
  );
}

function paint() {
  var q  = (document.getElementById("q").value || "").toLowerCase().trim();
  var st = document.getElementById("filter").value;
  var shown = ALL.filter(function (a) {
    if (st && a.status !== st) return false;
    if (!q) return true;
    return [a.name, a.email, a.country, (a.tracks || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) > -1;
  });
  document.getElementById("count").textContent =
    shown.length + " of " + ALL.length;
  document.getElementById("rows").innerHTML =
    shown.length ? shown.map(rowHtml).join("") : '<p class="msg">Nothing matches that.</p>';
}

function save(row) {
  var id  = row.getAttribute("data-id");
  var st  = row.querySelector("[data-status]").value;
  var note = row.querySelector("[data-note]").value;
  var ok  = row.querySelector("[data-ok]");
  var rec = ALL.filter(function (x) { return x.id === id; })[0];

  var jobs = [];
  if (!rec || rec.status !== st) {
    jobs.push(api("applications?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { status: st, status_changed_at: new Date().toISOString() }
    }));
  }
  if (!rec || (rec.note_text || "") !== note) {
    /* upsert: one row per application, keyed by its id */
    jobs.push(api("application_notes", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { application_id: id, note: note, updated_at: new Date().toISOString() }
    }));
  }
  if (!jobs.length) { flash(ok, "No change"); return; }

  Promise.all(jobs).then(function () {
    if (rec) { rec.status = st; rec.note_text = note; }
    var pill = row.querySelector("[data-pill]");
    pill.className = "pill pill--" + st;
    pill.textContent = LABEL[st] || st;
    flash(ok, "Saved");
  }).catch(function (e) {
    flash(ok, String(e.message) === "signed out" ? "Signed out" : "Failed");
  });
}

function flash(el, text) {
  el.textContent = text;
  el.classList.add("is-on");
  setTimeout(function () { el.classList.remove("is-on"); }, 1600);
}

function render(email, apps, notes) {
  var byId = {};
  (notes || []).forEach(function (n) { byId[n.application_id] = n.note; });
  ALL = apps.map(function (a) { a.note_text = byId[a.id] || ""; return a; });

  lead.textContent = "Signed in as " + email + ".";
  view(
    '<div class="who">' +
      '<div class="who__id"><span class="who__av">' + esc(email.charAt(0).toUpperCase()) + "</span>" +
      '<span class="who__t"><span class="who__n">Administrator</span>' +
      '<span class="who__e">' + esc(email) + "</span></span></div>" +
      '<button class="btn btn--ghost" id="out" type="button" style="padding:.5rem .9rem;font-size:.88rem">Sign out</button>' +
    "</div>" +
    '<div class="adm__bar">' +
      '<input id="q" type="search" placeholder="Search name, email, country, track">' +
      '<select id="filter" aria-label="Filter by stage">' +
        '<option value="">All stages</option>' + options("") +
      "</select>" +
      '<span class="adm__count" id="count"></span>' +
    "</div>" +
    '<div class="rows" id="rows"></div>'
  );

  document.getElementById("out").addEventListener("click", signOut);
  document.getElementById("q").addEventListener("input", paint);
  document.getElementById("filter").addEventListener("change", paint);
  document.getElementById("rows").addEventListener("click", function (e) {
    var b = e.target.closest("[data-save]");
    if (b) save(b.closest(".row"));
  });
  paint();
}

function start() {
  captureRedirect();
  var err = authError();
  if (!session()) { signedOut(err); return; }

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) { clearSession(); signedOut("That sign-in did not carry an email address."); return; }

  view('<div class="card"><span class="spin"></span>Loading applications&hellip;</div>');

  /* is_admin() is asked of the database rather than decided here. A non-admin
     gets false, and would in any case see nothing, because the same function
     gates every row. */
  api("rpc/is_admin", { method: "POST", body: {} })
    .then(function (isAdmin) {
      if (!isAdmin) { notAdmin(claims.email); return null; }
      return Promise.all([
        api("applications?select=id,created_at,tracks,track,experience,shifts,speed,kit,name,country,email,phone,cv,note,status,status_changed_at&order=created_at.desc"),
        api("application_notes?select=application_id,note")
      ]).then(function (r) { render(claims.email, r[0] || [], r[1] || []); });
    })
    .catch(function (e) {
      if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
      view('<div class="card"><p class="msg msg--bad">Could not load. ' + esc(e.message) + "</p></div>");
    });
}

start();
`.trim();

writeFileSync("admin.html", shell({
  title: "Applications — SecureJobVA",
  links: [
    '        <a href="/status">Your application</a>',
    '        <a href="/careers">Careers</a>'
  ].join(nl),
  body: ADMIN_BODY,
  script: ADMIN_SCRIPT
}));

console.log("admin.html written");
