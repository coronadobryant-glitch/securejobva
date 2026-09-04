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
import { walk, PAGES } from "./lib-seg.mjs";

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

  const flipped = flipToggle(translated, backTo);
  if (!flipped.ok) {
    bad++;
    report.push({ src, out, pct, done, total, missing: [], noToggle: true });
    continue;
  }
  const built = governingNotice(flipped.html, out);
  if (CHECK) {
    const have = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (have === null) {
      bad++;
      report.push({ src, out, pct, done, total, missing: [], stale: "has never been written" });
      continue;
    }
    if (have !== built) {
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
