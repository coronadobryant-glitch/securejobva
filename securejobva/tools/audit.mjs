/* A sweep across every built page for the classes of bug that have actually
   bitten today: CSS that is overridden or never used, links that go nowhere,
   ids that collide, JS that reaches for an element that is not there, and
   form fields with no column behind them. */
import { readFileSync, readdirSync } from "node:fs";

const PAGES = ["index.html", "careers.html", "status.html", "admin.html",
               "privacy.html", "terms.html", "refunds.html", "contact.html", "seats.html"];

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
  [...new Set(dupes)].forEach((d) => note(f, "duplicate id", d));

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
