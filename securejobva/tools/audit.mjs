/* A sweep across every built page for the classes of bug that have actually
   bitten today: CSS that is overridden or never used, links that go nowhere,
   ids that collide, JS that reaches for an element that is not there, and
   form fields with no column behind them. */
import { readFileSync, readdirSync, existsSync } from "node:fs";

/* Every page build.mjs ships, read from build.mjs.

   This was a list typed here, and it stopped at nine: /hub and /pay — the
   pages assistants and paying clients live in — were never swept, and neither
   were the six Spanish pages. Added to a scratch copy, the first run found a
   theme toggle /hub looks for and never draws, and a day-note box with no
   label, both of which had shipped. A second copy of a list is a list that
   will disagree with the first; the route check at the bottom of this file
   learned that already, and reads build.mjs for the same reason. */
const PAGES = [...readFileSync("build.mjs", "utf8").matchAll(/^\s*src:\s*"([^"]+\.html)"/gm)]
  .map((m) => m[1])
  .filter((f) => existsSync(f));
if (PAGES.length < 9) throw new Error("could not read the page list out of build.mjs");

/* An id written in more than one place in a script is only a collision if
   both can be on the page at once. The portal pages draw a card from one
   function with several early returns — the interview card on /hub has four,
   one per state, each opening with id="iv-card" — and exactly one of them
   runs. Those are not duplicates, and reporting them teaches whoever reads
   this to skip the section.

   So an id is let off when every copy is inside a script, all in one
   function, and each copy sits in a different return statement: between any
   two of them the function returns. Anything else — a copy in the markup, a
   copy in another function, two copies in one returned string — is still a
   collision. */
function exclusiveBranches(h, id, scripts) {
  const at = [];
  const re = new RegExp("\\sid=\\\\?[\"']" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\\\?[\"']", "g");
  let m;
  while ((m = re.exec(h)) !== null) at.push(m.index);
  if (at.length < 2) return false;
  if (!at.every((i) => scripts.some(([a, b]) => i > a && i < b))) return false;
  for (let k = 1; k < at.length; k++) {
    const between = h.slice(at[k - 1], at[k]);
    if (/\r?\n(?:async\s+)?function\s/.test(between)) return false;   /* crossed into another function */
    if (!/(^|[;{}\n])\s*return\b/.test(between)) return false;        /* same returned string */
  }
  return true;
}

const found = [];
const note = (page, kind, detail) => found.push({ page, kind, detail });

const sql = readdirSync("sql")
  .filter((f) => /^\d+.*\.sql$/.test(f)).sort()
  .map((f) => readFileSync("sql/" + f, "utf8")).join("\n");

for (const f of PAGES) {
  const h = readFileSync(f, "utf8");
  const css = (h.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  const body = h.slice(h.indexOf("</style>"));
  const js = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

  /* ── duplicate ids ── */
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => [m.index, m.index + m[0].length]);
  [...new Set(dupes)]
    .filter((d) => !exclusiveBranches(h, d, scripts))
    .forEach((d) => note(f, "duplicate id", d));

  /* ── in-page anchors that resolve to nothing ── */
  const idSet = new Set(ids);
  [...body.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
    .filter((x) => x && !idSet.has(x))
    .forEach((x) => note(f, "dead anchor", "#" + x));

  /* ── getElementById targets that the markup never defines ──
     This is how a rename half-lands: the JS keeps working for every path that
     does not touch the missing node, so it fails only for some users. */
  const wanted = [...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  const dynamic = js;                       /* ids created at runtime */
  [...new Set(wanted)]
    .filter((x) => !idSet.has(x))
    .filter((x) => !new RegExp('id="' + x + '"').test(dynamic))
    .filter((x) => !new RegExp("id=\\\\?'" + x).test(dynamic))
    .forEach((x) => note(f, "JS wants a missing id", x));

  /* ── the specificity trap: two single-class rules for the same property
        where the later one silently wins ── */
  const decls = [...css.matchAll(/(^|\n)\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g)];
  const seen = new Map();
  for (const d of decls) {
    const cls = d[2];
    for (const prop of d[3].split(";").map((x) => x.split(":")[0].trim()).filter(Boolean)) {
      const key = cls + "|" + prop;
      if (seen.has(key)) note(f, "same property set twice on one class", "." + cls + " { " + prop + " }");
      else seen.set(key, true);
    }
  }

  /* ── images without alt ── */
  [...body.matchAll(/<img(?![^>]*\salt=)[^>]*>/g)]
    .forEach(() => note(f, "img without alt", ""));

  /* ── inputs with neither a label nor an aria-label ── */
  const labelled = new Set([...h.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].forEach((m) => {
    const attrs = m[2];
    if (/type="(hidden|radio|checkbox|submit)"/.test(attrs)) return;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (!attrs.includes("aria-label") && (!id || !labelled.has(id))) {
      note(f, "field with no label", id || attrs.slice(0, 40));
    }
  });

  /* ── external links missing rel on target=_blank ── */
  [...body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)]
    .filter((m) => !/rel="[^"]*noopener/.test(m[0]))
    .forEach((m) => note(f, "target=_blank without noopener", m[0].slice(0, 60)));
}

/* ── every form field has a column: the contact form is not covered by
      check.mjs, which only knows about the two intake forms ── */
const contact = readFileSync("contact.html", "utf8");
const sent = [...contact.matchAll(/^\s{6}([a-z_]+): /gm)].map((m) => m[1]);
const table = (sql.match(/create table if not exists public\.contact_messages\s*\(([\s\S]*?)\n\);/) || [])[1] || "";
const cols = new Set([...table.matchAll(/^\s{2}([a-z_]+)\s+/gm)].map((m) => m[1]));
sent.filter((k) => !cols.has(k)).forEach((k) => note("contact.html", "no column for form field", k));

/* ── cross-page links that do not correspond to a built route ── */
/* Read from build.mjs rather than written down here. This list was a copy of
   the one in build.mjs and went stale the day /hub was added: the audit then
   reported a link to a page that exists and is deployed. A second copy of a
   list is a list that will disagree with the first. */
const routes = new Set(
  [...readFileSync("build.mjs", "utf8").matchAll(/^\s*path:\s*"([^"]+)"/gm)].map((m) => m[1])
);
if (routes.size < 5) throw new Error("could not read the routes out of build.mjs");
for (const f of PAGES) {
  const h = readFileSync(f, "utf8");
  [...h.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1])
    .filter((x) => !routes.has(x) && !/\.(svg|png|xml|txt)$/.test(x))
    .forEach((x) => note(f, "link to a route that is not built", x));
}

if (!found.length) {
  console.log("\nno issues found\n");
} else {
  console.log("");
  const byKind = {};
  found.forEach((x) => (byKind[x.kind] = byKind[x.kind] || []).push(x));
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(kind + "  (" + list.length + ")");
    list.slice(0, 12).forEach((x) => console.log("    " + x.page.padEnd(14) + x.detail));
    if (list.length > 12) console.log("    … and " + (list.length - 12) + " more");
    console.log("");
  }
}

process.exit(found.length ? 1 : 0);
