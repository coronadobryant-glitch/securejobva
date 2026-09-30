import { readFileSync, existsSync } from "node:fs";

/* One definition of "a translatable segment", shared by the extractor, the
   builder and the guard — so the three can never disagree about what needs a
   translation, which is the only way a coverage number means anything.

   What is deliberately NOT here: value= and name=. Those are submitted to the
   database and matched against track names and shift names in the schema.
   Translating one would put Spanish in a column the product reads in English,
   and nothing would fail until a track stopped scoring. */
export const READABLE_ATTRS = ["placeholder", "aria-label", "alt", "title"];

const PROTECTED = /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi;

/* Split into runs the reader sees and runs they never do, keeping order so the
   page can be put back together unchanged apart from the words. */
export function regions(html) {
  const out = [];
  let at = 0;
  for (const m of html.matchAll(PROTECTED)) {
    if (m.index > at) out.push({ open: true, s: html.slice(at, m.index) });
    out.push({ open: false, s: m[0] });
    at = m.index + m[0].length;
  }
  if (at < html.length) out.push({ open: true, s: html.slice(at) });
  return out;
}

export const translatable = (s) =>
  /[A-Za-z]{2}/.test(String(s).replace(/&[a-z]+;|&#\d+;/gi, ""));

const TEXT = />([^<>]+)</g;
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

/* Walks one page and calls back with every segment, optionally replacing it.
   `fn(key)` returns a replacement or undefined to leave it alone. */
export function walk(html, fn) {
  return regions(html).map((r) => {
    if (!r.open) return r.s;
    return r.s
      .replace(TEXT, (whole, inner) => {
        const key = inner.trim();
        if (!translatable(key)) return whole;
        const to = fn(key, "text");
        if (to === undefined) return whole;
        return ">" + inner.replace(key, to) + "<";
      })
      .replace(ATTR, (whole, attr, val) => {
        if (!READABLE_ATTRS.includes(attr.toLowerCase())) return whole;
        const key = val.trim();
        if (!translatable(key)) return whole;
        const to = fn(key, "attr");
        if (to === undefined) return whole;
        return attr + '="' + to + '"';
      });
  }).join("");
}

/* ── the words a page builds after it has loaded ──────────────────────────

   walk() above never enters a script block, on purpose: a JS literal may be a
   selector, a class name, or a track name the database reads in English. But
   both step forms write their own sentences — the counter, every validation
   message, the confirmation — and those were reaching /es in English while the
   markup around them was Spanish.

   So those sentences go through say() in the page, and this is the one place
   that knows how to find them. Adjacent literals joined by + are one key: a
   sentence too long for a line is still one sentence, and it is the whole
   sentence that gets translated, never half of it.

   say(freed) and any other non-literal argument is invisible here, which is
   the intended reading — a key that is computed is not a key this can promise
   a translation for, so the page passes say() its literals instead. */
const SAY = /\bsay\(\s*("(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*)/g;

function joinLiterals(src) {
  let out = "";
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    out += m[1].replace(/\\(.)/g, (whole, c) =>
      c === "n" ? "\n" : c === "t" ? "\t" : c);
  }
  return out;
}

export function sayKeys(html) {
  const keys = [];
  for (const r of regions(html)) {
    if (r.open || !/^<script/i.test(r.s)) continue;
    for (const m of r.s.matchAll(SAY)) keys.push(joinLiterals(m[1]));
  }
  return keys;
}

/* Keys say() is handed as a variable rather than a literal, so sayKeys() is
   blind to them by construction. Only two, both from the DISC tick that gives
   way: say(freed), where freed is "most" or "least". Listed here so that the
   builder still ships them and the guard does not call them stale. */
export const SAY_COMPUTED = ["most", "least"];

export const PAGES = [
  ["index.html",    "es/index.html",    "/es",          "/"],
  ["careers.html",  "es/careers.html",  "/es/careers",  "/careers"],
  ["contact.html",  "es/contact.html",  "/es/contact",  "/contact"],
  ["privacy.html",  "es/privacy.html",  "/es/privacy",  "/privacy"],
  ["terms.html",    "es/terms.html",    "/es/terms",    "/terms"],
  ["refunds.html",  "es/refunds.html",  "/es/refunds",  "/refunds"]
];

/* The pages that build sentences at runtime: every page above whose source
   declares the empty SAYS that build-es.mjs replaces.

   This was a list written by hand — index.html and careers.html — and the
   question it existed to make somebody ask was never asked for /contact. Its
   form wrote "Tell us your name.", "Message sent." and "That did not send."
   in English under a Spanish heading on /es/contact, because nothing said
   the page had runtime sentences at all. Read from the page, the answer
   cannot fall behind: the day a page routes a sentence through say(), its
   keys are planted, checked for a translation, and tested in Spanish. A page
   that writes English at runtime WITHOUT say() is still invisible here, and
   that is what the "nothing is left in English" part of
   tools/test-es-runtime.mjs is for once it opts in. */
export const SAY_PAGES = PAGES.map(([src]) => src)
  .filter((src) => existsSync(src) && readFileSync(src, "utf8").indexOf("var SAYS = {};") > -1);
