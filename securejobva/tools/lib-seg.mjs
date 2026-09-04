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

export const PAGES = [
  ["index.html",    "es/index.html",    "/es",          "/"],
  ["careers.html",  "es/careers.html",  "/es/careers",  "/careers"],
  ["contact.html",  "es/contact.html",  "/es/contact",  "/contact"],
  ["privacy.html",  "es/privacy.html",  "/es/privacy",  "/privacy"],
  ["terms.html",    "es/terms.html",    "/es/terms",    "/terms"],
  ["refunds.html",  "es/refunds.html",  "/es/refunds",  "/refunds"]
];
