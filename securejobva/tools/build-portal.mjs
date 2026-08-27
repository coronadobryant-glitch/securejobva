/* Composes status.html and admin.html from the chrome the other two pages
   already use, so the portal cannot drift away from the site around it. */
import { readFileSync, writeFileSync } from "node:fs";

import { chrome } from "./lib-chrome.mjs";

const { fonts: FONTS, css: TOKENS_TO_NAV, themeScript: THEME_SCRIPT,
        svgDefs: SVG_DEFS, brandSvg: BRAND_SVG, nl } = chrome();

/* The old build lifted these by line number out of careers.html, which broke
   silently the moment that file grew a step. Anchors move with the file. */
const SECTIONS = "";
const FOOTER_CSS = "";

/* The portal writes .opt markup — the account-type chooser on /status, and the
   forms elsewhere — but the chooser shipped with none of the CSS for it, so
   both options collapsed into one wrapped line of text: the title, then the
   description, then the next title, with no break between them. It read as a
   sentence rather than a choice.

   Lifted from careers.html by anchor rather than retyped, so the two stay the
   same control. Anchored on the first and last rule of the block; if either
   moves, the build stops instead of shipping an unstyled chooser again. */
const OPT_CSS = (function () {
  const src = readFileSync("careers.html", "utf8").split(/\r?\n/);
  const from = src.findIndex((l) => /^\.opts\{/.test(l));
  const to = src.findIndex((l, i) => i > from && /^\.opt:has\(input:checked\) \.opt__box svg/.test(l));
  if (from < 0 || to < 0) {
    throw new Error("build-portal: could not find the .opt block in careers.html — " +
      "the chooser on /status needs it, and shipped once without it");
  }
  return src.slice(from, to + 1).join(nl);
})();

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

.or{display:flex;align-items:center;gap:.8rem;margin:1.25rem 0;color:var(--muted);font-size:.8rem}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.fld{display:grid;gap:.35rem;margin-bottom:.85rem}
.fld label{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2)}
.fld input{font-family:inherit;font-size:.98rem;padding:.65rem .8rem;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink)}
.fld input:focus-visible{outline:2.5px solid var(--accent);outline-offset:1px}
.lnk{background:none;border:0;padding:0;color:var(--accent);cursor:pointer;font:inherit;font-size:.87rem;text-decoration:underline}
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
.scores{margin-top:.6rem;border-top:1px dashed var(--line);padding-top:.55rem}
.scores summary{cursor:pointer;font-size:.8rem;color:var(--muted);list-style:none}
.scores summary::-webkit-details-marker{display:none}
.scores summary::before{content:"+ ";font-family:"IBM Plex Mono",monospace}
.scores[open] summary::before{content:"− "}
.scr__avg{color:var(--accent-deep)}
.scr__none{opacity:.8}
.scr__by{font-size:.72rem}
.scr__hint{margin:.5rem 0 .7rem;font-size:.78rem;color:var(--muted)}
.scrgrid{display:grid;gap:.4rem}
@media(min-width:700px){.scrgrid{grid-template-columns:repeat(2,1fr);gap:.4rem .9rem}}
.scr{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:.5rem;font-size:.82rem}
.scr__k{color:var(--ink-2)}
.scr__claim{font-size:.72rem;color:var(--muted);text-align:right}
.scr select{font-family:inherit;font-size:.82rem;padding:.25rem .4rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink)}
.cl__add{display:grid;gap:0;padding:1.1rem 1.2rem;background:var(--surface-2);border-radius:10px;margin:1rem 0 1.4rem}
@media(min-width:720px){.cl__add{grid-template-columns:1fr 1fr;gap:0 1rem}
  .cl__add .fld:nth-child(3),.cl__add #cl-add,.cl__add #cl-msg{grid-column:1/-1}}
.cl__add input[type=file]{
  font-family:inherit;font-size:.9rem;padding:.55rem;
  border:1px dashed var(--line);border-radius:8px;background:var(--surface);color:var(--ink-2);width:100%;
}
.cl__list{display:grid;gap:.55rem}
.cl{
  display:grid;grid-template-columns:5.5rem 1fr 4.5rem auto auto;
  gap:.7rem;align-items:center;padding:.6rem .8rem;
  background:var(--surface);border:1px solid var(--line);border-radius:9px;
}
.cl.is-off{opacity:.5}
.cl__img{display:grid;place-items:center;height:34px}
.cl__img img{max-height:34px;max-width:5.5rem;width:auto;display:block}
.cl__meta{min-width:0}
.cl__n{display:block;font-weight:600;font-size:.92rem}
.cl__l{display:block;font-size:.76rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl__ord{
  font-family:"IBM Plex Mono",monospace;font-size:.82rem;text-align:center;
  padding:.3rem;border:1px solid var(--line);border-radius:6px;
  background:var(--surface);color:var(--ink);width:100%;
}
@media(max-width:620px){.cl{grid-template-columns:4rem 1fr;gap:.5rem}
  .cl__ord,.cl [data-cl-toggle],.cl [data-cl-del]{grid-column:2}}
.tabs{display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:1.2rem;border-bottom:1px solid var(--line)}
.tab{
  font-family:inherit;font-size:.92rem;font-weight:600;cursor:pointer;
  background:none;border:0;border-bottom:2px solid transparent;
  padding:.6rem .85rem;color:var(--muted);margin-bottom:-1px;
}
.tab:hover{color:var(--ink-2)}
.tab.is-on{color:var(--accent);border-bottom-color:var(--accent)}
.tab__n{
  display:inline-block;margin-left:.4rem;min-width:1.15rem;padding:0 .3rem;
  background:var(--accent);color:var(--accent-ink);border-radius:99px;
  font-family:"IBM Plex Mono",monospace;font-size:.68rem;line-height:1.15rem;text-align:center;
}
.tab__n:empty{display:none}
.seat__note{margin:.5rem 0 0;font-size:.86rem;color:var(--ink-2);line-height:1.55;white-space:pre-wrap}
.msg__body{margin:.6rem 0 0;font-size:.9rem;color:var(--ink-2);line-height:1.6;white-space:pre-wrap}
/* An answered message stays readable but stops competing for attention. */
.row.is-done{opacity:.62}
.skills{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem}
.sk{font-size:.72rem;padding:.16rem .42rem;border-radius:4px;background:var(--surface-2);color:var(--ink-2)}
.sk--advanced,.sk--fluent{background:var(--accent-soft);color:var(--accent-deep);font-weight:600}
.track{margin-top:.55rem;display:flex;flex-wrap:wrap;gap:.35rem .7rem;align-items:baseline;font-size:.8rem;color:var(--muted)}
.track.is-late{color:var(--ink-2)}
.track__age{font-family:"IBM Plex Mono",monospace;font-size:.7rem}
.track.is-late .track__age{color:#B3261E;font-weight:600}
.track__ghost{background:var(--surface-2);color:#B3261E;font-weight:600;font-size:.68rem;padding:.14rem .4rem;border-radius:4px;text-transform:uppercase;letter-spacing:.08em}
.pill--pipe{background:var(--ink-2);color:var(--paper)}
.chk{display:inline-flex;align-items:center;gap:.35rem;font-size:.85rem;color:var(--ink-2)}
.opts--stack{display:grid;grid-template-columns:1fr;gap:.55rem}
/* Given a whole row each, the description is worth reading rather than a
   caption squeezed under a chip. */
.opts--stack .opt{align-items:flex-start;padding:.85rem 1rem}
.opts--stack .opt__t{font-size:.98rem}
.opts--stack .opt__d{margin-top:.15rem;line-height:1.5}
.fld select,.fld textarea{font-family:inherit;font-size:.98rem;padding:.65rem .8rem;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink)}
.fld textarea{resize:vertical}
.edit__h{font-size:1.05rem;margin:0 0 .3rem}

/* Stat tiles. The hero numbers are the answer for three of these four; a chart
   of a single figure would be a chart of nothing. */
.tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:.7rem;margin:1rem 0 0}
@media(min-width:720px){.tiles{grid-template-columns:repeat(4,1fr)}}
.tile{background:var(--surface-2);border-radius:9px;padding:.9rem 1rem}
.tile__n{display:block;font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:1.8rem;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tile__l{display:block;font-size:.8rem;color:var(--muted);margin-top:.3rem}
.tile--warn{background:#FDECEA}
.tile--warn .tile__n{color:#B3261E}
.tile--warn .tile__l{color:#B3261E}
:root[data-theme="dark"] .tile--warn{background:#2B1512}
:root[data-theme="dark"] .tile--warn .tile__n,
:root[data-theme="dark"] .tile--warn .tile__l{color:#F2B8B5}

.barsgrid{display:grid;gap:1.4rem;margin-top:1.5rem}
@media(min-width:760px){.barsgrid{grid-template-columns:repeat(3,1fr)}}
.bars__t{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);margin:0 0 .6rem;font-weight:500}
.bar{display:grid;grid-template-columns:5.5rem 1fr 2rem;align-items:center;gap:.5rem;margin-bottom:2px;font-size:.82rem}
.bar__l{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The track is the recessive part; the fill is the mark. */
.bar__track{background:var(--surface-2);border-radius:4px;height:14px;overflow:hidden}
.bar__fill{display:block;height:100%;background:var(--accent);border-radius:0 4px 4px 0;min-width:2px}
.bar__n{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink);font-weight:600}
.acctlist{display:grid;gap:.5rem;margin-top:1rem}
.acct{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:var(--surface-2);border-radius:8px}
.acct__e{font-size:.9rem}
.acct__note{display:block;font-size:.78rem;color:var(--muted);margin-top:.2rem}
.acct__r{display:flex;flex-wrap:wrap;gap:.35rem}
.rolechip{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.06em;padding:.2rem .45rem;border-radius:4px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer}
.rolechip:hover{border-color:#B3261E;color:#B3261E}
.docs{margin-top:.6rem;padding-top:.55rem;border-top:1px dashed var(--line);display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.docs__k{font-family:"IBM Plex Mono",monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:.2rem}
.doclink{
  font-family:inherit;font-size:.82rem;cursor:pointer;
  padding:.3rem .6rem;border-radius:6px;
  border:1px solid var(--line);background:var(--surface);color:var(--accent);
}
.doclink:hover{border-color:var(--accent)}
.doclink[disabled]{opacity:.6;cursor:default}
.doclink__s{color:var(--muted)}
.soc{margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--line);font-size:.85rem;display:flex;flex-wrap:wrap;gap:.4rem .7rem;align-items:baseline}
.soc__k{font-family:"IBM Plex Mono",monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.soc a{color:var(--accent)}
.soc__none{color:var(--muted)}
.soc__ok{color:var(--accent-deep);font-weight:600}
.soc__no{color:var(--muted)}
.pill--received{background:var(--surface-2);color:var(--ink-2)}
.pill--call_booked{background:var(--accent-soft);color:var(--accent-deep)}
.pill--matching{background:var(--accent-soft);color:var(--accent-deep)}
.pill--shortlist{background:var(--accent);color:var(--accent-ink)}
.pill--running{background:var(--signal);color:var(--signal-ink)}
.pill--closed{background:var(--surface-2);color:var(--muted)}
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

/* ── Email and password ───────────────────────────────────────────────────
   Supabase hashes with bcrypt, issues the JWT and sends the reset mail. None
   of that is reimplemented here and none of it should be: a hand-rolled
   version of any one of them would be strictly worse than the one that has
   been attacked in the open for years.

   What is here is three POSTs and the error handling around them. */

function authPost(path, body) {
  return fetch(SB + "/auth/v1/" + path, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) {
        throw new Error(j.error_description || j.msg || j.message || ("Something went wrong (" + r.status + ")"));
      }
      return j;
    });
  });
}

function keepSession(j) {
  if (!j || !j.access_token) throw new Error("That did not return a session.");
  saveSession({
    access_token: j.access_token,
    refresh_token: j.refresh_token || "",
    expires_at: Date.now() + (j.expires_in || 3600) * 1000
  });
  return j;
}

function signInPassword(email, password) {
  return authPost("token?grant_type=password", { email: email, password: password }).then(keepSession);
}

/* Supabase may or may not return a session depending on whether the project
   requires email confirmation, so the caller is told which happened rather
   than being left to guess from a missing token. */
function signUpPassword(email, password) {
  return authPost("signup", {
    email: email,
    password: password,
    options: { emailRedirectTo: location.origin + location.pathname }
  }).then(function (j) {
    if (j && j.access_token) { keepSession(j); return "in"; }
    return "confirm";
  });
}

/* redirect_to is a QUERY parameter on GoTrue's REST endpoint. An options object
   carrying redirectTo is the shape supabase-js takes, and this talks to the API
   directly — so it was being ignored, Supabase fell back to the project's Site
   URL, and the reset link dropped people on the home page instead of here. */
function resetPassword(email) {
  var back = location.origin + location.pathname;
  return authPost("recover?redirect_to=" + encodeURIComponent(back), { email: email });
}

/* Setting the new one. The recovery link puts a real session in the fragment,
   so this is an ordinary authenticated write against the user's own record —
   there is no separate "reset token" to pass. */
function setPassword(pw) {
  var s = loadSession();
  if (!s || !s.access_token) return Promise.reject(new Error("That link has expired. Ask for a new one."));
  return fetch(SB + "/auth/v1/user", {
    method: "PUT",
    headers: {
      apikey: ANON,
      Authorization: "Bearer " + s.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: pw })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "That did not work.");
      return j;
    });
  });
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
/* Set when the fragment says this session arrived from a reset link, so start()
   can ask for the new password instead of carrying on as if nothing happened.

   A recovery link hands back an ordinary session, which is why this needed
   saying out loud: without the check, clicking "reset my password" silently
   signed you in and showed you the normal page. The mail worked, the link
   worked, and nothing anywhere offered to change the password. */
var CAME_FROM_RESET = false;

function captureRedirect() {
  if (!location.hash || location.hash.indexOf("access_token") === -1) return false;
  var p = new URLSearchParams(location.hash.slice(1));
  var tok = p.get("access_token");
  if (!tok) return false;
  if (p.get("type") === "recovery") CAME_FROM_RESET = true;
  saveSession({
    access_token: tok,
    refresh_token: p.get("refresh_token") || "",
    expires_at: Date.now() + (parseInt(p.get("expires_in"), 10) || 3600) * 1000
  });
  history.replaceState(null, "", location.pathname);
  return true;
}

/* The form the reset link should have led to all along. Kept deliberately
   plain: one field, one button, and no way to wander off into the rest of the
   portal until the password is actually set. */
function passwordForm(msg) {
  view(
    '<div class="card">' +
      '<h2 class="edit__h">Choose a new password</h2>' +
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      '<p class="msg" style="margin-top:0">At least eight characters. ' +
      "You will be signed in once it is saved.</p>" +
      '<div class="field" style="margin-top:1rem">' +
        '<input id="pw1" type="password" autocomplete="new-password" ' +
        'placeholder="New password" aria-label="New password">' +
      "</div>" +
      '<button class="btn btn--solid" id="pwgo" type="button" style="margin-top:1rem">Save password</button>' +
      '<p class="msg" style="margin-top:1rem">' +
        '<button class="lnk" id="pwskip" type="button">Cancel and sign out</button></p>' +
    "</div>"
  );

  document.getElementById("pwgo").addEventListener("click", function () {
    var el = document.getElementById("pw1");
    var pw = el.value;
    if (pw.length < 8) { passwordForm("That is too short — eight characters or more."); return; }
    var btn = document.getElementById("pwgo");
    btn.disabled = true;
    btn.textContent = "Saving\\u2026";
    setPassword(pw).then(function () {
      CAME_FROM_RESET = false;
      start();
    })["catch"](function (e) {
      passwordForm(e.message);
    });
  });

  document.getElementById("pwskip").addEventListener("click", signOut);
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

/* Storage lives beside PostgREST on the same project. */
function storageBase() {
  return SB + "/storage/v1";
}

/* Returns a URL good for one minute. Opened immediately, never stored. */
function signDoc(path) {
  var sess = session();
  if (!sess) return Promise.reject(new Error("signed out"));
  return fetch(storageBase() + "/object/sign/" + path, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: "Bearer " + sess.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 60 })
  }).then(function (r) {
    if (!r.ok) throw new Error("could not open that file");
    return r.json();
  }).then(function (j) {
    if (!j || !j.signedURL) throw new Error("no link came back");
    return SB + j.signedURL;
  });
}

function openDoc(btn) {
  var path = btn.getAttribute("data-doc");
  var was = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening\u2026";
  signDoc(path).then(function (url) {
    window.open(url, "_blank", "noopener");
  }).catch(function (e) {
    btn.textContent = e.message === "signed out" ? "Signed out" : "Could not open";
    setTimeout(function () { btn.textContent = was; btn.disabled = false; }, 2200);
    return;
  }).then(function () {
    if (btn.disabled) { btn.textContent = was; btn.disabled = false; }
  });
}

function kb(n) {
  if (!n) return "";
  return n < 1048576
    ? Math.max(1, Math.round(n / 1024)) + " KB"
    : (n / 1048576).toFixed(1) + " MB";
}

function docList(docs) {
  if (!docs || !docs.length) return "";
  return (
    '<div class="docs">' +
      '<span class="docs__k">Documents</span>' +
      docs.map(function (d) {
        return '<button class="doclink" type="button" data-doc="' + esc(d.path) + '">' +
          esc(d.filename || "document") +
          (d.bytes ? ' <span class="doclink__s">' + esc(kb(d.bytes)) + "</span>" : "") +
          "</button>";
      }).join("") +
    "</div>"
  );
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


var SKILL_LEVELS = ["beginner", "intermediate", "advanced", "fluent"];
var SKILL_LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate",
                          advanced: "Advanced", fluent: "Fluent" };

var SKILLS = [
  ["skill_english", "English"],
  ["skill_customer", "Customer service"],
  ["skill_data_entry", "Data entry"],
  ["skill_social", "Social media"],
  ["skill_bookkeeping", "Bookkeeping"]
];
var LEVELS = ["beginner", "intermediate", "advanced", "fluent"];
var LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate",
                    advanced: "Advanced", fluent: "Fluent" };

/* Ordered, so "at least intermediate" is a comparison and not a list. */
function levelAtLeast(have, want) {
  if (!want) return true;
  if (!have) return false;
  return LEVELS.indexOf(have) >= LEVELS.indexOf(want);
}

function days(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function waitLabel(n) {
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "1 day";
  return n + " days";
}

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
    OPT_CSS,
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
    '      <span>&copy; 2026 Secure Job VA &middot; Houston, Texas</span>',
    "      <span>",
    '        <a href="/">Home</a> &middot;',
    '        <a href="/careers">Careers</a> &middot;',
    '        <a href="/privacy">Privacy</a> &middot;',
    '        <a href="/terms">Terms</a> &middot;',
    '        <a href="/refunds">Refunds</a> &middot;',
    '        <a href="/contact">Contact</a>',
    "      </span>",
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

function signedOut(msg, mode) {
  /* One card, three states: sign in, create an account, reset. They share the
     email field and most of the markup, so they are one function rather than
     three that drift apart. */
  mode = mode || "in";
  var isUp    = mode === "up";
  var isReset = mode === "reset";

  view(
    '<div class="card">' +
      (msg ? '<p class="msg msg--bad" id="err">' + esc(msg) + "</p>" : "") +
      '<button class="gbtn" id="go" type="button">' +
        '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
          '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"></path>' +
          '<path fill="#4285F4" d="M46.98 24.55c0-1.6-.15-3.15-.42-4.65H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.6 5.9c4.44-4.1 7.22-10.15 7.22-17.45z"></path>' +
          '<path fill="#FBBC05" d="M10.42 28.68A14.4 14.4 0 0 1 9.66 24c0-1.63.28-3.2.76-4.68l-7.8-6.1A24 24 0 0 0 0 24c0 3.87.92 7.52 2.62 10.78l7.8-6.1z"></path>' +
          '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.6-5.9c-2.12 1.42-4.84 2.26-8.3 2.26-6.3 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.44 42.6 14.55 48 24 48z"></path>' +
        "</svg>" +
        "Continue with Google" +
      "</button>" +
      '<div class="or">or</div>' +
      '<form id="pw" novalidate>' +
        '<div class="fld">' +
          '<label for="em">Email</label>' +
          '<input id="em" type="email" autocomplete="email" required placeholder="you@example.com">' +
        "</div>" +
        (isReset ? "" :
          '<div class="fld">' +
            '<label for="pwd">Password</label>' +
            '<input id="pwd" type="password" autocomplete="' +
              (isUp ? "new-password" : "current-password") +
              '" required minlength="8" placeholder="' +
              (isUp ? "At least 8 characters" : "Your password") + '">' +
          "</div>") +
        '<button class="btn btn--solid" id="sub" type="submit" style="width:100%;justify-content:center">' +
          (isReset ? "Send a reset link" : isUp ? "Create account" : "Sign in") +
        "</button>" +
      "</form>" +
      '<p class="msg" id="alt">' +
        (isReset
          ? '<button class="lnk" data-mode="in" type="button">Back to signing in</button>'
          : isUp
            ? 'Already applied and have an account? <button class="lnk" data-mode="in" type="button">Sign in</button>'
            : 'No account yet? <button class="lnk" data-mode="up" type="button">Create one</button>' +
              ' &middot; <button class="lnk" data-mode="reset" type="button">Forgot password</button>') +
      "</p>" +
      '<p class="msg">Use the same address you applied with &mdash; that is how we find your application.</p>' +
    "</div>"
  );

  document.getElementById("go").addEventListener("click", signIn);

  root.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () { signedOut("", b.getAttribute("data-mode")); });
  });

  function fail(t) {
    var e = document.getElementById("err");
    if (!e) {
      e = document.createElement("p");
      e.className = "msg msg--bad";
      e.id = "err";
      root.querySelector(".card").insertBefore(e, root.querySelector(".card").firstChild);
    }
    e.textContent = t;
  }

  document.getElementById("pw").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var em  = document.getElementById("em").value.trim();
    var el  = document.getElementById("pwd");
    var pwd = el ? el.value : "";
    var sub = document.getElementById("sub");

    if (!em || em.indexOf("@") < 1) { fail("Enter the email address you applied with."); return; }
    if (!isReset && pwd.length < 8) { fail("Passwords are at least 8 characters."); return; }

    sub.disabled = true;
    sub.textContent = isReset ? "Sending…" : isUp ? "Creating…" : "Signing in…";

    var job = isReset ? resetPassword(em)
            : isUp    ? signUpPassword(em, pwd)
                      : signInPassword(em, pwd);

    job.then(function (r) {
      if (isReset) {
        view('<div class="card"><div class="note"><b>Check your email.</b> ' +
             "If an account exists for " + esc(em) + ", a reset link is on its way.</div></div>");
        return;
      }
      if (r === "confirm") {
        view('<div class="card"><div class="note"><b>Confirm your address.</b> ' +
             "We sent a link to " + esc(em) + ". Open it and you are in.</div></div>");
        return;
      }
      start();
    }).catch(function (e) {
      sub.disabled = false;
      sub.textContent = isReset ? "Send a reset link" : isUp ? "Create account" : "Sign in";
      fail(e.message || "That did not work.");
    });
  });
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

var EDIT_FIELDS = [
  ["phone",        "WhatsApp or phone", "tel"],
  ["cv",           "Link to your CV",   "url"],
  ["region",       "State or region",   "text"],
  ["availability", "Hours you can work", "text"]
];

function editForm(a) {
  var skills = SKILLS.map(function (k) {
    var opts = SKILL_LEVELS.map(function (l) {
      if (l === "fluent" && k[0] !== "skill_english") return "";
      return '<option value="' + l + '"' + (a[k[0]] === l ? " selected" : "") + ">" +
             SKILL_LEVEL_LABEL[l] + "</option>";
    }).filter(Boolean).join("");
    return '<div class="fld"><label for="e-' + k[0] + '">' + esc(k[1]) + "</label>" +
           '<select id="e-' + k[0] + '"><option value="">Not answered</option>' + opts + "</select></div>";
  }).join("");

  return (
    '<div class="card">' +
      '<h2 class="edit__h">Keep this up to date</h2>' +
      '<p class="msg" style="margin-top:0">A better phone number or a newer CV helps us reach you. Changes save straight away.</p>' +
      EDIT_FIELDS.map(function (f) {
        return '<div class="fld"><label for="e-' + f[0] + '">' + esc(f[1]) + "</label>" +
               '<input id="e-' + f[0] + '" type="' + f[2] + '" value="' + esc(a[f[0]] || "") + '"></div>';
      }).join("") +
      '<div class="fld"><label for="e-note">Anything we should know?</label>' +
        '<textarea id="e-note" rows="3">' + esc(a.note || "") + "</textarea></div>" +
      skills +
      '<label class="chk" style="margin:.5rem 0 .9rem"><input type="checkbox" id="e-kit"' +
        (a.has_equipment ? " checked" : "") + "> I have my own computer and internet</label>" +
      '<button class="btn btn--solid" id="e-save" type="button">Save changes</button>' +
      '<span class="row__ok" id="e-ok" style="margin-left:.7rem">Saved</span>' +
    "</div>"
  );
}

function wireEdit(a) {
  var btn = document.getElementById("e-save");
  if (!btn) return;
  btn.addEventListener("click", function () {
    var ok = document.getElementById("e-ok");
    var body = {};
    EDIT_FIELDS.forEach(function (f) {
      body[f[0]] = document.getElementById("e-" + f[0]).value.trim() || null;
    });
    body.note = document.getElementById("e-note").value.trim() || null;
    body.has_equipment = document.getElementById("e-kit").checked;
    SKILLS.forEach(function (k) {
      body[k[0]] = document.getElementById("e-" + k[0]).value || null;
    });

    btn.disabled = true;
    api("applications?id=eq." + encodeURIComponent(a.id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: body
    }).then(function () {
      Object.keys(body).forEach(function (k) { a[k] = body[k]; });
      ok.textContent = "Saved";
      ok.classList.add("is-on");
      setTimeout(function () { ok.classList.remove("is-on"); }, 1800);
    }).catch(function (e) {
      ok.textContent = String(e.message) === "signed out" ? "Signed out" : "Did not save";
      ok.classList.add("is-on");
    }).then(function () { btn.disabled = false; });
  });
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

  if (!apps.length && !STAFF && !BUSINESS) {
    /* No role, no application: they are new. Ask before showing them an
       empty page that explains nothing. */
    lead.textContent = "Signed in as " + user.email + ".";
    view(who + typeChooser());
    document.getElementById("out").addEventListener("click", signOut);
    wireChooser();
    return;
  }

  if (!apps.length && BUSINESS) {
    location.replace("/seats");
    return;
  }

  if (!apps.length) {
    lead.textContent = "Signed in as " + user.email + ".";
    view(who + staffBanner() +
      '<div class="card">' +
        (STAFF
          ? '<div class="note"><b>Nothing here under your address.</b> ' +
            "This page shows your own application, and staff usually do not have one.</div>"
          : '<div class="note note--warn"><b>No application found for this address.</b> ' +
            "If you applied with a different email, sign out and use that one. " +
            "If you have not applied yet, the form is on the careers page.</div>" +
            '<p style="margin-top:1.2rem"><a class="btn btn--solid" href="/careers">Go to the careers page</a></p>') +
      "</div>");
    document.getElementById("out").addEventListener("click", signOut);
    return;
  }

  lead.textContent = "Signed in as " + user.email + ".";
  var html = who + staffBanner();

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
        docList(a.docs) +
      "</div>";
  }

  /* Only the first application is editable. Someone with two open
     applications is rare enough that quietly editing the wrong one would be
     worse than making them ask. */
  html += editForm(apps[0]);
  html += '<p class="msg">Name and email are fixed here &mdash; they are on your ID check. ' +
          "Tell us in a reply if either needs changing.</p>";
  view(html);
  document.getElementById("out").addEventListener("click", signOut);
  root.addEventListener("click", function (e) {
    var d = e.target.closest("[data-doc]");
    if (d) openDoc(d);
  });
  wireEdit(apps[0]);
}

function start() {
  captureRedirect();
  if (CAME_FROM_RESET) { passwordForm(""); return; }
  var err = authError();
  if (!session()) { signedOut(err); return; }

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) { clearSession(); signedOut("That sign-in did not carry an email address."); return; }
  view('<div class="card"><span class="spin"></span>Looking up your application&hellip;</div>');

  /* Everyone signs in through the same link, so a staff member lands here
     first. Rather than showing them an empty applicant view, ask what they
     can do and point them at the right page. They may also be an applicant,
     so this offers rather than redirects. */
  Promise.all([
    api("rpc/my_permissions", { method: "POST", body: {} }).catch(function () { return []; }),
    api("rpc/my_account_requests", { method: "POST", body: {} }).catch(function () { return []; })
  ]).then(function (r) {
    var perms = r[0] || [];
    STAFF = perms.indexOf("applications.view_all") > -1;
    BUSINESS = perms.indexOf("seats.view") > -1;
    REQUESTS = r[1] || [];
    loadApplications();
  });
}

var STAFF = false;
var BUSINESS = false;
var REQUESTS = [];

/* Somebody who has just signed up holds nothing, so every page is empty and
   none of them says why. Ask them once.

   What they pick is a request, not a grant: choosing "Business" from a menu
   cannot be the only thing standing between a stranger and other people's
   data. A person approves it. */
function typeChooser() {
  var pending = REQUESTS.filter(function (r) { return r.state === "pending"; })[0];
  if (pending) {
    return (
      '<div class="card">' +
        '<div class="note"><b>Waiting on us.</b> You asked for a ' +
        esc(pending.requested_role) + " account. Somebody reviews these by hand, " +
        "usually within a working day, and you will get an email either way.</div>" +
      "</div>"
    );
  }

  var declined = REQUESTS.filter(function (r) { return r.state === "declined"; })[0];

  var TYPES = [
    ["applicant", "I am looking for work",
     "An employee seat. See your application and how far along it is."],
    ["business", "I am hiring",
     "An employer account. See the seats you have asked us for."],
    ["staff", "I work at SecureJobVA",
     "A staff account. Somebody here approves this one before it does anything."]
  ];

  var tick = '<span class="opt__box"><svg width="11" height="11" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"></path></svg></span>';

  return (
    '<div class="card">' +
      '<h2 class="edit__h">What brings you here?</h2>' +
      '<p class="msg" style="margin-top:0">Pick one and we will set your account up. ' +
      "You can say more in the box if it helps." +
      (declined ? " Your last request was not approved &mdash; you are welcome to ask again." : "") +
      "</p>" +
      /* One per line, full width. Side by side they were read as a row of
         chips and the descriptions were the first thing to get skipped, which
         is how somebody picks the wrong account and needs it changed by hand. */
      '<div class="opts opts--stack" style="margin-top:1rem">' +
        TYPES.map(function (t, i) {
          return '<label class="opt">' +
            '<input type="radio" name="acct" value="' + t[0] + '"' + (i === 0 ? " checked" : "") + ">" +
            tick +
            "<span>" +
              '<span class="opt__t">' + t[1] + "</span>" +
              '<span class="opt__d">' + t[2] + "</span>" +
            "</span>" +
          "</label>";
        }).join("") +
      "</div>" +
      '<div class="fld" style="margin-top:1rem">' +
        '<label for="acct-note">Anything to add <em>&mdash; optional</em></label>' +
        '<input id="acct-note" type="text" placeholder="Company name, or which role you applied for">' +
      "</div>" +
      '<button class="btn btn--solid" id="acct-go" type="button">Set up my account</button>' +
      '<p class="msg">Nothing is granted by picking. Every account type is approved by a person first.</p>' +
      '<p class="msg" id="acct-msg"></p>' +
    "</div>"
  );
}

function wireChooser() {
  var b = document.getElementById("acct-go");
  if (!b) return;
  b.addEventListener("click", function () {
    var picked = document.querySelector("[name=acct]:checked");
    var msg = document.getElementById("acct-msg");
    if (!picked) { msg.textContent = "Pick one."; return; }
    b.disabled = true;
    api("rpc/request_account_type", {
      method: "POST",
      body: { role_key: picked.value, note: document.getElementById("acct-note").value.trim() || null }
    }).then(function () { start(); })
      .catch(function (e) {
        b.disabled = false;
        msg.className = "msg msg--bad";
        msg.textContent = e.message || "That did not go through.";
      });
  });
}

var STAFF = false;

function staffBanner() {
  var out = "";
  if (STAFF) {
    out +=
      '<div class="note" style="margin-bottom:1.2rem">' +
        "<b>You have staff access.</b> Applications, stages and interview scores are on the " +
        '<a href="/admin">admin page</a>.' +
      "</div>";
  }
  if (BUSINESS) {
    out +=
      '<div class="note" style="margin-bottom:1.2rem">' +
        "<b>You are set up as a business.</b> The seats you have asked us for are on " +
        'your <a href="/seats">seats page</a>.' +
      "</div>";
  }
  return out;
}

function loadApplications() {
  var claims = readToken(session().access_token);
  var user = { email: claims.email, name: (claims.user_metadata || {}).full_name || "" };

  Promise.all([
    api("applications?select=id,created_at,tracks,track,experience,shifts,country,region,availability,has_equipment,phone,cv,note,status,status_changed_at,skill_english,skill_customer,skill_data_entry,skill_social,skill_bookkeeping&order=created_at.desc"),
    api("application_documents?select=application_id,path,filename,bytes&order=uploaded_at.desc")
      .catch(function () { return []; })
  ])
    .then(function (r) {
      var rows = r[0] || [];
      var byId = {};
      (r[1] || []).forEach(function (d) {
        (byId[d.application_id] = byId[d.application_id] || []).push(d);
      });
      rows.forEach(function (a) { a.docs = byId[a.id] || []; });
      render(user, rows);
    })
    .catch(function (e) {
      if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
      /* Keep a way out. Without this the page is a dead end: signed in, unable
         to load, and unable to sign out or try another address. */
      view('<div class="card"><p class="msg msg--bad">We could not load your application just now. ' +
           "Refresh, or try again in a minute.</p>" +
           '<button class="btn btn--ghost" id="out-error" type="button" style="margin-top:1.1rem">Sign out</button></div>');
      document.getElementById("out-error").addEventListener("click", signOut);
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

const SEATS_SCRIPT = "var root = document.getElementById(\"pt-root\");\nvar lead = document.getElementById(\"pt-lead\");\n\nfunction view(html) { root.innerHTML = html; }\n\n/* The five stages the home page already promises. Kept in one place so the\n   wording a client reads here matches the wording that sold them the seat. */\nvar SEAT_STAGES = [\n  [\"received\",    \"Request received\",  \"We have it. A person reads every one.\"],\n  [\"call_booked\", \"Call booked\",       \"Twenty minutes to agree the hours, the tasks and the rate.\"],\n  [\"matching\",    \"Matching\",          \"We are shortlisting from assistants already trained in your track.\"],\n  [\"shortlist\",   \"Shortlist sent\",    \"Names with you. You choose; we handle the handover.\"],\n  [\"running\",     \"Seat running\",      \"Your assistant is working the hours you set.\"]\n];\nvar SEAT_LABEL = {\n  received: \"Received\", call_booked: \"Call booked\", matching: \"Matching\",\n  shortlist: \"Shortlist\", running: \"Running\", closed: \"Closed\"\n};\n\nfunction seatStageIndex(s) {\n  for (var i = 0; i < SEAT_STAGES.length; i++) if (SEAT_STAGES[i][0] === s) return i;\n  return -1;\n}\n\nfunction signedOut(msg) {\n  view(\n    '<div class=\"card\">' +\n      (msg ? '<p class=\"msg msg--bad\">' + esc(msg) + \"</p>\" : \"\") +\n      '<button class=\"gbtn\" id=\"go\" type=\"button\">Continue with Google</button>' +\n      '<p class=\"msg\">Use the address you booked the call with &mdash; that is how we find your seats. ' +\n      'If you have not asked us for a seat yet, <a href=\"/#book\">book a call</a> first.</p>' +\n    \"</div>\"\n  );\n  document.getElementById(\"go\").addEventListener(\"click\", signIn);\n}\n\nfunction money(n) {\n  if (n === null || n === undefined) return \"\";\n  return \"$\" + Number(n).toLocaleString(\"en-US\");\n}\n\nfunction stages(r) {\n  if (r.status === \"closed\") {\n    return '<div class=\"note note--warn\" style=\"margin-top:1.2rem\"><b>This request is closed.</b> ' +\n           'If you want to pick it up again, <a href=\"/#book\">book a call</a> and we will start from what we already know.</div>';\n  }\n  var at = seatStageIndex(r.status);\n  var out = \"\";\n  for (var i = 0; i < SEAT_STAGES.length; i++) {\n    var st = SEAT_STAGES[i];\n    var done = at > i;\n    var now = at === i;\n    out +=\n      '<li class=\"' + (now ? \"is-now is-done\" : done ? \"is-done\" : \"\") + '\">' +\n        '<span class=\"stg__dot\">' + (done ? \"&#10003;\" : String(i + 1)) + \"</span>\" +\n        \"<span>\" +\n          '<span class=\"stg__t\">' + st[1] + \"</span>\" +\n          '<span class=\"stg__d\">' + st[2] + \"</span>\" +\n          (now ? '<span class=\"stg__badge\">You are here</span>' : \"\") +\n        \"</span>\" +\n      \"</li>\";\n  }\n  return '<ol class=\"stg\">' + out + \"</ol>\";\n}\n\nfunction render(email, rows) {\n  var initial = (email || \"?\").charAt(0).toUpperCase();\n  var who =\n    '<div class=\"who\">' +\n      '<div class=\"who__id\"><span class=\"who__av\">' + esc(initial) + \"</span>\" +\n      '<span class=\"who__t\"><span class=\"who__n\">' +\n      esc((rows[0] && rows[0].company) || \"Your account\") + \"</span>\" +\n      '<span class=\"who__e\">' + esc(email) + \"</span></span></div>\" +\n      '<button class=\"btn btn--ghost\" id=\"out\" type=\"button\" style=\"padding:.5rem .9rem;font-size:.88rem\">Sign out</button>' +\n    \"</div>\";\n\n  lead.textContent = \"Signed in as \" + email + \".\";\n\n  if (!rows.length) {\n    view(who +\n      '<div class=\"card\">' +\n        '<div class=\"note\"><b>Nothing here under this address yet.</b> ' +\n        \"A seat request appears here once you have sent one. If you booked a call with a \" +\n        \"different email, sign out and use that one.</div>\" +\n        '<p style=\"margin-top:1.2rem\"><a class=\"btn btn--solid\" href=\"/#book\">Book a 20-minute call</a></p>' +\n      \"</div>\");\n    document.getElementById(\"out\").addEventListener(\"click\", signOut);\n    return;\n  }\n\n  var html = who;\n  for (var i = 0; i < rows.length; i++) {\n    var r = rows[i];\n    /* weekly is what the dialog quoted at the time. Shown as the quote it was\n       rather than as a live price, because the rate is agreed on the call and\n       this row is a record of what was asked for. */\n    html +=\n      '<div class=\"card\">' +\n        '<div class=\"row__top\">' +\n          \"<span>\" +\n            '<span class=\"row__n\">' +\n              esc((r.seats && r.seats.length ? r.seats.join(\" + \") : \"Seat\")) + \"</span>\" +\n            '<span class=\"row__meta\"> &middot; asked ' + esc(when(r.created_at)) + \"</span>\" +\n          \"</span>\" +\n          '<span class=\"pill pill--' + esc(r.status) + '\">' +\n            esc(SEAT_LABEL[r.status] || r.status) + \"</span>\" +\n        \"</div>\" +\n        stages(r) +\n        '<ul class=\"meta\">' +\n          \"<li><b>Hours a week</b><span>\" + esc(r.hours || \"&mdash;\") + \"</span></li>\" +\n          (r.weekly ? \"<li><b>Quoted</b><span>\" + esc(money(r.weekly)) + \" a week</span></li>\" : \"\") +\n          \"<li><b>Cover</b><span>\" + esc((r.blocks || []).join(\", \") || \"&mdash;\") + \"</span></li>\" +\n          \"<li><b>Your time zone</b><span>\" + esc(r.timezone || \"&mdash;\") + \"</span></li>\" +\n          \"<li><b>Last updated</b><span>\" +\n            esc(when(r.status_changed_at) || when(r.created_at)) + \"</span></li>\" +\n        \"</ul>\" +\n      \"</div>\";\n  }\n\n  html += '<p class=\"msg\">Something not right? Reply to the email we sent you, or write to ' +\n          '<a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>';\n  view(html);\n  document.getElementById(\"out\").addEventListener(\"click\", signOut);\n}\n\nfunction start() {\n  captureRedirect();\n  if (CAME_FROM_RESET) { passwordForm(\"\"); return; }\n  var err = authError();\n  if (!session()) { signedOut(err); return; }\n\n  var claims = readToken(session().access_token);\n  if (!claims || !claims.email) {\n    clearSession();\n    signedOut(\"That sign-in did not carry an email address.\");\n    return;\n  }\n\n  view('<div class=\"card\"><span class=\"spin\"></span>Looking up your seats&hellip;</div>');\n\n  /* The policy returns only rows carrying this address, so there is no filter\n     here to get wrong: asking for everything and being given your own is the\n     database's job, not the page's. */\n  api(\"seat_requests?select=id,created_at,seats,hours,weekly,blocks,timezone,company,status,status_changed_at&order=created_at.desc\")\n    .then(function (rows) { render(claims.email, rows || []); })\n    .catch(function (e) {\n      if (String(e.message) === \"signed out\") { signedOut(\"Your session expired. Sign in again.\"); return; }\n      view('<div class=\"card\"><p class=\"msg msg--bad\">We could not load your seats just now. ' +\n           \"Refresh, or try again in a minute.</p>\" +\n           '<button class=\"btn btn--ghost\" id=\"out-error\" type=\"button\" style=\"margin-top:1.1rem\">Sign out</button></div>');\n      document.getElementById(\"out-error\").addEventListener(\"click\", signOut);\n    });\n}\n\nstart();";

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
/* The internal pipeline. Deliberately not in the shared library: it is how the
   queue is worked, not a promise shown to anyone, and an applicant should never
   read the word "Ghosted" about themselves — not on the page and not in its
   source. */
var PIPE = ["new", "reviewed", "contacted", "interviewed", "hired", "rejected", "ghosted"];
var PIPE_LABEL = {
  new: "New", reviewed: "Reviewed", contacted: "Contacted", interviewed: "Interviewed",
  hired: "Hired", rejected: "Rejected", ghosted: "Ghosted"
};

var ALL  = [];
var PERMS = [];
var ME = "";

/* Convenience only. Postgres decides; this decides what to draw. */
function can(p) { return PERMS.indexOf(p) > -1; }

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
        '<button class="btn btn--ghost" id="out-denied" type="button">Sign out</button>' +
      "</p>" +
    "</div>"
  );
  document.getElementById("out-denied").addEventListener("click", signOut);
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

/* A handle is shown as a link only when it is one. Anything typed into those
   boxes is a stranger's text, so a link is built from an http(s) URL and
   nothing else -- a "handle" of javascript:... stays inert text. */
function socialLink(s) {
  var name = s.platform.charAt(0).toUpperCase() + s.platform.slice(1);
  var href = String(s.url || "");
  var safe = /^https?:\/\//i.test(href);
  var shown = s.handle || href || "";
  if (safe) {
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer nofollow">' +
           esc(name) + "</a>";
  }
  return "<span>" + esc(name) + (shown ? " " + esc(shown) : "") + "</span>";
}

/* Only the skills they actually answered. A blank is not a beginner, and
   drawing it as one would put words in their mouth. */
/* Self-rating and interviewer score side by side, because the gap between
   them is the useful part. An unscored skill shows a dash, never a 0: nobody
   has judged it yet, and 0 is a judgement. */
function scoreLine(a) {
  if (!can("applications.edit")) return "";
  var rows = SKILLS.map(function (k) {
    var col = k[0].replace("skill_", "score_");
    var have = a[col];
    var opts = ['<option value="">&mdash;</option>'];
    for (var n = 1; n <= 10; n++) {
      opts.push('<option value="' + n + '"' + (Number(have) === n ? " selected" : "") + ">" + n + "</option>");
    }
    return (
      '<label class="scr">' +
        '<span class="scr__k">' + esc(k[1]) + "</span>" +
        '<span class="scr__claim">' +
          (a[k[0]] ? esc(LEVEL_LABEL[a[k[0]]] || a[k[0]]) : "not stated") +
        "</span>" +
        '<select data-score="' + esc(col) + '" aria-label="' +
          esc(k[1]) + ' score out of 10">' + opts.join("") + "</select>" +
      "</label>"
    );
  }).join("");

  return (
    '<details class="scores"' + (a.score_avg ? " open" : "") + ">" +
      "<summary>Interview scores" +
        (a.score_avg
          ? ' <b class="scr__avg">' + esc(a.score_avg) + "/10 avg</b>"
          : ' <span class="scr__none">not scored</span>') +
        (a.scored_by ? ' <span class="scr__by">' + esc(a.scored_by) + "</span>" : "") +
      "</summary>" +
      '<p class="scr__hint">Their own rating on the left, your 1&ndash;10 on the right. Leave blank for anything you did not assess.</p>' +
      '<div class="scrgrid">' + rows + "</div>" +
    "</details>"
  );
}

function skillLine(a) {
  var given = SKILLS.filter(function (k) { return a[k[0]]; });
  if (!given.length) return "";
  return '<div class="skills">' + given.map(function (k) {
    return '<span class="sk sk--' + esc(a[k[0]]) + '">' + esc(k[1]) + " " +
           esc(LEVEL_LABEL[a[k[0]]] || a[k[0]]) + "</span>";
  }).join("") + "</div>";
}

/* The line that stops people falling through: how long they have waited, who
   spoke to them last, and whether anything came back. */
function contactLine(a) {
  var waited = days(a.waiting_since);
  var late = a.is_ghosted || (waited !== null && waited >= 7 && !a.response_received);
  return (
    '<div class="track' + (late ? " is-late" : "") + '">' +
      '<span class="pill pill--pipe" data-pipe-pill>' +
        esc(PIPE_LABEL[a.pipeline] || a.pipeline) + "</span>" +
      "<span>" +
        (a.last_contacted_at
          ? "last contacted " + esc(when(a.last_contacted_at)) +
            (a.contacted_by ? " by " + esc(a.contacted_by) : "")
          : "never contacted") +
      "</span>" +
      "<span>" + (a.response_received ? "&#10003; replied" : "no reply") + "</span>" +
      (waited === null ? "" : '<span class="track__age">waiting ' + esc(waitLabel(waited)) + "</span>") +
      (a.is_ghosted ? '<span class="track__ghost">ghosted</span>' : "") +
    "</div>"
  );
}

function pipeOptions(cur) {
  return PIPE.map(function (k) {
    return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" +
           PIPE_LABEL[k] + "</option>";
  }).join("");
}

function rowHtml(a) {
  var tracks = (a.tracks && a.tracks.length ? a.tracks.join(" + ") : a.track) || "&mdash;";

  var social = "";
  if (can("social.view")) {
    var list = a.socials || [];
    social =
      '<div class="soc">' +
        '<span class="soc__k">Social</span>' +
        (list.length
          ? list.map(socialLink).join(" &middot; ")
          : '<span class="soc__none">none given</span>') +
      "</div>";
  }

  /* Controls appear only for what this account may actually do. The policies
     refuse the rest regardless; this just avoids offering a button that would
     fail. */
  var ctl = "";
  if (can("applications.edit") || can("applications.note")) {
    ctl =
      '<div class="row__ctl">' +
        (can("applications.edit")
          ? '<select data-status aria-label="Stage the applicant sees">' + options(a.status) + "</select>" +
            '<select data-pipe aria-label="Internal pipeline">' + pipeOptions(a.pipeline) + "</select>" +
            '<label class="chk"><input type="checkbox" data-replied' +
              (a.response_received ? " checked" : "") + "> replied</label>" +
            '<button class="btn btn--ghost" data-contacted type="button" ' +
              'style="padding:.45rem .8rem;font-size:.85rem">Mark contacted</button>'
          : "") +
        (can("applications.note")
          ? '<textarea data-note rows="1" aria-label="Private note about ' +
            esc(a.name || "this applicant") + '" placeholder="Private note (staff only)">' +
            esc(a.note_text || "") + "</textarea>"
          : "") +
        '<button class="btn btn--ghost" data-save type="button" style="padding:.45rem .8rem;font-size:.85rem">Save</button>' +
        '<span class="row__ok" data-ok>Saved</span>' +
      "</div>";
  }

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
        (a.region ? " &middot; " + esc(a.region) : "") +
        " &middot; applied " + esc(when(a.created_at)) + "</div>" +
      skillLine(a) +
      docList(a.docs) +
      contactLine(a) +
      scoreLine(a) +
      social +
      ctl +
    "</div>"
  );
}

/* ── who may do what ─────────────────────────────────────────────────────
   Every one of these calls goes through a definer function that re-asks
   accounts.manage on the server. The grant tables themselves stay sealed --
   RLS on, no policy -- so this panel cannot read or write them directly, and
   a forged PERMS array gets an exception rather than a table. */
var ROLES = [];

function loadRoles() {
  var box = document.getElementById("roles-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading accounts&hellip;';
  Promise.all([
    api("rpc/list_roles", { method: "POST", body: {} }),
    api("rpc/list_role_grants", { method: "POST", body: {} }),
    api("rpc/list_account_requests", { method: "POST", body: {} }).catch(function () { return []; })
  ]).then(function (r) {
    ROLES = r[0] || [];
    drawRoles(box, r[1] || [], r[2] || []);
  }).catch(function (e) {
    box.innerHTML = '<p class="msg msg--bad">Could not load accounts. ' + esc(e.message) + "</p>";
  });
}

function drawRequests(box, reqs) {
  if (!reqs.length) return "";
  return (
    '<h2 class="edit__h" style="margin-top:1.4rem">Waiting for approval</h2>' +
    '<p class="msg" style="margin-top:0">What somebody says they are is a claim until one of us agrees with it.</p>' +
    '<div class="acctlist">' +
      reqs.map(function (r) {
        return (
          '<div class="acct" data-req="' + esc(r.user_email) + '" data-role="' + esc(r.requested_role) + '">' +
            "<span>" +
              '<span class="acct__e">' + esc(r.user_email) + "</span> " +
              '<span class="pill">' + esc(r.requested_role) + "</span>" +
              (r.note ? '<span class="acct__note">' + esc(r.note) + "</span>" : "") +
            "</span>" +
            '<span class="acct__r">' +
              '<button class="btn btn--ghost" data-decide="yes" style="padding:.35rem .7rem;font-size:.82rem">Approve</button> ' +
              '<button class="btn btn--ghost" data-decide="no" style="padding:.35rem .7rem;font-size:.82rem">Decline</button>' +
            "</span>" +
          "</div>"
        );
      }).join("") +
    "</div>"
  );
}

function drawRoles(box, grants, reqs) {
  var opts = ROLES.map(function (r) {
    return '<option value="' + esc(r.key) + '">' + esc(r.label) + "</option>";
  }).join("");

  var rows = grants.length
    ? grants.map(function (g) {
        return (
          '<div class="acct" data-email="' + esc(g.user_email) + '">' +
            '<span class="acct__e">' + esc(g.user_email) + "</span>" +
            '<span class="acct__r">' +
              (g.roles || []).map(function (k) {
                return '<button class="rolechip" data-revoke="' + esc(k) + '" ' +
                       'title="Remove this role">' + esc(k) + " &times;</button>";
              }).join("") +
            "</span>" +
          "</div>"
        );
      }).join("")
    : '<p class="msg">Nobody has a role yet.</p>';

  box.innerHTML =
    drawRequests(box, reqs || []) +
    '<h2 class="edit__h"' + ((reqs || []).length ? ' style="margin-top:1.6rem"' : "") + ">Who can do what</h2>" +
    '<p class="msg" style="margin-top:0">A role is granted to an email address. It takes effect the next time that person signs in.</p>' +
    '<div class="acctlist">' + rows + "</div>" +
    '<div class="adm__bar" style="margin:1.1rem 0 0">' +
      '<input id="r-email" type="email" aria-label="Email address to grant a role to" ' +
        'placeholder="person@example.com">' +
      '<select id="r-role" aria-label="Role to grant">' + opts + "</select>" +
      '<button class="btn btn--ghost" id="r-add" type="button" style="padding:.5rem .9rem;font-size:.88rem">Grant</button>' +
    "</div>" +
    '<p class="msg" id="r-msg"></p>' +
    '<details style="margin-top:1rem"><summary class="lnk" style="cursor:pointer">What each role can do</summary>' +
      '<ul class="meta" style="margin-top:.8rem">' +
        ROLES.map(function (r) {
          return "<li><b>" + esc(r.label) + "</b><span>" +
                 esc((r.permissions || []).join(", ") || "nothing yet") + "</span></li>";
        }).join("") +
      "</ul></details>";

  var msg = document.getElementById("r-msg");

  document.getElementById("r-add").addEventListener("click", function () {
    var em = document.getElementById("r-email").value.trim().toLowerCase();
    var rk = document.getElementById("r-role").value;
    if (!em || em.indexOf("@") < 1) { msg.textContent = "Enter an email address."; return; }
    setRole(em, rk, true, msg);
  });

  box.querySelectorAll("[data-decide]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-req]");
      api("rpc/decide_account_request", {
        method: "POST",
        body: {
          target_email: row.getAttribute("data-req"),
          role_key: row.getAttribute("data-role"),
          approve: b.getAttribute("data-decide") === "yes"
        }
      }).then(loadRoles).catch(function (e) {
        msg.className = "msg msg--bad";
        msg.textContent = e.message || "That did not go through.";
      });
    });
  });

  box.querySelectorAll("[data-revoke]").forEach(function (b) {
    b.addEventListener("click", function () {
      setRole(b.closest(".acct").getAttribute("data-email"),
              b.getAttribute("data-revoke"), false, msg);
    });
  });
}

function setRole(email, role, grant, msg) {
  msg.className = "msg";
  msg.textContent = grant ? "Granting\u2026" : "Removing\u2026";
  api("rpc/set_role", {
    method: "POST",
    body: { target_email: email, role_key: role, grant_it: grant }
  }).then(function () {
    msg.textContent = "";
    loadRoles();
  }).catch(function (e) {
    /* The refusals from set_role are written to be read by a person -- "that
       is the last administrator" -- so they are shown as they come back. */
    var t = String(e.message || "");
    try { t = JSON.parse(t).message || t; } catch (x) {}
    msg.className = "msg msg--bad";
    msg.textContent = t.replace(/^.*?not allowed.*$/i, "You cannot manage accounts.");
  });
}

/* ── the numbers ─────────────────────────────────────────────────────────
   Computed from the rows already fetched rather than a second round trip:
   the queue is a few hundred rows at most, and a figure derived from exactly
   what is on screen cannot disagree with it.

   Deliberately not a time series. That needs enough history to have a shape,
   and a sparkline over eleven applications is decoration pretending to be
   evidence. Counts and a breakdown are what this actually answers. */

function countBy(rows, key) {
  var out = {};
  rows.forEach(function (r) {
    var v = typeof key === "function" ? key(r) : r[key];
    if (v === null || v === undefined || v === "") return;
    if (Array.isArray(v)) v.forEach(function (x) { out[x] = (out[x] || 0) + 1; });
    else out[v] = (out[v] || 0) + 1;
  });
  return out;
}

/* One hue for every bar. The bars compare magnitude across labelled rows, so
   colour carries no identity here — the label does — and a second hue would
   imply a difference that is not in the data. #0072EE clears 4.5:1 on the
   light surface and its dark step clears 6.2:1, both checked rather than
   eyeballed. */
function bars(title, counts, order, label) {
  var keys = (order || Object.keys(counts).sort()).filter(function (k) {
    return counts[k];
  });
  if (!keys.length) return "";
  var max = Math.max.apply(null, keys.map(function (k) { return counts[k]; }));
  return (
    '<div class="bars">' +
      '<h3 class="bars__t">' + esc(title) + "</h3>" +
      keys.map(function (k) {
        var n = counts[k];
        var pct = Math.round((n / max) * 100);
        var name = label ? (label[k] || k) : k;
        return (
          '<div class="bar" title="' + esc(name) + ": " + n + '">' +
            '<span class="bar__l">' + esc(name) + "</span>" +
            '<span class="bar__track"><span class="bar__fill" style="width:' + pct + '%"></span></span>' +
            '<span class="bar__n">' + n + "</span>" +
          "</div>"
        );
      }).join("") +
    "</div>"
  );
}

function drawStats() {
  var box = document.getElementById("stats-card");
  if (!box) return;

  var total = ALL.length;
  var late = ALL.filter(function (a) {
    var w = days(a.waiting_since);
    return a.is_ghosted || (w !== null && w >= 7 && !a.response_received);
  }).length;
  var hired = ALL.filter(function (a) { return a.pipeline === "hired"; }).length;
  var week = ALL.filter(function (a) {
    var d = days(a.created_at);
    return d !== null && d <= 7;
  }).length;

  /* The one number that is a call to action rather than a fact, so it is the
     only one that changes colour — and it says "all clear" at zero rather than
     going quiet, because a blank is ambiguous. */
  var lateCls = late > 0 ? " tile--warn" : "";

  var tiles =
    '<div class="tiles">' +
      '<div class="tile"><span class="tile__n">' + total + '</span><span class="tile__l">Applications</span></div>' +
      '<div class="tile' + lateCls + '"><span class="tile__n">' + late + "</span>" +
        '<span class="tile__l">' + (late > 0 ? "Waiting 7+ days, no reply" : "None waiting on us") + "</span></div>" +
      '<div class="tile"><span class="tile__n">' + hired + '</span><span class="tile__l">Hired</span></div>' +
      '<div class="tile"><span class="tile__n">' + week + '</span><span class="tile__l">Applied this week</span></div>' +
    "</div>";

  box.className = "card";
  box.style.marginBottom = "1.6rem";
  box.innerHTML =
    '<h2 class="edit__h">At a glance</h2>' +
    tiles +
    '<div class="barsgrid">' +
      bars("Pipeline", countBy(ALL, "pipeline"), PIPE, PIPE_LABEL) +
      bars("Track", countBy(ALL, "tracks")) +
      bars("English", countBy(ALL, "skill_english"), LEVELS, LEVEL_LABEL) +
    "</div>";
}

/* ── client logos ──
   The strip on the home page reads from the same table. Uploading here is the
   whole workflow: no deploy, no HTML edit. */
function loadClients() {
  var box = document.getElementById("clients-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading clients&hellip;';
  api("client_logos?select=id,name,image_url,link,sort_order,visible&order=sort_order.asc,added_at.asc")
    .then(function (rows) { drawClients(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load clients. ' + esc(e.message) + "</p>";
    });
}

function drawClients(box, rows) {
  box.innerHTML =
    '<h2 class="edit__h">Businesses on the home page</h2>' +
    '<p class="msg" style="margin-top:0">These slide across the home page. Hidden ones stay here but are not shown to visitors. Drag order is the number beside each one &mdash; lower goes first.</p>' +

    '<div class="cl__add">' +
      '<div class="fld"><label for="cl-name">Business name</label>' +
        '<input id="cl-name" type="text" placeholder="Acme Plumbing"></div>' +
      '<div class="fld"><label for="cl-link">Their website <em>&mdash; optional</em></label>' +
        '<input id="cl-link" type="url" placeholder="https://"></div>' +
      '<div class="fld"><label for="cl-file">Logo</label>' +
        '<input id="cl-file" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp">' +
        '<p class="fileinfo" id="cl-info">PNG, JPG, SVG or WebP, up to 2 MB. A transparent PNG looks best.</p></div>' +
      '<button class="btn btn--solid" id="cl-add" type="button">Add business</button>' +
      '<p class="msg" id="cl-msg"></p>' +
    "</div>" +

    (rows.length
      ? '<div class="cl__list">' + rows.map(function (c) {
          return (
            '<div class="cl' + (c.visible ? "" : " is-off") + '" data-cl="' + esc(c.id) + '">' +
              '<span class="cl__img"><img src="' + esc(c.image_url) + '" alt="' + esc(c.name) + '"></span>' +
              '<span class="cl__meta">' +
                '<span class="cl__n">' + esc(c.name) + "</span>" +
                (c.link ? '<span class="cl__l">' + esc(c.link) + "</span>" : "") +
              "</span>" +
              '<input class="cl__ord" type="number" data-cl-order value="' + esc(c.sort_order) +
                '" aria-label="Order for ' + esc(c.name) + '">' +
              '<button class="btn btn--ghost" data-cl-toggle type="button" style="padding:.35rem .7rem;font-size:.82rem">' +
                (c.visible ? "Hide" : "Show") + "</button>" +
              '<button class="btn btn--ghost" data-cl-del type="button" style="padding:.35rem .7rem;font-size:.82rem">Remove</button>' +
            "</div>"
          );
        }).join("") + "</div>"
      : '<p class="msg">No businesses added yet. The strip stays hidden on the home page until there is at least one.</p>');

  wireClients(box, rows);
}

function wireClients(box, rows) {
  var msg = document.getElementById("cl-msg");
  var info = document.getElementById("cl-info");
  var MAX = 2 * 1024 * 1024;

  document.getElementById("cl-file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) { info.className = "fileinfo"; info.textContent = "PNG, JPG, SVG or WebP, up to 2 MB."; return; }
    var bad = f.size > MAX ? "That is over 2 MB — a logo should be far smaller." : "";
    info.className = "fileinfo" + (bad ? " is-bad" : "");
    info.textContent = bad || (f.name + " — " + Math.max(1, Math.round(f.size / 1024)) + " KB");
  });

  document.getElementById("cl-add").addEventListener("click", function () {
    var btn = this;
    var name = document.getElementById("cl-name").value.trim();
    var link = document.getElementById("cl-link").value.trim();
    var f = document.getElementById("cl-file").files[0];

    msg.className = "msg";
    if (!name) { msg.className = "msg msg--bad"; msg.textContent = "Give it a name."; return; }
    if (!f) { msg.className = "msg msg--bad"; msg.textContent = "Choose a logo file."; return; }
    if (f.size > MAX) { msg.className = "msg msg--bad"; msg.textContent = "That file is over 2 MB."; return; }

    /* The stored name is ours, not theirs: an uploaded filename is text that
       ends up in a URL, and this one is public. */
    var dot = f.name.lastIndexOf(".");
    var ext = dot > -1 ? f.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "png";
    var path = "logo-" + Date.now() + "." + ext;

    btn.disabled = true;
    msg.textContent = "Uploading\u2026";

    var sess = session();
    fetch(SB + "/storage/v1/object/client-logos/" + path, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: "Bearer " + sess.access_token,
        "Content-Type": f.type,
        "x-upsert": "false"
      },
      body: f
    }).then(function (r) {
      if (!r.ok) throw new Error("the upload was refused");
      return api("client_logos", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          name: name,
          image_url: SB + "/storage/v1/object/public/client-logos/" + path,
          link: link || null,
          sort_order: rows.length ? Math.max.apply(null, rows.map(function (x) { return x.sort_order; })) + 1 : 0,
          added_by: ME
        }
      });
    }).then(function () {
      msg.textContent = "";
      loadClients();
    }).catch(function (e) {
      btn.disabled = false;
      msg.className = "msg msg--bad";
      msg.textContent = e.message || "That did not go through.";
    });
  });

  box.querySelectorAll("[data-cl-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-cl]");
      var on = b.textContent.trim() === "Show";
      api("client_logos?id=eq." + encodeURIComponent(row.getAttribute("data-cl")), {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: { visible: on }
      }).then(loadClients).catch(function () {
        msg.className = "msg msg--bad";
        msg.textContent = "Could not change that.";
      });
    });
  });

  box.querySelectorAll("[data-cl-order]").forEach(function (el) {
    el.addEventListener("change", function () {
      var row = el.closest("[data-cl]");
      api("client_logos?id=eq." + encodeURIComponent(row.getAttribute("data-cl")), {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: { sort_order: Number(el.value) || 0 }
      }).then(loadClients).catch(function () {
        msg.className = "msg msg--bad";
        msg.textContent = "Could not reorder that.";
      });
    });
  });

  box.querySelectorAll("[data-cl-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-cl]");
      /* Two clicks rather than a confirm dialog: a browser confirm blocks
         everything, and this is reversible by re-uploading anyway. */
      if (b.textContent.trim() !== "Sure?") {
        b.textContent = "Sure?";
        setTimeout(function () { if (b.textContent === "Sure?") b.textContent = "Remove"; }, 3000);
        return;
      }
      api("client_logos?id=eq." + encodeURIComponent(row.getAttribute("data-cl")), {
        method: "DELETE", headers: { Prefer: "return=minimal" }
      }).then(loadClients).catch(function () {
        msg.className = "msg msg--bad";
        msg.textContent = "Could not remove that.";
      });
    });
  });
}

function wireTabs() {
  var bar = document.getElementById("tabs");
  if (!bar) return;
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (!b) return;
    var want = b.getAttribute("data-tab");
    bar.querySelectorAll("[data-tab]").forEach(function (x) {
      x.classList.toggle("is-on", x === b);
    });
    root.querySelectorAll("[data-pane]").forEach(function (p) {
      if (p.getAttribute("data-pane") === want) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
  });
}

/* ── seat requests ──
   The client side of the same job. Staff can move one along; they cannot edit
   what was asked for, which is the client's record of the conversation. */
var SEAT_PIPE = ["received", "call_booked", "matching", "shortlist", "running", "closed"];
var SEAT_LABEL = {
  received: "Received", call_booked: "Call booked", matching: "Matching",
  shortlist: "Shortlist", running: "Running", closed: "Closed"
};

function loadSeats() {
  var box = document.getElementById("seats-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading seat requests&hellip;';
  api("seat_requests?select=id,created_at,seats,hours,weekly,blocks,timezone,name,company,email,phone,notes,status,status_changed_at&order=created_at.desc")
    .then(function (rows) { drawSeats(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load seat requests. ' + esc(e.message) + "</p>";
    });
}

function drawSeats(box, rows) {
  if (!rows.length) {
    box.innerHTML = '<h2 class="edit__h">Seat requests</h2><p class="msg">Nobody has asked for a seat yet.</p>';
    return;
  }
  box.innerHTML =
    '<h2 class="edit__h">Seat requests</h2>' +
    '<p class="msg" style="margin-top:0">' + rows.length + " in total. Newest first.</p>" +
    '<div class="rows" style="margin-top:1rem">' +
      rows.map(function (r) {
        var opts = SEAT_PIPE.map(function (k) {
          return '<option value="' + k + '"' + (r.status === k ? " selected" : "") + ">" +
                 SEAT_LABEL[k] + "</option>";
        }).join("");
        return (
          '<div class="row" data-seat="' + esc(r.id) + '">' +
            '<div class="row__top">' +
              "<span>" +
                '<span class="row__n">' + esc(r.company || r.name || "(no company)") + "</span> " +
                '<span class="row__meta">' + esc(r.email || "") + "</span>" +
              "</span>" +
              '<span class="pill pill--' + esc(r.status) + '">' +
                esc(SEAT_LABEL[r.status] || r.status) + "</span>" +
            "</div>" +
            '<div class="row__tags">' +
              esc((r.seats || []).join(" + ") || "no roles") + " &middot; " +
              esc(r.hours || "?") + " hrs" +
              (r.weekly ? " &middot; $" + esc(r.weekly) + "/wk quoted" : "") +
              " &middot; " + esc(r.timezone || "?") +
              " &middot; asked " + esc(when(r.created_at)) +
            "</div>" +
            (r.notes ? '<p class="seat__note">' + esc(r.notes) + "</p>" : "") +
            (can("applications.edit")
              ? '<div class="row__ctl">' +
                  '<select data-seat-status aria-label="Stage of this seat request">' + opts + "</select>" +
                  '<button class="btn btn--ghost" data-seat-save type="button" style="padding:.45rem .8rem;font-size:.85rem">Save</button>' +
                  '<span class="row__ok" data-seat-ok>Saved</span>' +
                "</div>"
              : "") +
          "</div>"
        );
      }).join("") +
    "</div>";

  box.querySelectorAll("[data-seat-save]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-seat]");
      var id = row.getAttribute("data-seat");
      var st = row.querySelector("[data-seat-status]").value;
      var ok = row.querySelector("[data-seat-ok]");
      api("seat_requests?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { status: st, status_changed_at: new Date().toISOString() }
      }).then(function () {
        var pill = row.querySelector(".pill");
        pill.className = "pill pill--" + st;
        pill.textContent = SEAT_LABEL[st] || st;
        flash(ok, "Saved");
      }).catch(function (e) {
        flash(ok, String(e.message) === "signed out" ? "Signed out" : "Failed");
      });
    });
  });
}

/* ── the inbox ──
   010 stored contact messages and gave staff a policy to read them, and there
   was nowhere to do it. A form that writes to a table nobody opens is a form
   that loses messages politely. */
function loadInbox() {
  var box = document.getElementById("inbox-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading messages&hellip;';
  api("contact_messages?select=id,created_at,name,email,phone,reason,message,handled_at,handled_by&order=created_at.desc")
    .then(function (rows) { drawInbox(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load messages. ' + esc(e.message) + "</p>";
    });
}

function drawInbox(box, rows) {
  var open = rows.filter(function (r) { return !r.handled_at; });
  var badge = document.getElementById("tab-unread");
  if (badge) badge.textContent = open.length ? String(open.length) : "";

  if (!rows.length) {
    box.innerHTML = '<h2 class="edit__h">Messages</h2><p class="msg">Nothing yet.</p>';
    return;
  }

  box.innerHTML =
    '<h2 class="edit__h">Messages</h2>' +
    '<p class="msg" style="margin-top:0">' +
      (open.length ? open.length + " unanswered" : "All answered") +
      " &middot; " + rows.length + " in total.</p>" +
    '<div class="rows" style="margin-top:1rem">' +
      rows.map(function (r) {
        return (
          '<div class="row' + (r.handled_at ? " is-done" : "") + '" data-msg="' + esc(r.id) + '">' +
            '<div class="row__top">' +
              "<span>" +
                '<span class="row__n">' + esc(r.name || "(no name)") + "</span> " +
                '<span class="row__meta">' +
                  '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" +
                  (r.phone ? " &middot; " + esc(r.phone) : "") +
                "</span>" +
              "</span>" +
              '<span class="pill">' + esc(r.reason || "General") + "</span>" +
            "</div>" +
            '<div class="row__tags">' + esc(when(r.created_at)) +
              (r.handled_at ? " &middot; answered by " + esc(r.handled_by || "someone") : "") +
            "</div>" +
            '<p class="msg__body">' + esc(r.message || "") + "</p>" +
            '<div class="row__ctl">' +
              '<a class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.85rem" href="mailto:' +
                esc(r.email) + "?subject=" + encodeURIComponent("Re: " + (r.reason || "your message")) +
                '">Reply</a>' +
              (r.handled_at
                ? '<button class="btn btn--ghost" data-msg-open type="button" style="padding:.45rem .8rem;font-size:.85rem">Mark unanswered</button>'
                : '<button class="btn btn--ghost" data-msg-done type="button" style="padding:.45rem .8rem;font-size:.85rem">Mark answered</button>') +
              '<span class="row__ok" data-msg-ok>Saved</span>' +
            "</div>" +
          "</div>"
        );
      }).join("") +
    "</div>";

  box.querySelectorAll("[data-msg-done], [data-msg-open]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-msg]");
      var id = row.getAttribute("data-msg");
      var done = b.hasAttribute("data-msg-done");
      api("contact_messages?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: done
          ? { handled_at: new Date().toISOString(), handled_by: ME }
          : { handled_at: null, handled_by: null }
      }).then(loadInbox)
        .catch(function (e) {
          flash(row.querySelector("[data-msg-ok]"),
                String(e.message) === "signed out" ? "Signed out" : "Failed");
        });
    });
  });
}

/* ── CSV ──────────────────────────────────────────────────────────────────
   Exports what is on screen, not the whole table. Someone who has filtered to
   "advanced English, waiting 7+ days" wants those rows; handing them everything
   and letting them re-filter in a spreadsheet is how the wrong list gets
   emailed to somebody.

   Two things about the escaping below are not decoration.

   A field is wrapped in quotes and its own quotes doubled, which is the actual
   CSV rule -- a name like O"Brien or any note containing a comma or a newline
   destroys the column alignment otherwise, and these are free-text fields
   filled in by strangers.

   A leading =, +, - or @ is prefixed with a single quote. Excel and Sheets
   treat those as the start of a formula, so an applicant who types
   =HYPERLINK(...) into their note has written code that runs when a staff
   member opens the export. It is a real attack with a dull name; the leading
   apostrophe is the standard defence and is invisible in the cell. */
function csvCell(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) v = v.join("; ");
  var t = String(v);
  if (/^[=+\\-@\\t\\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}

var CSV_COLUMNS = [
  ["Name", "name"],
  ["Email", "email"],
  ["Country", "country"],
  ["Region", "region"],
  ["Tracks", "tracks"],
  ["Applied", function (a) { return when(a.created_at); }],
  ["Applicant stage", function (a) { return LABEL[a.status] || a.status; }],
  ["Pipeline", function (a) { return PIPE_LABEL[a.pipeline] || a.pipeline; }],
  ["Last contacted", function (a) { return when(a.last_contacted_at); }],
  ["Contacted by", "contacted_by"],
  ["Replied", function (a) { return a.response_received ? "yes" : "no"; }],
  ["Days waiting", function (a) { var d = days(a.waiting_since); return d === null ? "" : d; }],
  ["Ghosted", function (a) { return a.is_ghosted ? "yes" : "no"; }],
  ["English (self)", "skill_english"],
  ["Customer (self)", "skill_customer"],
  ["Data entry (self)", "skill_data_entry"],
  ["Social (self)", "skill_social"],
  ["Bookkeeping (self)", "skill_bookkeeping"],
  ["English (score)", "score_english"],
  ["Customer (score)", "score_customer"],
  ["Data entry (score)", "score_data_entry"],
  ["Social (score)", "score_social"],
  ["Bookkeeping (score)", "score_bookkeeping"],
  ["Average score", "score_avg"],
  ["Scored by", "scored_by"]
];

function exportCsv() {
  var rows = shownRows();
  if (!rows.length) return;

  var out = [CSV_COLUMNS.map(function (c) { return csvCell(c[0]); }).join(",")];
  rows.forEach(function (a) {
    out.push(CSV_COLUMNS.map(function (c) {
      return csvCell(typeof c[1] === "function" ? c[1](a) : a[c[1]]);
    }).join(","));
  });

  /* A byte order mark, so Excel reads it as UTF-8. Without one, every name
     it -- which is most of them -- arrives mangled. */
  var blob = new Blob(["\\ufeff" + out.join("\\r\\n")], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "applications-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 0);
}

function shownRows() {
  var q  = (document.getElementById("q").value || "").toLowerCase().trim();
  var st = document.getElementById("filter").value;
  var sk = document.getElementById("fskill").value;
  var lv = document.getElementById("flevel").value;

  var shown = ALL.filter(function (a) {
    if (st === "__late") {
      var w = days(a.waiting_since);
      if (!(a.is_ghosted || (w !== null && w >= 7 && !a.response_received))) return false;
    } else if (st === "__unscored") {
      if (a.pipeline !== "interviewed" || a.score_avg) return false;
    } else if (st && a.pipeline !== st) {
      return false;
    }
    /* A level with no skill chosen means "anyone at least this good at
       anything", which is the reading that matches how people ask for it. */
    if (lv) {
      if (sk) {
        if (!levelAtLeast(a[sk], lv)) return false;
      } else {
        var any = SKILLS.some(function (k) { return levelAtLeast(a[k[0]], lv); });
        if (!any) return false;
      }
    } else if (sk && !a[sk]) {
      return false;
    }
    if (!q) return true;
    return [a.name, a.email, a.country, a.region, (a.tracks || []).join(" ")]
      .join(" ").toLowerCase().indexOf(q) > -1;
  });
  return shown;
}

function paint() {
  var shown = shownRows();
  document.getElementById("count").textContent =
    shown.length + " of " + ALL.length;
  document.getElementById("rows").innerHTML =
    shown.length ? shown.map(rowHtml).join("") : '<p class="msg">Nothing matches that.</p>';
}

function save(row) {
  var id  = row.getAttribute("data-id");
  var stEl = row.querySelector("[data-status]");
  var ntEl = row.querySelector("[data-note]");
  var ppEl = row.querySelector("[data-pipe]");
  var rpEl = row.querySelector("[data-replied]");
  var st   = stEl ? stEl.value : null;
  var note = ntEl ? ntEl.value : null;
  var pipe = ppEl ? ppEl.value : null;
  var replied = rpEl ? rpEl.checked : null;
  var ok  = row.querySelector("[data-ok]");
  var rec = ALL.filter(function (x) { return x.id === id; })[0];

  var jobs = [];
  if (st !== null && (!rec || rec.status !== st)) {
    jobs.push(api("applications?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { status: st, status_changed_at: new Date().toISOString() }
    }));
  }
  if (note !== null && (!rec || (rec.note_text || "") !== note)) {
    /* upsert: one row per application, keyed by its id */
    jobs.push(api("application_notes", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { application_id: id, note: note, updated_at: new Date().toISOString() }
    }));
  }
  if (pipe !== null || replied !== null) {
    var t = { application_id: id, updated_at: new Date().toISOString() };
    var changed = false;
    if (pipe !== null && (!rec || rec.pipeline !== pipe)) { t.pipeline = pipe; changed = true; }

    /* scored_by and scored_at are deliberately not sent. The database stamps
       them, and only when a score actually moves, so re-saving a note does
       not rewrite who did the assessing. */
    row.querySelectorAll("[data-score]").forEach(function (el) {
      var col = el.getAttribute("data-score");
      var val = el.value === "" ? null : Number(el.value);
      var was = rec ? (rec[col] === undefined ? null : rec[col]) : undefined;
      if (was === undefined || (was === null ? val !== null : Number(was) !== val)) {
        t[col] = val;
        changed = true;
      }
    });
    if (replied !== null && (!rec || !!rec.response_received !== replied)) {
      t.response_received = replied;
      changed = true;
    }
    /* Marking contacted stamps the time and the person, which is the whole
       point of the field: "someone reached out" is not answerable later. */
    if (row.getAttribute("data-mark-contacted") === "1") {
      t.pipeline = "contacted";
      t.last_contacted_at = new Date().toISOString();
      t.contacted_by = ME;
      changed = true;
    }
    if (changed) {
      jobs.push(api("application_tracking", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: t
      }).then(function () {
        if (!rec) return;
        if (t.pipeline) rec.pipeline = t.pipeline;
        if (t.last_contacted_at) rec.last_contacted_at = t.last_contacted_at;
        if (t.contacted_by) rec.contacted_by = t.contacted_by;
        if (typeof t.response_received === "boolean") rec.response_received = t.response_received;
        SKILLS.forEach(function (k) {
          var col = k[0].replace("skill_", "score_");
          if (col in t) rec[col] = t[col];
        });
      }));
    }
  }

  if (!jobs.length) { flash(ok, "No change"); return; }

  Promise.all(jobs).then(function () {
    if (rec) {
      if (st !== null) rec.status = st;
      if (note !== null) rec.note_text = note;
    }
    if (st !== null) {
      var pill = row.querySelector("[data-pill]");
      pill.className = "pill pill--" + st;
      pill.textContent = LABEL[st] || st;
    }
    row.removeAttribute("data-mark-contacted");
    if (pipe !== null || replied !== null) {
      /* Recompute the average locally rather than refetching: the row is about
         to be redrawn and a stale header under a changed score reads as a bug. */
      var got = SKILLS.map(function (k) { return rec[k[0].replace("skill_", "score_")]; })
                      .filter(function (v) { return v !== null && v !== undefined && v !== ""; })
                      .map(Number);
      rec.score_avg = got.length
        ? String(Math.round((got.reduce(function (x, y) { return x + y; }, 0) / got.length) * 10) / 10)
        : null;
      var fresh = rowHtml(rec);
      var tmp = document.createElement("div");
      tmp.innerHTML = fresh;
      row.replaceWith(tmp.firstChild);
    }
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

function render(email, apps, notes, socials, docs) {
  var byId = {};
  (notes || []).forEach(function (n) { byId[n.application_id] = n.note; });
  var socById = {};
  (socials || []).forEach(function (s) {
    (socById[s.application_id] = socById[s.application_id] || []).push(s);
  });
  var docById = {};
  (docs || []).forEach(function (d) {
    (docById[d.application_id] = docById[d.application_id] || []).push(d);
  });
  ALL = apps.map(function (a) {
    a.note_text = byId[a.id] || "";
    a.socials = socById[a.id] || [];
    a.docs = docById[a.id] || [];
    a.pipeline = a.pipeline || "new";
    return a;
  });

  lead.textContent = "Signed in as " + email + ".";
  view(
    '<div class="who">' +
      '<div class="who__id"><span class="who__av">' + esc(email.charAt(0).toUpperCase()) + "</span>" +
      '<span class="who__t"><span class="who__n">Administrator</span>' +
      '<span class="who__e">' + esc(email) + "</span></span></div>" +
      '<button class="btn btn--ghost" id="out" type="button" style="padding:.5rem .9rem;font-size:.88rem">Sign out</button>' +
    "</div>" +
    '<div class="adm__bar">' +
      '<input id="q" type="search" aria-label="Search applications" ' +
        'placeholder="Search name, email, country, region, track">' +
      '<select id="filter" aria-label="Filter by pipeline">' +
        '<option value="">All pipeline</option>' + pipeOptions("") +
        '<option value="__late">Waiting 7+ days, no reply</option>' +
        '<option value="__unscored">Interviewed, not yet scored</option>' +
      "</select>" +
      '<select id="fskill" aria-label="Filter by skill">' +
        '<option value="">Any skill</option>' +
        SKILLS.map(function (k) {
          return '<option value="' + k[0] + '">' + k[1] + "</option>";
        }).join("") +
      "</select>" +
      '<select id="flevel" aria-label="Minimum level">' +
        '<option value="">Any level</option>' +
        LEVELS.map(function (l) {
          return '<option value="' + l + '">' + LEVEL_LABEL[l] + " or better</option>";
        }).join("") +
      "</select>" +
      '<span class="adm__count" id="count"></span>' +
      '<button class="btn btn--ghost" id="csv" type="button" style="padding:.5rem .8rem;font-size:.85rem">Export CSV</button>' +
    "</div>" +
    '<div class="tabs" id="tabs">' +
      '<button class="tab is-on" data-tab="apps" type="button">Applications</button>' +
      '<button class="tab" data-tab="seats" type="button">Seats</button>' +
      '<button class="tab" data-tab="inbox" type="button">Messages<span class="tab__n" id="tab-unread"></span></button>' +
      '<button class="tab" data-tab="clients" type="button">Clients</button>' +
      (can("accounts.manage") ? '<button class="tab" data-tab="accts" type="button">Accounts</button>' : "") +
    "</div>" +
    '<div data-pane="apps">' +
    (can("analytics.view") ? '<div id="stats-card"></div>' : "") +
    '<div class="rows" id="rows"></div>' +
    "</div>" +
    '<div data-pane="seats" hidden><div class="card" id="seats-card"></div></div>' +
    '<div data-pane="inbox" hidden><div class="card" id="inbox-card"></div></div>' +
    '<div data-pane="clients" hidden><div class="card" id="clients-card"></div></div>' +
    (can("accounts.manage")
      ? '<div data-pane="accts" hidden><div class="card" id="roles-card"></div></div>'
      : "")
  );

  document.getElementById("out").addEventListener("click", signOut);
  wireTabs();
  if (can("analytics.view")) drawStats();
  if (can("accounts.manage")) loadRoles();
  loadSeats();
  loadInbox();
  loadClients();
  document.getElementById("q").addEventListener("input", paint);
  document.getElementById("filter").addEventListener("change", paint);
  document.getElementById("fskill").addEventListener("change", paint);
  document.getElementById("csv").addEventListener("click", exportCsv);
  document.getElementById("flevel").addEventListener("change", paint);
  document.getElementById("rows").addEventListener("click", function (e) {
    var doc = e.target.closest("[data-doc]");
    if (doc) { openDoc(doc); return; }
    var c = e.target.closest("[data-contacted]");
    if (c) {
      /* Flag it and save in one gesture: the button is a shortcut for "set
         contacted, stamp now, stamp me", not a separate write path. */
      var r = c.closest(".row");
      r.setAttribute("data-mark-contacted", "1");
      save(r);
      return;
    }
    var b = e.target.closest("[data-save]");
    if (b) save(b.closest(".row"));
  });
  paint();
}

function start() {
  captureRedirect();
  if (CAME_FROM_RESET) { passwordForm(""); return; }
  var err = authError();
  if (!session()) { signedOut(err); return; }

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) { clearSession(); signedOut("That sign-in did not carry an email address."); return; }

  view('<div class="card"><span class="spin"></span>Loading applications&hellip;</div>');

  /* What this account may do is asked of the database, not decided here. The
     answer only shapes what gets drawn: every one of these permissions is also
     enforced by a policy, so hiding a control is a courtesy and not the
     safeguard. Someone who forges a permission into this array still gets
     nothing back from Postgres. */
  api("rpc/my_permissions", { method: "POST", body: {} })
    .then(function (perms) {
      PERMS = perms || [];
      ME = claims.email;
      if (!can("applications.view_all")) { notAdmin(claims.email); return null; }

      var jobs = [
        /* The queue view carries the pipeline, the contact history and the
           derived is_ghosted, already sorted by who has waited longest. It is
           a security-barrier view, so it shows an applicant nothing. */
        api("application_queue?select=*&order=waiting_since.asc"),
        can("applications.note")
          ? api("application_notes?select=application_id,note")
          : Promise.resolve([]),
        can("social.view")
          ? api("application_socials?select=application_id,platform,handle,url")
          : Promise.resolve([]),
        api("application_documents?select=application_id,path,filename,bytes&order=uploaded_at.desc")
          .catch(function () { return []; })
      ];
      return Promise.all(jobs).then(function (r) {
        render(claims.email, r[0] || [], r[1] || [], r[2] || [], r[3] || []);
      });
    })
    .catch(function (e) {
      if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
      /* Same dead end as /status had: keep a way out beside the error. */
      view('<div class="card"><p class="msg msg--bad">Could not load. ' + esc(e.message) + "</p>" +
           '<button class="btn btn--ghost" id="out-error" type="button" style="margin-top:1.1rem">Sign out</button></div>');
      document.getElementById("out-error").addEventListener("click", signOut);
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

/* ────────────────────────── seats.html ────────────────────────── */

writeFileSync("seats.html", shell({
  title: "Your seats — SecureJobVA",
  links: [
    '        <a href="/">Hiring a VA?</a>',
    '        <a href="/contact">Contact</a>'
  ].join(nl),
  body: "  <section class=\"pt\">" + nl + "    <div class=\"wrap\" style=\"max-width:52rem\">" + nl + "      <div class=\"pt__head\">" + nl + "        <span class=\"eyebrow\">Your account</span>" + nl + "        <h1>The seats you have asked us for.</h1>" + nl + "        <p id=\"pt-lead\">Sign in with the address you used when you booked the call.</p>" + nl + "      </div>" + nl + "      <div id=\"pt-root\"></div>" + nl + "    </div>" + nl + "  </section>",
  script: SEATS_SCRIPT
}));

console.log("seats.html written");
