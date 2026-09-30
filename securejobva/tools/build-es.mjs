/* Writes the Spanish half of the public site.

   Six pages, and only the six a stranger can reach: the home page, /careers,
   /contact and the three policy pages. The portal is not here on purpose —
   status, hub, seats, pay and admin hold ninety-two words of markup between
   them and build every label they show at runtime, so translating them is a
   different job on a different file, and half a translated portal is worse
   than an English one.

   The English pages are the source and are never modified. That is the whole
   reason this is a build step rather than a script that rewrites the page in
   the browser: tools/check.mjs pins exact English sentences across files — the
   interview sentence that has to agree on /careers and /status, the typing row,
   the Approved label — and every one of those guards keeps reading the same
   file it always read.

   A page is written only when every segment on it has a translation. A page
   that is nine-tenths Spanish reads as broken rather than unfinished, and the
   person who would notice is the one who cannot read the other tenth.

   Run: node tools/build-es.mjs   (then node build.mjs to wrap them into dist/) */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { walk, PAGES, sayKeys, SAY_PAGES, SAY_COMPUTED } from "./lib-seg.mjs";

/* --check verifies without writing. tools/check.mjs runs it that way, and
   that is not a nicety: the first version wrote the pages and the two guards
   after it then read what it had just written, so neither could fail. A
   guard that rebuilds its own input is a guard that always passes — which is
   the same shape as a test that builds the row it is testing against.

   Checking rather than writing also catches the other failure: a Spanish page
   edited by hand. These six are generated, so anything in them that the
   generator would not produce is a change about to be silently overwritten. */
const CHECK = process.argv.includes("--check");

const DICT = JSON.parse(readFileSync("es/strings.json", "utf8"));

/* The other half of the translation: what the two step forms write after the
   page has loaded. walk() cannot reach it, because it never steps inside a
   script block — see lib-seg.mjs for why that is the right default and why
   this is the exception rather than a loosening of it. */
const SAYS = JSON.parse(readFileSync("es/runtime.json", "utf8"));

/* Every {placeholder} in the English has to survive into the Spanish, or a
   sentence quietly loses the number it was built to carry. Word order is free;
   the set is not. */
function placeholders(s) {
  return [...String(s).matchAll(/[{]([a-zA-Z]+)[}]/g)].map((m) => m[1]).sort().join(",");
}

/* Swaps the page's empty SAYS for the Spanish one. A literal replacement of a
   line the page declares for exactly this purpose, rather than anything that
   has to understand JavaScript. */
function plantSays(html, out, keys) {
  const anchor = "var SAYS = {};";
  if (html.split(anchor).length - 1 !== 1) {
    throw new Error(out + ": expected exactly one " + JSON.stringify(anchor) + " to replace");
  }
  const mine = {};
  for (const k of keys) mine[k] = SAYS[k];
  return html.replace(anchor, "var SAYS = " + JSON.stringify(mine, null, 0) + ";");
}

/* The language link is the one thing that must not be translated but must
   change: on an English page it points at the Spanish one, and on the Spanish
   page it points back. Rewritten as a whole element rather than by patching
   the href, so a label left saying ES on a Spanish page is impossible. */
function flipToggle(html, backTo) {
  const re = /<a class="langtog"[^>]*>[^<]*<\/a>/;
  if (!re.test(html)) return { html, ok: false };
  const en = '<a class="langtog" id="langtog" href="' + backTo + '" hreflang="en" ' +
    'lang="en" aria-label="View this page in English">EN</a>';
  return { html: html.replace(re, en), ok: true };
}

/* Privacy, terms and refunds are what the business is bound to. Publishing
   them in Spanish creates a second version of an agreement, so each one says
   which version governs — in Spanish, where the Spanish reader is. The other
   three pages are copy and need no such line. */
const GOVERNS = {
  "es/privacy.html": "/privacy",
  "es/terms.html":   "/terms",
  "es/refunds.html": "/refunds",
};

function governingNotice(html, out) {
  const en = GOVERNS[out];
  if (!en) return html;

  /* Found by anchor, the way the rest of this repo splices. The meta line is
     the Last-updated stamp, and the notice belongs directly under it. */
  const a = html.indexOf('<p class="doc__meta">');
  if (a < 0) throw new Error(out + ': no doc__meta to put the governing notice after');
  const b = html.indexOf('</p>', a);
  if (b < 0) throw new Error(out + ': the doc__meta paragraph is never closed');
  const cut = b + 4;

  const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  const eol = html.indexOf(CR + LF) > -1 ? CR + LF : LF;

  const notice = eol + '      <p class="doc__gov">Esta es una traducción de cortesía ' +
    'para facilitar la lectura. La versión en inglés es la que rige: si las dos ' +
    'difieren, prevalece el inglés. ' +
    '<a href="' + en + '" hreflang="en" lang="en">Read the English version</a>.</p>';

  return html.slice(0, cut) + notice + html.slice(cut);
}

/* A Spanish page links to Spanish pages.

   flipToggle() above used to be the only href this file rewrote, so every nav
   item, footer link and "see our pricing" on /es pointed back at the English
   twin — and "Empleos" pointed at the careers page's artifact address, which
   build.mjs turns into /careers, the English form. A Spanish-speaking
   applicant was one tap from the English apply dialog wherever she started.

   So a link to one of the six pages that have a twin goes to the twin: / to
   /es, /careers to /es/careers and so on, with the fragment kept (/#pricing
   becomes /es#pricing). The artifact addresses are resolved first, through
   build.mjs's own REWRITE list, read rather than copied so the two cannot
   disagree — including careers.html's SITE_URL, a string in a script rather
   than an href, which is where its "back to the site" link goes.

   Two kinds of link stay English, and both say hreflang="en": the EN toggle,
   and the "Read the English version" line on the legal pages. They exist to
   leave. build.mjs makes the same rewrite at build time, as a net; doing it
   here as well means the es/ files are what ships rather than something
   corrected on the way out, and a hand edit to them is caught by --check. */
const ES_TWIN = { "": "/es", careers: "/es/careers", contact: "/es/contact",
                  privacy: "/es/privacy", terms: "/es/terms", refunds: "/es/refunds" };

const ARTIFACTS = [...readFileSync("build.mjs", "utf8")
  .matchAll(/\[\s*"(https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]+)"\s*,\s*"(\/[a-z]*)"\s*\]/g)]
  .map((m) => [m[1], m[2]]);

function spanishLinks(html) {
  for (const [from, path] of ARTIFACTS) {
    const page = path.replace(/^\//, "");
    if (Object.prototype.hasOwnProperty.call(ES_TWIN, page)) html = html.split(from).join(ES_TWIN[page]);
  }
  return html.replace(/<a\b[^>]*>/g, (tag) => {
    if (/\bhreflang\s*=\s*["']?en\b/i.test(tag)) return tag;
    return tag.replace(/\bhref="\/([a-z]*)(#[^"]*)?"/, (all, page, frag) =>
      Object.prototype.hasOwnProperty.call(ES_TWIN, page)
        ? 'href="' + ES_TWIN[page] + (frag || "") + '"'
        : all);
  });
}

mkdirSync("es", { recursive: true });

let bad = 0;
const report = [];
for (const [src, out, , backTo] of PAGES) {
  if (!existsSync(src)) { console.log("  " + src + " — not built, skipped"); continue; }

  const missing = new Map();
  let total = 0;
  const translated = walk(readFileSync(src, "utf8"), (key) => {
    total++;
    const to = DICT[key];
    if (to === undefined) { missing.set(key, (missing.get(key) || 0) + 1); return undefined; }
    return to;
  });

  const done = total - [...missing.values()].reduce((a, b) => a + b, 0);
  const pct = total ? Math.round((done / total) * 100) : 100;

  if (missing.size) {
    bad++;
    report.push({ src, out, pct, done, total, missing: [...missing.keys()] });
    continue;
  }

  /* The runtime half. walk() left every say() key untouched, because they sit
     in a script block, so the English sentences are still there to be looked
     up — and "var SAYS = {};" is still there to be swapped. */
  let sayed = translated;
  if (SAY_PAGES.includes(src)) {
    const keys = [...new Set(sayKeys(readFileSync(src, "utf8")).concat(SAY_COMPUTED))];
    const noRuntime = keys.filter((k) => typeof SAYS[k] !== "string" || !SAYS[k]);
    const drifted = keys.filter((k) =>
      typeof SAYS[k] === "string" && SAYS[k] && placeholders(k) !== placeholders(SAYS[k]));
    if (noRuntime.length || drifted.length) {
      bad++;
      report.push({ src, out, pct, done, total, missing: [], runtime: noRuntime, drifted });
      continue;
    }
    sayed = plantSays(translated, out, keys);
  }

  const flipped = flipToggle(sayed, backTo);
  if (!flipped.ok) {
    bad++;
    report.push({ src, out, pct, done, total, missing: [], noToggle: true });
    continue;
  }
  const built = spanishLinks(governingNotice(flipped.html, out));
  if (CHECK) {
    const have = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (have === null) {
      bad++;
      report.push({ src, out, pct, done, total, missing: [], stale: "has never been written" });
      continue;
    }
    /* Line endings aside. build-policy.mjs writes its four pages with CRLF and
       the copies in the repo have been saved with LF, so the same English
       page gave a Spanish one that differed in nothing but \r — and was
       reported stale for it, on a checkout where nothing was behind. */
    if (have.replace(/\r/g, "") !== built.replace(/\r/g, "")) {
      bad++;
      report.push({ src, out, pct, done, total, missing: [],
        stale: "is not what the generator produces from the English page and es/strings.json" });
      continue;
    }
  } else {
    writeFileSync(out, built);
  }
  report.push({ src, out, pct, done, total, missing: [], written: !CHECK, ok: true });
}

for (const r of report) {
  const head = "  " + r.src.padEnd(15) + String(r.pct).padStart(3) + "%  " +
    String(r.done) + "/" + r.total + " segments";
  if (r.written) { console.log(head + "  ->  " + r.out); continue; }
  if (r.ok) { console.log(head + "  matches what the generator produces"); continue; }
  if (r.noToggle) { console.log(head + "  NOT WRITTEN — no language link in the nav"); continue; }
  if (r.runtime || r.drifted) {
    if (r.runtime.length) {
      console.log(head + "  NOT WRITTEN — " + r.runtime.length +
        " sentence(s) the page builds at runtime have no translation in es/runtime.json:");
      for (const m of r.runtime.slice(0, 6)) {
        console.log("      " + JSON.stringify(m.length > 88 ? m.slice(0, 88) + "…" : m));
      }
      if (r.runtime.length > 6) console.log("      … and " + (r.runtime.length - 6) + " more");
    }
    for (const m of r.drifted) {
      console.log(head + "  NOT WRITTEN — placeholders differ between the English and the Spanish:");
      console.log("      " + JSON.stringify(m.length > 88 ? m.slice(0, 88) + "…" : m));
    }
    continue;
  }
  if (r.stale) { console.log(head + "  STALE — " + r.out + " " + r.stale); continue; }
  console.log(head + "  NOT WRITTEN — " + r.missing.length + " without a translation:");
  for (const m of r.missing.slice(0, 6)) {
    console.log("      " + JSON.stringify(m.length > 88 ? m.slice(0, 88) + "…" : m));
  }
  if (r.missing.length > 6) console.log("      … and " + (r.missing.length - 6) + " more");
}

if (bad) {
  console.log("\n" + bad + " page(s) left in English. Add the missing strings to es/strings.json.");
  process.exit(1);
}
console.log("\nall six written");
