/* Proves the Content-Security-Policy in vercel.json breaks no page.

   Offline: reads vercel.json and the page files, sends nothing anywhere.

   The policy sat in report-only for its whole life (F53) — "watch only", with
   nowhere set to send the reports, so it protected nothing and nobody would
   have heard if it had. It was left there because enforcing a policy you have
   not checked against every page is how a site goes blank. So this is the
   check, and it is what makes enforcing it safe to keep.

   What the policy says, and what each part could break:

     frame-ancestors 'self'  other sites may not put our pages in a frame.
                             Breaks nothing on our pages; X-Frame-Options
                             SAMEORIGIN already said the same.
     base-uri 'self'         a <base> may only point at us. Breaks any page
                             with a <base href> elsewhere.
     form-action 'self'      a form may only submit to us. Breaks any form
                             with an action (or a button with formaction)
                             on another origin.
     object-src 'none'       no <object>, <embed> or <applet>.

   It says nothing about scripts, styles, images or connections — which is
   why every inline <script> and every fetch to Supabase is untouched. If a
   directive is ever added that this file does not know how to check, it
   fails, rather than letting a script-src or default-src go live on a site
   whose pages are built of inline scripts.

   Pages checked: every .html in the root and es/, and dist/ when it exists
   (what Vercel actually serves, after build.mjs has wrapped them). Inline
   scripts are searched too, as text: a form or a <base> written by
   innerHTML is held to the policy exactly like one in the markup.

   Run: node tools/test-csp.mjs */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const rel = (p) => new URL(p, ROOT);

let bad = 0;
const ok = (label, cond, note) => {
  if (!cond) bad++;
  console.log("  " + (cond ? "ok  " : "FAIL") + "  " + label + (note ? "  — " + note : ""));
};

console.log("\ncsp\n");

/* ── the policy ─────────────────────────────────────────────────────────── */
const vercel = JSON.parse(readFileSync(rel("vercel.json"), "utf8"));
const all = [];
for (const block of vercel.headers || []) {
  for (const h of block.headers || []) all.push({ source: block.source, key: h.key, value: h.value });
}
const enforced = all.filter((h) => /^content-security-policy$/i.test(h.key));
const reportOnly = all.filter((h) => /^content-security-policy-report-only$/i.test(h.key));

ok("the policy is enforced, not report-only", enforced.length === 1 && reportOnly.length === 0,
  enforced.length + " enforced, " + reportOnly.length + " report-only");
ok("on every path", enforced[0] && enforced[0].source === "/(.*)", enforced[0] && enforced[0].source);

const directives = {};
for (const part of String(enforced[0] ? enforced[0].value : "").split(";")) {
  const w = part.trim().split(/\s+/).filter(Boolean);
  if (w.length) directives[w[0].toLowerCase()] = w.slice(1);
}

/* The directives this file knows how to prove safe, and the only values it
   accepts for them. Anything else is a change this check has not been taught
   about, and it says so instead of passing. */
const KNOWN = {
  "frame-ancestors": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"]
};
for (const [d, v] of Object.entries(directives)) {
  ok("directive " + d + " is one this check can prove", d in KNOWN,
    d in KNOWN ? "" : "teach tools/test-csp.mjs how to check " + d + " against every page first");
  if (d in KNOWN) {
    ok("  …with the value it was proven for", JSON.stringify(v) === JSON.stringify(KNOWN[d]), v.join(" "));
  }
}
for (const d of Object.keys(KNOWN)) ok("directive " + d + " is present", d in directives);

/* ── the pages ──────────────────────────────────────────────────────────── */
const pages = [];
const collect = (dir, deep) => {
  const abs = rel(dir);
  if (!existsSync(abs)) return;
  for (const f of readdirSync(abs)) {
    const p = dir ? join(dir, f) : f;
    if (statSync(rel(p)).isDirectory()) {
      if (deep && f !== "node_modules") collect(p + "/", deep);
    } else if (f.endsWith(".html")) pages.push(p.replace(/\\/g, "/"));
  }
};
collect("", false);
collect("es/", true);
collect("dist/", true);
ok("pages were found to check", pages.length >= 18, pages.length + " pages");

/* The site's own origins. 'self' is whichever one the page was served from;
   build.mjs makes www primary and the apex 308s to it. A relative action is
   always self. */
const SELF = ["https://www.securejobva.com", "https://securejobva.com"];
const isSelf = (u) => {
  const s = String(u || "").trim();
  if (!s || s.startsWith("/") && !s.startsWith("//")) return true;
  if (/^[?#]/.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith("//")) return true;
  return SELF.some((o) => s === o || s.startsWith(o + "/") || s.startsWith(o + "?"));
};

let forms = 0;
for (const p of pages) {
  const html = readFileSync(rel(p), "utf8");

  const base = html.match(/<base\b[^>]*>/gi) || [];
  ok(p + ": no <base> leaving the site",
    base.every((t) => isSelf((t.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1])), base.join(" "));

  const obj = html.match(/<(object|embed|applet)\b/gi) || [];
  ok(p + ": no <object>, <embed> or <applet>", obj.length === 0, obj.join(" "));

  const made = html.match(/createElement\(\s*["'](form|base|object|embed|applet)["']\s*\)/gi) || [];
  ok(p + ": no script makes a form, base or object", made.length === 0, made.join(" "));

  const tags = html.match(/<form\b[^>]*>/gi) || [];
  forms += tags.length;
  const off = tags.filter((t) => !isSelf((t.match(/\baction\s*=\s*["']?([^"'\s>]*)/i) || [])[1]));
  ok(p + ": every form submits to this site", off.length === 0, off.join(" "));

  const fa = (html.match(/\bformaction\s*=\s*["']?([^"'\s>]*)/gi) || [])
    .filter((a) => !isSelf(a.replace(/^formaction\s*=\s*["']?/i, "")));
  ok(p + ": no button submits elsewhere", fa.length === 0, fa.join(" "));

  /* A script that sets .action at run time is not visible as an attribute.
     None does today; if one ever does, look at what it sets. */
  const setAction = html.match(/\.(action|formAction)\s*=(?!=)/g) || [];
  ok(p + ": no script sets a form's action", setAction.length === 0, setAction.join(" "));

  /* No page may carry its own policy in a <meta>: two policies are both
     enforced, and one nobody checked here could be the stricter one. */
  ok(p + ": no second policy in a <meta>",
    !/http-equiv\s*=\s*["']?content-security-policy/i.test(html));
}
ok("the forms that exist were seen", forms > 0, forms + " forms");

console.log(bad ? "\n" + bad + " failed\n" : "\nevery page works under the enforced policy\n");
process.exit(bad ? 1 : 0);
