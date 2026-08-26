/* The shared chrome — tokens, base CSS, the theme script, the brand mark —
   lifted out of careers.html so the generated pages cannot drift away from the
   hand-written ones.

   It used to be lifted by line number. That worked until careers.html grew a
   step and a sign-in link, at which point every slice pointed somewhere else:
   the generated pages ended up with two <header> blocks and two unclosed divs,
   and nothing failed, because a browser quietly repairs both. Anchors move with
   the file; line numbers do not. */
import { readFileSync } from "node:fs";

const SRC = "careers.html";

export function chrome() {
  const src = readFileSync(SRC, "utf8");
  const nl = "\r\n";

  const between = (open, close, what) => {
    const a = src.indexOf(open);
    if (a < 0) throw new Error(SRC + ": cannot find " + what + " (" + open + ")");
    const b = src.indexOf(close, a + open.length);
    if (b < 0) throw new Error(SRC + ": " + what + " is never closed");
    return src.slice(a + open.length, b).trim();
  };

  /* The font links sit between the <title> and the stylesheet. */
  const fonts = between("</title>", "<style>", "font links");

  /* Only the shared part of the stylesheet: the tokens, the base rules, the
     buttons and the nav. Everything from the hero marker onward is layout for
     careers.html specifically, and the generated pages bring their own.

     Taking the whole <style> block instead is the tempting simplification and
     costs about 45KB per page of rules for a dialog and a pricing table those
     pages do not contain. The section comment is the boundary the file already
     draws, so it is the one to cut on. */
  const SHARED_END = "/* ---------- hero ---------- */";
  const whole = between("<style>", "</style>", "stylesheet");
  const cut = whole.indexOf(SHARED_END);
  if (cut < 0) {
    throw new Error(SRC + ": no '" + SHARED_END + "' marker — cannot tell shared CSS from page CSS");
  }
  const css = whole.slice(0, cut).trim();

  /* The pre-paint theme script, found by what it does rather than where it is. */
  const themeAt = src.indexOf("sjva-theme");
  if (themeAt < 0) throw new Error(SRC + ": no theme script");
  const themeOpen = src.lastIndexOf("<script>", themeAt);
  const themeClose = src.indexOf("</script>", themeAt);
  if (themeOpen < 0 || themeClose < 0) throw new Error(SRC + ": theme script not wrapped");
  const themeScript = src.slice(themeOpen, themeClose + "</script>".length);

  /* The gradient the brand mark points at. */
  const defsAt = src.indexOf('<svg width="0" height="0"');
  if (defsAt < 0) throw new Error(SRC + ": no gradient defs");
  const defsEnd = src.indexOf("</svg>", defsAt);
  const svgDefs = src.slice(defsAt, defsEnd + "</svg>".length);

  /* The mark itself, taken from the first one on the page. */
  const markAt = src.indexOf('<svg class="brand__mark"');
  if (markAt < 0) throw new Error(SRC + ": no brand mark");
  const markEnd = src.indexOf("</svg>", markAt);
  const brandSvg = src.slice(markAt, markEnd + "</svg>".length);

  /* Cheap insurance against the next version of this mistake: chrome is style
     and artwork, never page structure. If a slice ever swallows a header
     again, this is what says so instead of the browser papering over it. */
  for (const [name, part] of [["fonts", fonts], ["theme script", themeScript],
                              ["gradient defs", svgDefs], ["brand mark", brandSvg]]) {
    if (/<header|<footer|class="nav__in"/.test(part)) {
      throw new Error("chrome: " + name + " swallowed page structure — the anchors are wrong");
    }
  }
  if (/<div|<header/.test(css)) {
    throw new Error("chrome: the stylesheet slice contains markup — the anchors are wrong");
  }

  return { fonts, css, themeScript, svgDefs, brandSvg, nl };
}
