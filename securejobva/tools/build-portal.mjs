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
/* The legal row is the one place in the footer where the links have to look
   like links. The column links above sit under headings that already say what
   they are; these are a run of words separated by dots at .82rem, and with no
   underline they read as a line of grey text somebody has stopped scrolling
   past. Underlined, they are findable, which is the entire job of a policy
   link.

   Scoped .foot .foot__bot a, not .foot__bot a. Both that and .foot a are one
   class plus one element, so a bare version only wins by sitting later in the
   file — and every rule in this stylesheet has moved at least once today. */
.foot .foot__bot a{text-decoration:underline;text-underline-offset:.22em;text-decoration-thickness:from-font;color:var(--ink-2)}
.foot .foot__bot a:hover{color:var(--accent)}
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
/* An error is not decoration: it wraps, it stays, and it is readable. */
.row__ok.is-bad{color:#B3261E;font-weight:600;opacity:1;flex-basis:100%;line-height:1.45}
:root[data-theme="dark"] .row__ok.is-bad{color:#F2B8B5}
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
.cal__set{display:inline-flex;align-items:center;gap:.4rem;font-size:.82rem;color:var(--ink-2)}
.cal__set input{font-family:inherit;font-size:.82rem;padding:.3rem .45rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink)}
.cal__issues{background:#FDECEA;border-left:3px solid #B3261E;border-radius:0 8px 8px 0;padding:1rem 1.15rem;margin-top:1rem}
:root[data-theme="dark"] .cal__issues{background:#2B1512}
.cal__ih{margin:0 0 .5rem;font-size:.95rem;color:#B3261E}
:root[data-theme="dark"] .cal__ih{color:#F2B8B5}
.cal__i{margin:0 0 .5rem;font-size:.88rem;color:var(--ink-2);line-height:1.55}
.cal__i:last-child{margin-bottom:0}
.cal__i b{color:var(--ink)}
.cal__day{margin-top:1.3rem}
.cal__dh{margin:0 0 .5rem;font-size:.92rem;display:flex;align-items:center;gap:.5rem}
.cal__today{font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;background:var(--signal);color:var(--signal-ink);padding:.16rem .4rem;border-radius:4px}
.cal__row{display:grid;grid-template-columns:5rem 1fr;gap:.3rem .8rem;padding:.5rem .7rem;background:var(--surface-2);border-radius:7px;margin-bottom:.35rem}
.cal__t{font-family:"IBM Plex Mono",monospace;font-size:.82rem;color:var(--ink-2)}
.cal__n{font-weight:600;font-size:.92rem}
.cal__w{grid-column:2;font-size:.78rem;color:var(--muted)}
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
.notes{margin-top:.7rem;padding-top:.6rem;border-top:1px dashed var(--line)}
.note__e{padding:.45rem .6rem;background:var(--surface-2);border-radius:7px;margin-bottom:.3rem}
.note__m{display:block;font-family:"IBM Plex Mono",monospace;font-size:.68rem;color:var(--muted);letter-spacing:.03em}
.note__t{display:block;font-size:.88rem;color:var(--ink-2);line-height:1.5;white-space:pre-wrap;margin-top:.15rem}
.note__none{margin:0 0 .4rem;font-size:.84rem;color:var(--muted)}
.note__more{margin-bottom:.3rem}
.note__more summary{cursor:pointer;font-size:.8rem;color:var(--accent);list-style:none;padding:.3rem 0}
.note__more summary::-webkit-details-marker{display:none}
.note__more summary::before{content:"+ ";font-family:"IBM Plex Mono",monospace}
.note__more[open] summary::before{content:"− "}
.note__add{display:flex;gap:.5rem;align-items:flex-start;margin-top:.45rem}
.note__add textarea{
  flex:1;min-width:10rem;font-family:inherit;font-size:.88rem;padding:.45rem .6rem;
  border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);
  resize:vertical;min-height:2.2rem;
}
.disc__r{margin-top:.7rem;padding:.6rem .75rem;background:var(--surface-2);border-radius:8px}
.disc__r--none{font-size:.82rem;color:var(--muted)}
.disc__rk{
  display:block;font-family:"IBM Plex Mono",monospace;font-size:.62rem;
  letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
}
.disc__rn{display:block;font-weight:600;font-size:.95rem;margin-top:.12rem}
.disc__r2{font-weight:400;font-size:.84rem;color:var(--muted)}
.disc__rf{display:block;font-size:.82rem;color:var(--ink-2);margin-top:.1rem}
.disc__bs{display:grid;gap:.18rem;margin-top:.5rem}
.disc__b{display:grid;grid-template-columns:1.1rem 1fr 2.2rem;align-items:center;gap:.45rem}
.disc__bk{font-family:"IBM Plex Mono",monospace;font-size:.7rem;color:var(--muted)}
.disc__bt{position:relative;display:block;height:.5rem;background:var(--surface);border-radius:3px;overflow:hidden}
.disc__bt::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--line)}
.disc__bt i{position:absolute;top:0;bottom:0;background:var(--accent);border-radius:2px}
.disc__bv{
  font-family:"IBM Plex Mono",monospace;font-size:.72rem;color:var(--ink-2);
  text-align:right;font-variant-numeric:tabular-nums;
}
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
.edit__sec{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:1.4rem 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--line)}
.edit__grid{display:grid;gap:0 1.1rem}
@media(min-width:560px){.edit__grid{grid-template-columns:1fr 1fr}}
.edit__foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.8rem 1rem;margin-top:1.4rem;padding-top:1.1rem;border-top:1px solid var(--line)}
.edit__foot .chk{flex:1 1 15rem;min-width:0}
.edit__act{display:inline-flex;align-items:center;gap:.7rem;flex:0 0 auto}
.adm__wrap{display:grid;grid-template-columns:1fr;gap:0;align-items:stretch;min-height:100vh}
@media(min-width:900px){.adm__wrap{grid-template-columns:16rem 1fr}}
.adm__main{min-width:0}
.rail{display:flex;flex-direction:column;gap:.12rem;background:var(--ink);border-radius:0;padding:0 0 1rem;position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto}
@media(max-width:899px){.rail{position:static;flex-direction:column;max-height:none;gap:.12rem}}
.rail__k{font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#5C769A;padding:.75rem .5rem .25rem}
@media(max-width:899px){.rail__k{display:none}}
.rnav{display:flex;align-items:center;gap:.5rem;width:100%;padding:.42rem .9rem;border:0;border-left:2px solid transparent;border-radius:0;background:none;color:#B9C8DE;font:inherit;font-size:.87rem;text-align:left;cursor:pointer}
@media(max-width:899px){.rnav{width:auto;font-size:.82rem}}
.rnav:hover{background:rgba(255,255,255,.06);color:#fff}
.rnav.is-on{background:var(--accent);color:var(--accent-ink);font-weight:600}
.rnav svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
.rnav__n{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:.68rem;background:rgba(255,255,255,.14);color:#fff;border-radius:9px;padding:0 .34rem;min-width:1.1rem;text-align:center}
.rnav__n:empty{display:none}
.rnav.is-on .rnav__n{background:rgba(0,0,0,.22)}
.rnav__n.is-warn{background:var(--signal);color:var(--signal-ink)}
body:has(.adm__wrap) main{padding:0}
.rail__brand{display:flex;align-items:center;gap:.1rem;padding:1rem .9rem .2rem;color:#fff;font-family:"IBM Plex Sans Condensed",sans-serif;font-weight:700;font-size:1.05rem;text-decoration:none}
.rail__brand b{color:var(--accent)}
.rail__me{display:flex;align-items:center;gap:.5rem;padding:.35rem .9rem 1rem;color:#8FA5C4;font-size:.74rem;line-height:1.35;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:.3rem}
.rail__me b{display:block;color:#DCE6F5;font-size:.82rem}
.rail__me .who__av{width:26px;height:26px;flex:0 0 auto}
.rnav.is-on{border-left-color:var(--accent);background:rgba(255,255,255,.07);color:#fff}
.rail__k{padding-left:.9rem}
.rail__foot{margin-top:auto;padding:1rem .9rem 0;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:.15rem}
.rlink{color:#B9C8DE;font-size:.82rem;text-decoration:none;padding:.15rem 0}
.rlink:hover{color:#fff}
.rail__tiny{font-size:.68rem;color:#6F87A8;line-height:1.5;margin-top:.35rem}
.rail__tiny a{color:#6F87A8}
.rail__acts{display:flex;gap:.4rem;margin-top:.6rem}
.rbtn{font:inherit;font-size:.76rem;color:#B9C8DE;background:none;border:1px solid rgba(255,255,255,.18);border-radius:5px;padding:.25rem .6rem;cursor:pointer}
.rbtn:hover{color:#fff;border-color:rgba(255,255,255,.4)}
.adm__main{display:flex;flex-direction:column;background:var(--surface-2,var(--paper))}
.adm__top{background:var(--ink);color:#fff;padding:.9rem 1.2rem;display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap}
.adm__top h2{margin:0;font-size:1.3rem;color:#fff;font-family:"IBM Plex Sans Condensed",sans-serif}
.adm__top .k{font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.13em;text-transform:uppercase;color:#7C93B4;display:block}
.adm__topn{margin-left:auto;text-align:right}
.adm__topn b{display:block;font-family:"IBM Plex Sans Condensed",sans-serif;font-size:1.6rem;line-height:1.1;font-variant-numeric:tabular-nums}
.adm__topn span{font-size:.72rem;color:#7C93B4}
.adm__canvas{padding:1.1rem 1.2rem 2.5rem}
.adm__page{padding:0;margin:0}
.adm__bar{margin:0;padding:.65rem 1.2rem;background:var(--paper);border-bottom:1px solid var(--line)}
.adm__bar input,.adm__bar select{font-size:.85rem}
.adm__gate{min-height:100vh;display:grid;place-items:center;padding:2rem 1.2rem;background:var(--surface-2)}
.adm__gatebox{width:100%;max-width:31rem;display:flex;flex-direction:column;gap:1rem}
.adm__gatebrand{font-family:"IBM Plex Sans Condensed",sans-serif;font-weight:700;font-size:1.3rem;color:var(--ink);display:flex;align-items:baseline;gap:.6rem}
.adm__gatebrand b{color:var(--accent)}
.adm__gatebrand small{font-family:"IBM Plex Sans",sans-serif;font-weight:400;font-size:.8rem;color:var(--muted)}
.rail__title{display:block;font-family:"IBM Plex Sans Condensed",sans-serif;font-size:.78rem;color:#7C93B4;padding:0 .9rem .55rem}
.kpis{display:grid;gap:.7rem;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));margin-bottom:1rem}
.kpis:empty{display:none}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:.7rem .85rem}
.kpi b{display:block;font-family:"IBM Plex Sans Condensed",sans-serif;font-size:1.55rem;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi span{display:block;font-size:.76rem;color:var(--muted);margin-top:.1rem}
.kpi--warn{border-color:var(--signal)}
.kpi--warn b{color:var(--signal-ink)}
.kpi--good b{color:#0B7A63}
.hub__hi{text-align:center;margin:1.6rem 0 1.4rem}
.hub__hi h2{font-size:1.6rem;margin:0 0 .2rem}
.hub__hi p{margin:0;color:var(--muted);font-size:.95rem}
.tls{display:grid;gap:.8rem;grid-template-columns:repeat(2,1fr);margin-bottom:1.6rem}
@media(min-width:720px){.tls{grid-template-columns:repeat(4,1fr)}}
.tl{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface);text-decoration:none}
.tl:hover{border-color:var(--accent)}
.tl__art{background:var(--surface-2);display:grid;place-items:center;padding:1.2rem .8rem;border-bottom:1px solid var(--line)}
.tl__art svg{width:32px;height:32px;stroke:var(--accent);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.tl__l{background:var(--ink);color:var(--paper);padding:.55rem .6rem;text-align:center;font-size:.82rem;font-weight:600}
.tl__l small{display:block;font-weight:400;font-size:.7rem;opacity:.72;margin-top:.1rem}
.tl--soon{opacity:.62;cursor:default}
.tl--soon .tl__art svg{stroke:var(--muted)}
.tl--soon:hover{border-color:var(--line)}
.lvs{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:1.2rem}
.lv{background:var(--surface);padding:.7rem .9rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.lv__w{display:block;font-size:.85rem;color:var(--muted)}
.pays{display:grid;gap:.6rem;margin:.4rem 0 1rem}
.pay{display:flex;gap:.7rem;align-items:flex-start;border:1px solid var(--line);border-radius:7px;padding:.75rem .9rem;cursor:pointer}
.pay.is-on{border-color:var(--accent);background:var(--accent-soft)}
.pay b{display:block;color:var(--ink);font-size:.93rem}
.pay span span{font-size:.85rem;color:var(--muted)}
.nts{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:1rem}
.nt{background:var(--surface);padding:.85rem 1rem;display:grid;gap:.25rem}
.nt__t{color:var(--ink);font-weight:600;font-size:.95rem}
.nt__pin{font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;color:var(--accent-deep);background:var(--accent-soft);padding:.1rem .35rem;border-radius:3px}
.nt__d{font-family:"IBM Plex Mono",monospace;font-size:.7rem;color:var(--muted)}
.nt__b{margin:.2rem 0 0;font-size:.9rem;white-space:pre-wrap}
.pill--pending{background:var(--surface-2);color:var(--ink-2)}

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
.pill--hired{background:#0B7A63;color:#fff}
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

   The token was kept in sessionStorage, which dies with the tab. The intent was
   right — it is a key to somebody's personal data on a machine that may be
   shared — but the mechanism was wrong, and it made the portal unusable: click
   the logo, come back in a new tab, close and reopen, restore a window, and you
   were signed out with no explanation.

   It bought less than it looked like, too. For as long as the tab stayed open
   the token sat there just the same, and a tab can stay open for days.

   So the session lives in localStorage now and the limit is time, which is the
   thing that was actually meant: session() already refuses a token past its
   expiry, and Supabase issues them for an hour. Signing out clears it. That is
   an hour on a shared machine instead of "until somebody closes the tab",
   which is both shorter and predictable. */
var SB   = "https://hmgravlkatfmerzbozct.supabase.co";
var ANON = "sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY";
var KEY  = "sjva-session";

function saveSession(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}
function loadSession() {
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
  /* Anyone signed in when this shipped has their session in the old place.
     Move it rather than logging them out to fix a bug about being logged out. */
  if (!raw) {
    try {
      raw = sessionStorage.getItem(KEY);
      if (raw) { localStorage.setItem(KEY, raw); sessionStorage.removeItem(KEY); }
    } catch (e) { return null; }
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem(KEY); } catch (e) {}
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
    /* Prefer: return=minimal answers a POST with 201 and an empty body, not
       204, so checking the status was not enough — adding a note reported
       "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
       in red under the box, after the note had already been saved. Read the
       body and decide on what is actually there. */
    return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
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
  ["approved",   "Approved &mdash; paid training", "You are through. Paid training starts within a week."],
  /* The ladder used to end at approved, which left the story stopping halfway:
     you passed, and then nothing. Being placed with a client is a different day
     and somebody decides it, so it is a rung rather than something inferred. */
  ["hired",      "Hired", "You are on the team. Your portal is at /hub."]
];
var LABEL = { applied: "Applied", assessment: "Assessment", interview: "Interview",
              approved: "Approved", hired: "Hired", declined: "Declined" };


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
    ...(o.app ? [] : ['<header class="nav">',
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
"</header>"]),
    "",
    "<main>",
    o.body,
    "</main>",
    "",
    ...(o.app ? [] : ['<footer class="foot">',
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
"</footer>"]),
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

  /* Eleven controls in one flat column, with the equipment tick and the button
     sharing a line and overlapping each other on a narrow window — the tick's
     label ran underneath "Save changes" and could not be read.

     Grouped instead, in the order somebody thinks about their own application:
     how we reach them, when they can work, then how they rate themselves. The
     five ratings sit two to a row on anything wide enough, which takes the
     page from eleven stacked fields to something a person can see the end of.

     Every id is unchanged. wireEdit() reads them by id, and quietly renaming
     one here would stop that field saving with nothing to show for it. */
  var reach = EDIT_FIELDS.filter(function (f) { return f[0] === "phone" || f[0] === "cv"; });
  var when = EDIT_FIELDS.filter(function (f) { return f[0] !== "phone" && f[0] !== "cv"; });
  var field = function (f) {
    return '<div class="fld"><label for="e-' + f[0] + '">' + esc(f[1]) + "</label>" +
           '<input id="e-' + f[0] + '" type="' + f[2] + '" value="' + esc(a[f[0]] || "") + '"></div>';
  };

  return (
    '<div class="card">' +
      '<h2 class="edit__h">Keep this up to date</h2>' +
      '<p class="msg" style="margin-top:0">A better phone number or a newer CV helps us reach you. Changes save straight away.</p>' +

      '<p class="edit__sec">How we reach you</p>' +
      '<div class="edit__grid">' + reach.map(field).join("") + "</div>" +

      '<p class="edit__sec">Where and when you work</p>' +
      '<div class="edit__grid">' + when.map(field).join("") + "</div>" +
      '<div class="fld"><label for="e-note">Anything we should know?</label>' +
        '<textarea id="e-note" rows="3">' + esc(a.note || "") + "</textarea></div>" +

      '<p class="edit__sec">How you rate yourself</p>' +
      '<div class="edit__grid">' + skills + "</div>" +

      '<div class="edit__foot">' +
        '<label class="chk"><input type="checkbox" id="e-kit"' +
          (a.has_equipment ? " checked" : "") + "> I have my own computer and internet</label>" +
        '<span class="edit__act">' +
          '<span class="row__ok" id="e-ok">Saved</span>' +
          '<button class="btn btn--solid" id="e-save" type="button">Save changes</button>' +
        "</span>" +
      "</div>" +
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
          "<li><b>Shifts you offered</b><span>" + esc((a.shifts || []).join(", ") || "—") + "</span></li>" +
          "<li><b>Experience</b><span>" + esc(a.experience || "—") + "</span></li>" +
          "<li><b>Based in</b><span>" + esc(a.country || "—") + "</span></li>" +
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

  /* Two, not three. "I work at SecureJobVA" used to sit here and it should not
     have: staff is not a thing anybody asks for, it is a thing an administrator
     grants under Accounts. Offering it invited every applicant who saw the page
     to tick it, and every one of those is a request somebody then has to read
     and refuse.

     Nothing is lost by taking it away. It never granted anything — it only ever
     created a request — and the granting path in /admin is untouched. */
  var TYPES = [
    ["applicant", "I am looking for work",
     "An employee seat. See your application and how far along it is."],
    ["business", "I am hiring",
     "An employer account. See the seats you have asked us for."]
  ];

  var tick = '<span class="opt__box"><svg width="11" height="11" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"></path></svg></span>';

  return (
    '<div class="card">' +
      '<h2 class="edit__h">What brings you here?</h2>' +
      '<p class="msg" style="margin-top:0">There is nothing under this address yet. ' +
      "Whichever of these you are, the next step is a form &mdash; it is the form that " +
      "creates your place here." +
      (declined ? " Your last request was not approved &mdash; you are welcome to apply again." : "") +
      "</p>" +

      /* This used to file a request for an account and stop there: "Waiting on
         us", and no way forward. Nothing was waiting on us. Both pages find
         your row by the address you are signed in with — the policies match on
         email, not on a role — so an account was never the thing standing
         between somebody and their own page. The form was.

         So each choice goes to the form it means. Applying is what creates an
         application; asking for a seat is what creates a seat. The account
         follows from the row, which is how it already worked. */
      '<div class="opts opts--stack" style="margin-top:1rem">' +
        '<a class="opt" href="/careers#apply-now">' + tick +
          "<span>" +
            '<span class="opt__t">I am looking for work</span>' +
            '<span class="opt__d">Fill in the application &mdash; five short steps. ' +
            "It appears on this page the moment you send it.</span>" +
          "</span></a>" +
        '<a class="opt" href="/#book">' + tick +
          "<span>" +
            '<span class="opt__t">I am hiring</span>' +
            '<span class="opt__d">Tell us the seat you need. ' +
            "It appears on your seats page as soon as it reaches us.</span>" +
          "</span></a>" +
      "</div>" +

      '<p class="msg">Signed in with the wrong address? Sign out above and use the one ' +
      "you applied or booked with &mdash; that is how we find you.</p>" +
    "</div>"
  );
}

/* wireChooser() lived here. It read the radio, called request_account_type and
   printed "Waiting on us". Both choices are links to the forms now, so there is
   nothing to wire — and the audit said so plainly: the JS wanted acct-go,
   acct-msg and acct-note, none of which the page renders any more. */

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

const SEATS_SCRIPT = "var root = document.getElementById(\"pt-root\");\nvar lead = document.getElementById(\"pt-lead\");\n\nfunction view(html) { root.innerHTML = html; }\n\n/* The five stages the home page already promises. Kept in one place so the\n   wording a client reads here matches the wording that sold them the seat. */\nvar SEAT_STAGES = [\n  [\"received\",    \"Request received\",  \"We have it. A person reads every one.\"],\n  [\"call_booked\", \"Call booked\",       \"Twenty minutes to agree the hours, the tasks and the rate.\"],\n  [\"matching\",    \"Matching\",          \"We are shortlisting from assistants already trained in your track.\"],\n  [\"shortlist\",   \"Shortlist sent\",    \"Names with you. You choose; we handle the handover.\"],\n  [\"running\",     \"Seat running\",      \"Your assistant is working the hours you set.\"]\n];\nvar SEAT_LABEL = {\n  received: \"Received\", call_booked: \"Call booked\", matching: \"Matching\",\n  shortlist: \"Shortlist\", running: \"Running\", closed: \"Closed\"\n};\n\nfunction seatStageIndex(s) {\n  for (var i = 0; i < SEAT_STAGES.length; i++) if (SEAT_STAGES[i][0] === s) return i;\n  return -1;\n}\n\nfunction signedOut(msg) {\n  view(\n    '<div class=\"card\">' +\n      (msg ? '<p class=\"msg msg--bad\">' + esc(msg) + \"</p>\" : \"\") +\n      '<button class=\"gbtn\" id=\"go\" type=\"button\">Continue with Google</button>' +\n      '<p class=\"msg\">Use the address you booked the call with &mdash; that is how we find your seats. ' +\n      'If you have not asked us for a seat yet, <a href=\"/#book\">book a call</a> first.</p>' +\n    \"</div>\"\n  );\n  document.getElementById(\"go\").addEventListener(\"click\", signIn);\n}\n\nfunction money(n) {\n  if (n === null || n === undefined) return \"\";\n  return \"$\" + Number(n).toLocaleString(\"en-US\");\n}\n\nfunction stages(r) {\n  if (r.status === \"closed\") {\n    return '<div class=\"note note--warn\" style=\"margin-top:1.2rem\"><b>This request is closed.</b> ' +\n           'If you want to pick it up again, <a href=\"/#book\">book a call</a> and we will start from what we already know.</div>';\n  }\n  var at = seatStageIndex(r.status);\n  var out = \"\";\n  for (var i = 0; i < SEAT_STAGES.length; i++) {\n    var st = SEAT_STAGES[i];\n    var done = at > i;\n    var now = at === i;\n    out +=\n      '<li class=\"' + (now ? \"is-now is-done\" : done ? \"is-done\" : \"\") + '\">' +\n        '<span class=\"stg__dot\">' + (done ? \"&#10003;\" : String(i + 1)) + \"</span>\" +\n        \"<span>\" +\n          '<span class=\"stg__t\">' + st[1] + \"</span>\" +\n          '<span class=\"stg__d\">' + st[2] + \"</span>\" +\n          (now ? '<span class=\"stg__badge\">You are here</span>' : \"\") +\n        \"</span>\" +\n      \"</li>\";\n  }\n  return '<ol class=\"stg\">' + out + \"</ol>\";\n}\n\nfunction render(email, rows) {\n  var initial = (email || \"?\").charAt(0).toUpperCase();\n  var who =\n    '<div class=\"who\">' +\n      '<div class=\"who__id\"><span class=\"who__av\">' + esc(initial) + \"</span>\" +\n      '<span class=\"who__t\"><span class=\"who__n\">' +\n      esc((rows[0] && rows[0].company) || \"Your account\") + \"</span>\" +\n      '<span class=\"who__e\">' + esc(email) + \"</span></span></div>\" +\n      '<button class=\"btn btn--ghost\" id=\"out\" type=\"button\" style=\"padding:.5rem .9rem;font-size:.88rem\">Sign out</button>' +\n    \"</div>\";\n\n  lead.textContent = \"Signed in as \" + email + \".\";\n\n  if (!rows.length) {\n    view(who +\n      '<div class=\"card\">' +\n        '<div class=\"note\"><b>Nothing here under this address yet.</b> ' +\n        \"A seat request appears here once you have sent one. If you booked a call with a \" +\n        \"different email, sign out and use that one.</div>\" +\n        '<p style=\"margin-top:1.2rem\"><a class=\"btn btn--solid\" href=\"/#book\">Book a 20-minute call</a></p>' +\n      \"</div>\");\n    document.getElementById(\"out\").addEventListener(\"click\", signOut);\n    return;\n  }\n\n  var html = who;\n  for (var i = 0; i < rows.length; i++) {\n    var r = rows[i];\n    /* weekly is what the dialog quoted at the time. Shown as the quote it was\n       rather than as a live price, because the rate is agreed on the call and\n       this row is a record of what was asked for. */\n    html +=\n      '<div class=\"card\">' +\n        '<div class=\"row__top\">' +\n          \"<span>\" +\n            '<span class=\"row__n\">' +\n              esc((r.seats && r.seats.length ? r.seats.join(\" + \") : \"Seat\")) + \"</span>\" +\n            '<span class=\"row__meta\"> &middot; asked ' + esc(when(r.created_at)) + \"</span>\" +\n          \"</span>\" +\n          '<span class=\"pill pill--' + esc(r.status) + '\">' +\n            esc(SEAT_LABEL[r.status] || r.status) + \"</span>\" +\n        \"</div>\" +\n        stages(r) +\n        '<ul class=\"meta\">' +\n          \"<li><b>Hours a week</b><span>\" + esc(r.hours || \"—\") + \"</span></li>\" +\n          (r.weekly ? \"<li><b>Quoted</b><span>\" + esc(money(r.weekly)) + \" a week</span></li>\" : \"\") +\n          \"<li><b>Cover</b><span>\" + esc((r.blocks || []).join(\", \") || \"—\") + \"</span></li>\" +\n          \"<li><b>Your time zone</b><span>\" + esc(r.timezone || \"—\") + \"</span></li>\" +\n          \"<li><b>Last updated</b><span>\" +\n            esc(when(r.status_changed_at) || when(r.created_at)) + \"</span></li>\" +\n        \"</ul>\" +\n      \"</div>\";\n  }\n\n  html += '<p class=\"msg\">Something not right? Reply to the email we sent you, or write to ' +\n          '<a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>';\n  view(html);\n  document.getElementById(\"out\").addEventListener(\"click\", signOut);\n}\n\nfunction start() {\n  captureRedirect();\n  if (CAME_FROM_RESET) { passwordForm(\"\"); return; }\n  var err = authError();\n  if (!session()) { signedOut(err); return; }\n\n  var claims = readToken(session().access_token);\n  if (!claims || !claims.email) {\n    clearSession();\n    signedOut(\"That sign-in did not carry an email address.\");\n    return;\n  }\n\n  view('<div class=\"card\"><span class=\"spin\"></span>Looking up your seats&hellip;</div>');\n\n  /* The policy returns only rows carrying this address, so there is no filter\n     here to get wrong: asking for everything and being given your own is the\n     database's job, not the page's. */\n  api(\"seat_requests?select=id,created_at,seats,hours,weekly,blocks,timezone,company,status,status_changed_at&order=created_at.desc\")\n    .then(function (rows) { render(claims.email, rows || []); })\n    .catch(function (e) {\n      if (String(e.message) === \"signed out\") { signedOut(\"Your session expired. Sign in again.\"); return; }\n      view('<div class=\"card\"><p class=\"msg msg--bad\">We could not load your seats just now. ' +\n           \"Refresh, or try again in a minute.</p>\" +\n           '<button class=\"btn btn--ghost\" id=\"out-error\" type=\"button\" style=\"margin-top:1.1rem\">Sign out</button></div>');\n      document.getElementById(\"out-error\").addEventListener(\"click\", signOut);\n    });\n}\n\nstart();";

/* ────────────────────────── admin.html ────────────────────────── */

/* No section padding, no page head, no centred column. The heading and the
   "signed in as" line moved into the shell — the band says which section you
   are in and the sidebar says who you are, so a third copy above both was the
   thing making it look like a page with an application pasted into it. */
const ADMIN_BODY = [
  '  <div class="adm__page">',
  '    <p id="pt-lead" hidden></p>',
  '    <div id="pt-root"></div>',
  "  </div>"
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

/* The shell took the page furniture away, and the two views that are not the
   desk went with it: signed out and refused were left as bare text in the top
   corner of a white screen, with no mark, no card and nothing centred. An
   application still has to look like something before you are through the door.

   So both are wrapped in a gate: the brand, then a card, centred in the window.
   It is only a frame — the words and the buttons inside are unchanged. */
function gate(inner) {
  return '<div class="adm__gate"><div class="adm__gatebox">' +
    '<span class="adm__gatebrand">SecureJob<b>VA</b><small>Admin portal</small></span>' +
    '<div class="card">' + inner + "</div>" +
  "</div></div>";
}

function signedOut(msg) {
  view(
    gate(
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      /* Signing in and having access are two different things, and the page
         used to offer the button with nothing said. Anybody with a Google
         account can prove who they are — that is all sign-in does — and then
         every policy in the database refuses to hand them a single row. Saying
         so up front means the refusal that follows reads as the design rather
         than as something going wrong. */
      '<p class="msg" style="margin-top:0"><b>This is the staff desk.</b> Signing in proves who you are; ' +
        'it does not give you access. An administrator grants that separately. ' +
        'If you applied for a job, your own page is <a href="/status">Your application</a>.</p>' +
      '<button class="gbtn" id="go" type="button">Sign in with Google</button>'
    )
  );
  document.getElementById("go").addEventListener("click", signIn);
}

/* Being refused here is the normal case for anyone who is not staff, so it
   reads as a closed door rather than a failure. The refusal is Postgres's:
   the query returned nothing because no policy let it through. */
function notAdmin(email) {
  /* Signed out on the spot rather than left holding a session for a desk they
     cannot open. signOut() itself is no use here: it reloads, which lands back
     on the sign-in card with the warning gone and nothing explaining why. So
     this does what signOut does — drop the local session, revoke the token
     best-effort — and then renders the reason instead of reloading. */
  var s = loadSession();
  clearSession();
  if (s && s.access_token) {
    fetch(SB + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: ANON, Authorization: "Bearer " + s.access_token }
    })["catch"](function () {});
  }

  view(
    gate(
      '<div class="note note--warn"><b>No access. You have been signed out.</b> ' +
      esc(email) + " is not on the staff list, so this desk stays shut. Nothing here was " +
      "shown to you &mdash; the database refuses every row to an account without a role, " +
      "which is why the page is empty rather than locked. Access is granted by an " +
      "administrator, not by signing in.</div>" +
      '<p class="msg">Applied for a job? Your own page is <a href="/status">Your application</a> ' +
      "&mdash; you will be asked to sign in again there.</p>"
    )
  );
}

function options(cur) {
  var keys = ["applied", "assessment", "interview", "approved", "hired", "declined"];
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

/* The log, newest first. Three, because the answer to "what is going on with
   this person" is almost always in the last few lines, and a row that unrolls
   eleven notes buries the next applicant. The rest are one click away and the
   button says how many, so nobody has to guess whether there is more. */
function noteEntry(n) {
  return '<div class="note__e">' +
    '<span class="note__m">' + esc(n.author || "unknown") +
      " &middot; " + esc(whenStamp(n.created_at)) + "</span>" +
    '<span class="note__t">' + esc(n.note) + "</span>" +
  "</div>";
}

function noteBox(a) {
  var all = a.notes || [];
  var first = all.slice(0, 3);
  var rest = all.slice(3);

  return (
    '<div class="notes">' +
      (all.length
        ? first.map(noteEntry).join("") +
          (rest.length
            ? '<details class="note__more"><summary>' + rest.length +
              " earlier note" + (rest.length === 1 ? "" : "s") + "</summary>" +
              rest.map(noteEntry).join("") + "</details>"
            : "")
        : '<p class="note__none">No notes yet.</p>') +
      '<div class="note__add">' +
        '<textarea data-note rows="1" aria-label="Add a note about ' +
          esc(a.name || "this applicant") + '" placeholder="Add a note\u2026"></textarea>' +
        '<button class="btn btn--ghost" data-note-add type="button" ' +
          'style="padding:.4rem .75rem;font-size:.84rem">Add</button>' +
      "</div>" +
    "</div>"
  );
}

function whenStamp(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
  });
}

var DISC_STYLE = {
  "D": {
    "name": "Driver",
    "fits": "Escalations, outbound sales, anything with a target on it"
  },
  "I": {
    "name": "Persuader",
    "fits": "Front-line customer service, lead follow-up, appointment setting"
  },
  "S": {
    "name": "Steady",
    "fits": "Inbox and calendar, long-running client accounts, support"
  },
  "C": {
    "name": "Checker",
    "fits": "Bookkeeping, data entry, invoicing, documents"
  }
};

/* What the questionnaire came back as.
 *
 * The letter alone tells nobody anything, so it is shown as a name and the
 * kind of seat it suits. The four bars are there because the shape matters
 * more than the winner: somebody at D 4 I 3 is a different person from
 * somebody at D 9 I -6, and both read as "Driver" if you only print the top
 * letter.
 *
 * Scores run -12 to 12, so the bar is offset from a centre line — a negative
 * is a real result (this is markedly not you), not a missing one.
 */
function discLine(a) {
  var d = a.disc;
  if (!d) {
    return '<div class="disc__r disc__r--none">Working style &mdash; not taken. ' +
      "Applications sent before the questionnaire existed will say this.</div>";
  }
  var style = DISC_STYLE[d.primary_style] || { name: d.primary_style, fits: "" };
  var second = DISC_STYLE[d.secondary_style];

  var bars = ["d", "i", "s", "c"].map(function (k) {
    var v = Number(d[k]) || 0;
    var pct = Math.min(50, Math.abs(v) / 12 * 50);
    return '<div class="disc__b">' +
      '<span class="disc__bk">' + k.toUpperCase() + "</span>" +
      '<span class="disc__bt"><i style="' +
        (v >= 0 ? "left:50%;width:" : "right:50%;width:") + pct.toFixed(1) + '%"></i></span>' +
      '<span class="disc__bv">' + (v > 0 ? "+" : "") + v + "</span>" +
    "</div>";
  }).join("");

  return (
    '<div class="disc__r">' +
      '<span class="disc__rk">Working style</span>' +
      '<span class="disc__rn">' + esc(style.name) +
        (second ? ' <span class="disc__r2">then ' + esc(second.name) + "</span>" : "") + "</span>" +
      (style.fits ? '<span class="disc__rf">' + esc(style.fits) + "</span>" : "") +
      '<div class="disc__bs">' + bars + "</div>" +
    "</div>"
  );
}

function rowHtml(a) {
  var tracks = (a.tracks && a.tracks.length ? a.tracks.join(" + ") : a.track) || "—";

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
            '<label class="cal__set">Interview' +
              '<input type="datetime-local" data-interview value="' +
                esc(localDateTime(a.interview_at)) + '" aria-label="Interview date and time">' +
            "</label>" +
            '<label class="chk"><input type="checkbox" data-replied' +
              (a.response_received ? " checked" : "") + "> replied</label>" +
            '<button class="btn btn--ghost" data-contacted type="button" ' +
              'style="padding:.45rem .8rem;font-size:.85rem">Mark contacted</button>'
          : "") +
        (can("applications.note")
          ? noteBox(a)
          : "") +
        '<span class="row__ok" data-ok></span>' +
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
      discLine(a) +
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

  var tiles = "";
  var unusedTiles =
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
    '<h2 class="edit__h">Breakdown</h2>' +
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
  drawCalendar();
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

/* A datetime-local input speaks local wall-clock with no zone. The database
   stores an instant. These two convert between them explicitly rather than
   letting toISOString() quietly shift a 9am booking by the offset. */
function localDateTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
function fromLocalDateTime(v) {
  if (!v) return null;
  var d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
function whenTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit"
  });
}

/* ── Interviews ──
   Not a month grid. A month grid is mostly empty squares and answers "what
   does August look like", which nobody asks. What gets asked is: who is next,
   and is anything wrong. So it is a list, grouped by day, with the problems
   raised to the top rather than left to be noticed. */
function drawCalendar() {
  var box = document.getElementById("cal-card");
  if (!box) return;

  var booked = ALL.filter(function (a) { return a.interview_at; });
  var now = Date.now();

  var past = booked.filter(function (a) { return new Date(a.interview_at) < now; });
  var upcoming = booked.filter(function (a) { return new Date(a.interview_at) >= now; })
    .sort(function (x, y) { return new Date(x.interview_at) - new Date(y.interview_at); });

  /* Three things that are worth interrupting for. */
  var unresolved = past.filter(function (a) {
    return a.interview_unresolved || (a.pipeline === "interviewed" && !a.score_avg);
  });
  var atInterviewNoDate = ALL.filter(function (a) {
    return a.pipeline === "interviewed" && !a.interview_at;
  });
  /* Two bookings inside the same hour is nearly always a mistake, and the one
     nobody catches until the second person is waiting. */
  var clashes = [];
  for (var i = 1; i < upcoming.length; i++) {
    var gap = new Date(upcoming[i].interview_at) - new Date(upcoming[i - 1].interview_at);
    if (gap < 3600000) clashes.push([upcoming[i - 1], upcoming[i]]);
  }

  var badge = document.getElementById("tab-cal");
  var problems = unresolved.length + clashes.length + atInterviewNoDate.length;
  if (badge) badge.textContent = problems ? String(problems) : "";

  var issues = "";
  if (problems) {
    issues =
      '<div class="cal__issues">' +
        '<h3 class="cal__ih">Needs attention</h3>' +
        (unresolved.length
          ? '<p class="cal__i"><b>' + unresolved.length + " interviewed, not scored.</b> " +
            "The interview has been and gone and nobody wrote down how it went: " +
            unresolved.slice(0, 6).map(function (a) { return esc(a.name || a.email); }).join(", ") +
            (unresolved.length > 6 ? " and " + (unresolved.length - 6) + " more" : "") + "</p>"
          : "") +
        (atInterviewNoDate.length
          ? '<p class="cal__i"><b>' + atInterviewNoDate.length + " at interview with no date set.</b> " +
            "Nothing will remind you about these: " +
            atInterviewNoDate.slice(0, 6).map(function (a) { return esc(a.name || a.email); }).join(", ") +
            (atInterviewNoDate.length > 6 ? " and " + (atInterviewNoDate.length - 6) + " more" : "") + "</p>"
          : "") +
        (clashes.length
          ? '<p class="cal__i"><b>' + clashes.length + " booked within an hour of each other.</b> " +
            clashes.slice(0, 4).map(function (p) {
              return esc(p[0].name || p[0].email) + " and " + esc(p[1].name || p[1].email);
            }).join("; ") + "</p>"
          : "") +
      "</div>";
  }

  if (!booked.length && !atInterviewNoDate.length) {
    box.innerHTML = '<h2 class="edit__h">Interviews</h2>' +
      '<p class="msg">Nothing booked. Set a date on any row in the Applications tab and it appears here.</p>';
    return;
  }

  /* Grouped by day, because that is how somebody reads a schedule. */
  var days = {};
  upcoming.forEach(function (a) {
    var d = new Date(a.interview_at);
    var key = d.toDateString();
    (days[key] = days[key] || []).push(a);
  });

  var list = Object.keys(days).map(function (key) {
    var d = new Date(key);
    var today = d.toDateString() === new Date().toDateString();
    return (
      '<div class="cal__day">' +
        '<h4 class="cal__dh">' + esc(d.toLocaleDateString(undefined, {
          weekday: "long", day: "numeric", month: "long"
        })) + (today ? ' <span class="cal__today">today</span>' : "") + "</h4>" +
        days[key].map(function (a) {
          return '<div class="cal__row">' +
            '<span class="cal__t">' + esc(new Date(a.interview_at).toLocaleTimeString(undefined, {
              hour: "numeric", minute: "2-digit"
            })) + "</span>" +
            '<span class="cal__n">' + esc(a.name || a.email) + "</span>" +
            '<span class="cal__w">' + esc((a.tracks || []).join(" + ")) +
              (a.interviewer ? " &middot; " + esc(a.interviewer) : "") + "</span>" +
          "</div>";
        }).join("") +
      "</div>"
    );
  }).join("");

  box.innerHTML =
    '<h2 class="edit__h">Interviews</h2>' +
    issues +
    (upcoming.length
      ? '<p class="msg" style="margin-top:1rem">' + upcoming.length + " coming up.</p>" + list
      : '<p class="msg" style="margin-top:1rem">Nothing upcoming.</p>');
}

/* One <svg> each, written once. Inline rather than a sprite because the page is
   a single file by design and a sprite would be a second request for eight
   shapes. */
var ICON = (function () {
  var s = function (d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>";
  };
  return {
    apps:    s('<path d="M4 6h16M4 12h16M4 18h10"></path>'),
    cal:     s('<rect x="3.5" y="5" width="17" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M3.5 10h17"></path>'),
    inbox:   s('<path d="M4 5.5h16v13H8l-4 3z"></path>'),
    seats:   s('<path d="M4 20V9l8-5 8 5v11"></path><path d="M9.5 20v-6h5v6"></path>'),
    clients: s('<circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c4 4.5 4 12.5 0 17M12 3.5c-4 4.5-4 12.5 0 17"></path>'),
    team:    s('<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"></path><path d="M17 6.5a3.5 3.5 0 010 7"></path>'),
    accts:   s('<path d="M12 3.5l7 3.2v5.6c0 4.2-2.8 7.2-7 8.2-4.2-1-7-4-7-8.2V6.7z"></path>')
  };
})();

/* A count on a rail item, or nothing at all when there is nothing to say. A
   badge showing 0 is noise pretending to be information. */
function badge(id, n) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = n ? String(n) : "";
  el.classList.toggle("is-warn", id === "tab-unread" || id === "tab-leave" ? !!n : false);
}

/* The summary. It answers "what needs me" before anything is read, which the
   page could not do at all: it opened on every application ever received with
   nothing marking the one that has been waiting a week.

   Three days is not an arbitrary threshold — careers.html promises an answer
   either way "usually within three working days", so a row past it is a
   promise going stale. */
function drawKpis() {
  var box = document.getElementById("kpis");
  if (!box) return;
  var live = ALL.filter(function (a) { return a.status !== "declined" && a.status !== "hired"; });
  var cut = Date.now() - 3 * 24 * 60 * 60 * 1000;
  var late = live.filter(function (a) { return new Date(a.created_at).getTime() < cut; });
  var hired = ALL.filter(function (a) { return a.status === "hired"; });

  var tile = function (n, label, kind) {
    return '<div class="kpi' + (kind && n ? " kpi--" + kind : "") + '">' +
      "<b>" + n + "</b><span>" + label + "</span></div>";
  };
  /* "Applied this week" came off the At a glance card, which used to print its
     own four numbers directly under these. Two rows of tiles saying 2 and 0 at
     each other is worse than either alone, so that card keeps the three
     breakdowns nobody else shows and gives up the counting. */
  var weekCut = Date.now() - 7 * 24 * 60 * 60 * 1000;
  var week = ALL.filter(function (a) { return new Date(a.created_at).getTime() >= weekCut; });

  box.innerHTML =
    tile(late.length, "waiting over 3 days", "warn") +
    tile(live.length, "in the queue") +
    tile(week.length, "applied this week") +
    tile(hired.length, "hired", "good") +
    tile(UNREAD, "unanswered messages", "warn");

  badge("tab-apps", ALL.length);
  var n = document.getElementById("top-n");
  if (n) n.textContent = String(live.length);
}

var UNREAD = 0;

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
    var top = document.querySelector(".adm__top h2");
    var k = document.querySelector(".adm__top .k");
    if (top) top.textContent = b.textContent.replace(/d+$/, "").trim();
    if (k) {
      var grp = b.previousElementSibling;
      while (grp && !grp.classList.contains("rail__k")) grp = grp.previousElementSibling;
      k.textContent = grp ? grp.textContent : "";
    }
    root.querySelectorAll("[data-pane]").forEach(function (p) {
      if (p.getAttribute("data-pane") === want) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
  });
}

/* ── leave requests ──
   The other half of /hub. An assistant asks; somebody here answers. Until this
   existed the schema allowed the answer and there was nowhere to give it, so it
   had to be done in the Supabase table editor — which means it did not get
   done, and somebody waited on an answer nobody could see they were owed. */
function loadLeave() {
  var box = document.getElementById("leave-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading leave requests&hellip;';
  api("leave_requests?select=id,application_id,starts_on,ends_on,reason,status,created_at,decided_at,decided_by&order=starts_on.desc")
    .then(function (rows) { drawLeave(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load leave: ' + esc(why(e)) + "</p>";
    });
}

function drawLeave(box, rows) {
  /* The request carries an application_id and nothing else about the person,
     because the name lives on the application and copying it here would be two
     places to be wrong. ALL is already loaded. */
  var byId = {};
  ALL.forEach(function (a) { byId[a.id] = a; });

  var waiting = rows.filter(function (r) { return r.status === "pending"; });
  var badge = document.getElementById("tab-leave");
  if (badge) badge.textContent = waiting.length ? String(waiting.length) : "";

  box.innerHTML =
    "<h2>Leave requests</h2>" +
    (rows.length
      ? '<p class="msg" style="margin-top:0">' +
          (waiting.length ? waiting.length + " waiting on you." : "Nothing waiting.") + "</p>" +
        '<div class="rows">' + rows.map(function (r) {
          var a = byId[r.application_id];
          return '<div class="row" data-leave="' + esc(r.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(a ? a.name : "Unknown assistant") + "</span>" +
              '<span class="row__meta"> &middot; ' + esc(when(r.starts_on)) + " to " + esc(when(r.ends_on)) + "</span>" +
            "</span>" +
            '<span class="pill pill--' + esc(r.status) + '">' + esc(r.status) + "</span></div>" +
            (r.reason ? '<p class="msg" style="margin:.3rem 0 0">' + esc(r.reason) + "</p>" : "") +
            (r.status === "pending"
              ? '<div class="row__ctl">' +
                  '<button class="btn btn--solid" data-leave-yes type="button" style="padding:.45rem .8rem;font-size:.85rem">Approve</button>' +
                  '<button class="btn btn--ghost" data-leave-no type="button" style="padding:.45rem .8rem;font-size:.85rem">Decline</button>' +
                  '<span class="row__ok" data-leave-ok></span>' +
                "</div>"
              : '<p class="msg" style="margin:.3rem 0 0">' + esc(r.status) + " by " +
                esc(r.decided_by || "somebody") + " on " + esc(when(r.decided_at)) + "</p>") +
          "</div>";
        }).join("") + "</div>"
      : '<p class="msg">Nobody has asked for leave yet.</p>');

  box.querySelectorAll("[data-leave-yes], [data-leave-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-leave]");
      var ok = row.querySelector("[data-leave-ok]");
      var yes = b.hasAttribute("data-leave-yes");
      flash(ok, "Saving…");
      api("leave_requests?id=eq." + encodeURIComponent(row.getAttribute("data-leave")), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          status: yes ? "approved" : "declined",
          decided_at: new Date().toISOString(),
          decided_by: ME
        }
      }).then(loadLeave)
        .catch(function (e) { flash(ok, why(e), true); });
    });
  });
}

/* ── the notice board ──
   Staff write, the hired read. A notice with no published_at is a draft and is
   invisible to everybody but staff, so something half-written does not appear
   on somebody's home page while it is being thought about. */
function loadNotices() {
  var box = document.getElementById("notice-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading the notice board&hellip;';
  api("notices?select=id,title,body,pinned,published_at,created_at,created_by&order=pinned.desc,created_at.desc")
    .then(function (rows) { drawNotices(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load notices: ' + esc(why(e)) + "</p>";
    });
}

function drawNotices(box, rows) {
  box.innerHTML =
    "<h2>Notice board</h2>" +
    '<p class="msg" style="margin-top:0">Everybody who has been hired sees these on their portal. A draft stays here until you publish it.</p>' +
    '<div class="fld"><label for="nt-title">Title</label><input id="nt-title" type="text"></div>' +
    '<div class="fld"><label for="nt-body">What it says</label><textarea id="nt-body" rows="4"></textarea></div>' +
    '<p class="err" id="nt-err" aria-live="polite"></p>' +
    '<div class="edit__foot">' +
      '<label class="chk"><input type="checkbox" id="nt-pin"> Pin it to the top</label>' +
      '<span class="edit__act">' +
        '<span class="row__ok" id="nt-ok"></span>' +
        '<button class="btn btn--ghost" id="nt-draft" type="button">Save as draft</button>' +
        '<button class="btn btn--solid" id="nt-pub" type="button">Publish</button>' +
      "</span>" +
    "</div>" +
    (rows.length
      ? '<div class="rows" style="margin-top:1.2rem">' + rows.map(function (n) {
          return '<div class="row" data-notice="' + esc(n.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(n.title) + "</span>" +
              '<span class="row__meta"> &middot; ' +
                (n.published_at ? "published " + esc(when(n.published_at)) : "draft") + "</span>" +
            "</span>" +
            '<span class="pill pill--' + (n.published_at ? "approved" : "applied") + '">' +
              (n.published_at ? "Live" : "Draft") + "</span></div>" +
            '<p class="msg" style="margin:.3rem 0 0">' + esc(n.body) + "</p>" +
            '<div class="row__ctl">' +
              '<button class="btn btn--ghost" data-nt-toggle type="button" style="padding:.45rem .8rem;font-size:.85rem">' +
                (n.published_at ? "Take it down" : "Publish it") + "</button>" +
              '<button class="btn btn--ghost" data-nt-pin type="button" style="padding:.45rem .8rem;font-size:.85rem">' +
                (n.pinned ? "Unpin" : "Pin") + "</button>" +
              '<span class="row__ok" data-nt-ok></span>' +
            "</div>" +
          "</div>";
        }).join("") + "</div>"
      : "");

  var write = function (published) {
    var t = document.getElementById("nt-title");
    var b = document.getElementById("nt-body");
    var err = document.getElementById("nt-err");
    var ok = document.getElementById("nt-ok");
    err.textContent = "";
    if (!t.value.trim()) { err.textContent = "Give it a title — that is what people see first."; t.focus(); return; }
    if (!b.value.trim()) { err.textContent = "A notice with no words in it is not a notice."; b.focus(); return; }
    flash(ok, "Saving…");
    api("notices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        title: t.value.trim(),
        body: b.value.trim(),
        pinned: document.getElementById("nt-pin").checked,
        published_at: published ? new Date().toISOString() : null,
        created_by: ME
      }
    }).then(loadNotices)
      .catch(function (e) { flash(ok, why(e), true); });
  };
  document.getElementById("nt-pub").addEventListener("click", function () { write(true); });
  document.getElementById("nt-draft").addEventListener("click", function () { write(false); });

  box.querySelectorAll("[data-nt-toggle], [data-nt-pin]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-notice]");
      var id = row.getAttribute("data-notice");
      var rec = rows.filter(function (x) { return x.id === id; })[0];
      var ok = row.querySelector("[data-nt-ok]");
      var body = b.hasAttribute("data-nt-pin")
        ? { pinned: !rec.pinned }
        : { published_at: rec.published_at ? null : new Date().toISOString() };
      flash(ok, "Saving…");
      api("notices?id=eq." + encodeURIComponent(id), {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: body
      }).then(loadNotices)
        .catch(function (e) { flash(ok, why(e), true); });
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
  badge("tab-seats", rows.filter(function (r) { return r.status !== "closed"; }).length);
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
                  '<span class="row__ok" data-seat-ok></span>' +
                "</div>"
              : "") +
          "</div>"
        );
      }).join("") +
    "</div>";

  /* Writes on change, like the applications table. A dropdown has no
     half-chosen state, so there is nothing a Save button was waiting for —
     it only created a way to make a change and lose it by navigating away. */
  box.querySelectorAll("[data-seat-status]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var row = sel.closest("[data-seat]");
      var id = row.getAttribute("data-seat");
      var st = sel.value;
      var ok = row.querySelector("[data-seat-ok]");
      flash(ok, "Saving…");
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
        flash(ok, why(e), true);
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
  if (badge) badge.classList.toggle("is-warn", !!open.length);
  /* The summary tile needs this number and the inbox is the only thing that
     knows it. It loads on its own schedule, so the tiles are redrawn when it
     arrives rather than being left showing a stale zero. */
  UNREAD = open.length;
  drawKpis();

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
          flash(row.querySelector("[data-msg-ok]"), why(e), true);
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

/* Nothing here sends an author. 020 stamps it from the verified token and
   overwrites whatever arrived, for the same reason scored_by is not sent: on a
   log, who wrote it is the part that has to be true. */
function addNote(row) {
  var box = row.querySelector("[data-note]");
  var ok = row.querySelector("[data-ok]");
  var id = row.getAttribute("data-id");
  var text = (box.value || "").trim();
  if (!text) return;

  box.disabled = true;
  flash(ok, "Saving\u2026");
  api("application_note_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { application_id: id, note: text }
  }).then(function () {
    box.value = "";
    /* Refetched rather than guessed at locally: the row needs the author and
       the timestamp the database chose, not the ones this page would invent. */
    return api("application_note_log?select=id,application_id,note,author,created_at&application_id=eq." +
      encodeURIComponent(id) + "&order=created_at.desc");
  }).then(function (rows) {
    var rec = ALL.filter(function (x) { return x.id === id; })[0];
    if (rec) {
      rec.notes = rows || [];
      var tmp = document.createElement("div");
      tmp.innerHTML = rowHtml(rec);
      var next = tmp.firstChild;
      row.replaceWith(next);
      /* Same as in save(): the row holding ok has just been replaced, so the
         confirmation has to be aimed at the row that is now on the page. */
      ok = next.querySelector("[data-ok]") || ok;
    }
    flash(ok, "Added");
  }).catch(function (e) {
    box.disabled = false;
    flash(ok, why(e), true);
  });
}

function paint() {
  drawKpis();
  var shown = shownRows();
  document.getElementById("count").textContent =
    shown.length + " of " + ALL.length;
  document.getElementById("rows").innerHTML =
    shown.length ? shown.map(rowHtml).join("") : '<p class="msg">Nothing matches that.</p>';
}

function save(row) {
  var id  = row.getAttribute("data-id");
  var stEl = row.querySelector("[data-status]");

  var ppEl = row.querySelector("[data-pipe]");
  var rpEl = row.querySelector("[data-replied]");
  var st   = stEl ? stEl.value : null;

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

  /* Not gated on the pipeline control existing. It used to be, and the scores
     and the interview date were written inside that gate — so they saved only
     because the pipeline select happens to be drawn beside them. Rename or
     remove that one control and two others stop saving with no error anywhere.
     Whether anything is sent is decided by the changed flag alone. */
  {
    var t = { application_id: id, updated_at: new Date().toISOString() };
    var changed = false;
    if (pipe !== null && (!rec || rec.pipeline !== pipe)) { t.pipeline = pipe; changed = true; }

    /* scored_by and scored_at are deliberately not sent. The database stamps
       them, and only when a score actually moves, so re-saving a note does
       not rewrite who did the assessing. */
    var ivEl = row.querySelector("[data-interview]");
    if (ivEl) {
      var iv = fromLocalDateTime(ivEl.value);
      var wasIv = rec ? (rec.interview_at || null) : undefined;
      /* Compared as instants, not strings: the input gives local time and the
         stored value is UTC, so the same moment is two different strings. */
      var same = wasIv && iv && new Date(wasIv).getTime() === new Date(iv).getTime();
      if (wasIv === undefined || (!same && (wasIv || iv))) {
        t.interview_at = iv;
        changed = true;
      }
    }

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
        if ("interview_at" in t) rec.interview_at = t.interview_at;
        SKILLS.forEach(function (k) {
          var col = k[0].replace("skill_", "score_");
          if (col in t) rec[col] = t[col];
        });
      }));
    }
  }

  if (!jobs.length) return;
  flash(ok, "Saving\u2026");

  Promise.all(jobs).then(function () {
    if (rec) {
      if (st !== null) rec.status = st;

    }
    if (st !== null) {
      var pill = row.querySelector("[data-pill]");
      pill.className = "pill pill--" + st;
      pill.textContent = LABEL[st] || st;
    }
    row.removeAttribute("data-mark-contacted");
    if (rec) {
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
      var next = tmp.firstChild;
      row.replaceWith(next);
      /* ok was found inside the row we have just thrown away, so writing to it
         now writes to a node the page no longer contains. That is why "Mark
         contacted" looked like it did nothing: the write went through, the row
         redrew, and the one word confirming it went into a detached element.
         The redrawn row has its own, and that is the one a person can see. */
      ok = next.querySelector("[data-ok]") || ok;
    }
    flash(ok, "Saved");
    if ("interview_at" in t) drawCalendar();
  }).catch(function (e) {
    flash(ok, why(e), true);
  });
}

function flash(el, text, bad) {
  el.textContent = text;
  el.classList.toggle("is-bad", !!bad);
  el.classList.add("is-on");
  /* An error stays until the next attempt. A success fades, because nobody
     needs to be told twice that a dropdown worked. */
  clearTimeout(el._t);
  if (!bad) el._t = setTimeout(function () { el.classList.remove("is-on"); }, 1600);
}

/* PostgREST answers with JSON carrying message, details and hint. The hint is
   usually the actionable half — "GRANT SELECT ON ..." — so it is kept. */
function why(e) {
  var t = String((e && e.message) || e || "");
  if (t === "signed out") return "Signed out — reload and sign in again";
  try {
    var j = JSON.parse(t);
    return [j.message, j.hint].filter(Boolean).join(" — ").slice(0, 180) || t.slice(0, 180);
  } catch (x) {}
  return t.slice(0, 180) || "That did not save";
}

function render(email, apps, notes, socials, docs, disc) {
  var byId = {};
  /* Newest first, which is the order they arrive in and the order they are
     read: the last thing said about somebody is the thing you want. */
  (notes || []).forEach(function (n) {
    (byId[n.application_id] = byId[n.application_id] || []).push(n);
  });
  var socById = {};
  (socials || []).forEach(function (s) {
    (socById[s.application_id] = socById[s.application_id] || []).push(s);
  });
  var docById = {};
  (docs || []).forEach(function (d) {
    (docById[d.application_id] = docById[d.application_id] || []).push(d);
  });
  var discById = {};
  (disc || []).forEach(function (d) { discById[d.application_id] = d; });
  ALL = apps.map(function (a) {
    a.notes = byId[a.id] || [];
    a.socials = socById[a.id] || [];
    a.docs = docById[a.id] || [];
    a.disc = discById[a.id] || null;
    a.pipeline = a.pipeline || "new";
    return a;
  });

  lead.textContent = "Signed in as " + email + ".";
  view(
    /* The tab bar became a rail. Same buttons, same data-tab values, same
       container id — wireTabs() finds them exactly as before and nothing about
       switching panes changed. What is new is that each one can carry a count,
       so what is waiting says so without being opened: seven tabs where six are
       hidden is six things that cannot ask for attention. */
    '<div class="adm__wrap">' +
    '<nav class="rail" id="tabs" aria-label="Sections">' +
      /* The brand and the person, which the site header and the who-row used to
         carry between them. Both moved here rather than being dropped: an
         application keeps who you are in the corner of the furniture, not in a
         band across the top of the work. */
      '<a class="rail__brand" href="/">SecureJob<b>VA</b></a>' +
      '<span class="rail__title">Admin portal</span>' +
      '<span class="rail__me"><span class="who__av">' + esc(email.charAt(0).toUpperCase()) + "</span>" +
        "<span><b>Administrator</b>" + esc(email) + "</span></span>" +
      '<span class="rail__k">The queue</span>' +
      '<button class="rnav is-on" data-tab="apps" type="button">' + ICON.apps +
        'Applications<span class="rnav__n" id="tab-apps"></span></button>' +
      '<button class="rnav" data-tab="cal" type="button">' + ICON.cal +
        'Interviews<span class="rnav__n" id="tab-cal"></span></button>' +
      '<button class="rnav" data-tab="inbox" type="button">' + ICON.inbox +
        'Messages<span class="rnav__n" id="tab-unread"></span></button>' +
      '<span class="rail__k">The business</span>' +
      '<button class="rnav" data-tab="seats" type="button">' + ICON.seats +
        'Seats<span class="rnav__n" id="tab-seats"></span></button>' +
      '<button class="rnav" data-tab="clients" type="button">' + ICON.clients + "Clients</button>" +
      '<span class="rail__k">The team</span>' +
      '<button class="rnav" data-tab="team" type="button">' + ICON.team +
        'Team<span class="rnav__n" id="tab-leave"></span></button>' +
      (can("accounts.manage")
        ? '<button class="rnav" data-tab="accts" type="button">' + ICON.accts + "Accounts</button>"
        : "") +

      /* Everything the header and the footer used to offer, put back. Nothing
         became unreachable: Careers, Home, Privacy, Terms, Refunds, Contact and
         the applicant's own page are all still one click away, and the theme
         toggle keeps the id the theme script looks for. They are down here
         because they are somebody else's links — a visitor's — and a desk
         should not open with them across the top. */
      '<span class="rail__foot">' +
        '<span class="rail__k">Elsewhere</span>' +
        '<a class="rlink" href="/status">Your application</a>' +
        '<a class="rlink" href="/hub">Assistant portal</a>' +
        '<a class="rlink" href="/careers">Careers</a>' +
        '<a class="rlink" href="/">Home</a>' +
        '<span class="rail__tiny">' +
          '<a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; ' +
          '<a href="/refunds">Refunds</a> &middot; <a href="/contact">Contact</a>' +
        "</span>" +
        '<span class="rail__acts">' +
          '<button class="rbtn" id="themetog" type="button" aria-label="Switch theme">Theme</button>' +
          '<button class="rbtn" id="out" type="button">Sign out</button>' +
        "</span>" +
        '<span class="rail__tiny">&copy; 2026 Secure Job VA &middot; Houston, Texas</span>' +
      "</span>" +
    "</nav>" +
    '<div class="adm__main">' +
    /* The band an application has and a page does not: where you are, and the
       one number that decides whether you can close the tab. */
    '<div class="adm__top">' +
      '<span><span class="k">The queue</span><h2>Applications</h2></span>' +
      '<span class="adm__topn"><b id="top-n">&mdash;</b><span>waiting on you</span></span>' +
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
    '<div class="adm__canvas">' +
    '<div data-pane="apps">' +
    '<div class="kpis" id="kpis"></div>' +
    (can("analytics.view") ? '<div id="stats-card"></div>' : "") +
    '<div class="rows" id="rows"></div>' +
    "</div>" +
    '<div data-pane="seats" hidden><div class="card" id="seats-card"></div></div>' +
    '<div data-pane="inbox" hidden><div class="card" id="inbox-card"></div></div>' +
    '<div data-pane="clients" hidden><div class="card" id="clients-card"></div></div>' +
    '<div data-pane="cal" hidden><div class="card" id="cal-card"></div></div>' +
    '<div data-pane="team" hidden><div class="card" id="leave-card"></div>' +
      '<div class="card" id="notice-card"></div></div>' +
    (can("accounts.manage")
      ? '<div data-pane="accts" hidden><div class="card" id="roles-card"></div></div>'
      : "") +
    "</div></div></div>"
  );

  document.getElementById("out").addEventListener("click", signOut);
  wireTabs();
  if (can("analytics.view")) drawStats();
  if (can("accounts.manage")) loadRoles();
  loadSeats();
  loadLeave();
  loadNotices();
  loadInbox();
  loadClients();
  document.getElementById("q").addEventListener("input", paint);
  document.getElementById("filter").addEventListener("change", paint);
  document.getElementById("fskill").addEventListener("change", paint);
  document.getElementById("csv").addEventListener("click", exportCsv);
  document.getElementById("flevel").addEventListener("change", paint);
  /* Selects and checkboxes commit immediately. There is no half-chosen state
     in a dropdown, so there is nothing to wait for. */
  document.getElementById("rows").addEventListener("change", function (e) {
    var row = e.target.closest(".row");
    if (!row) return;
    if (e.target.matches("[data-status], [data-pipe], [data-replied], [data-score], [data-interview]")) {
      save(row);
    }
  });


  document.getElementById("rows").addEventListener("click", function (e) {
    var add = e.target.closest("[data-note-add]");
    if (add) { addNote(add.closest(".row")); return; }
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
          ? api("application_note_log?select=id,application_id,note,author,created_at&order=created_at.desc")
          : Promise.resolve([]),
        can("social.view")
          ? api("application_socials?select=application_id,platform,handle,url")
          : Promise.resolve([]),
        api("application_documents?select=application_id,path,filename,bytes&order=uploaded_at.desc")
          .catch(function () { return []; }),
        /* Caught rather than awaited-or-fail: until 021 is run this table does
           not exist, and an admin page that will not load because a
           questionnaire is missing is worse than one without the questionnaire. */
        api("application_disc_read?select=application_id,d,i,s,c,primary_style,secondary_style,primary_name")
          .catch(function () { return []; })
      ];
      return Promise.all(jobs).then(function (r) {
        render(claims.email, r[0] || [], r[1] || [], r[2] || [], r[3] || [], r[4] || []);
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
  app: true,
  title: "Admin portal — SecureJobVA",
  links: [
    '        <a href="/status">Your application</a>',
    '        <a href="/careers">Careers</a>'
  ].join(nl),
  body: ADMIN_BODY,
  script: ADMIN_SCRIPT
}));

console.log("admin.html written");

/* ────────────────────────── hub.html ──────────────────────────

   The portal for people who have been hired. Everything here is gated on one
   thing — status === "hired" — which is set by hand in /admin, because being
   placed with a client is a decision somebody makes rather than something the
   database can work out.

   Deliberately not in this first build: hours and timesheets, because the
   tracker does not exist yet and a page showing hours nobody is recording
   teaches people to distrust the portal in week one.
*/

const HUB_BODY = [
  '  <section class="pt">',
  '    <div class="wrap" style="max-width:60rem">',
  '      <div class="pt__head">',
  '        <span class="eyebrow">Your portal</span>',
  "        <h1>Everything you need, in one place.</h1>",
  '        <p id="hub-lead">Sign in with the address on your application.</p>',
  "      </div>",
  '      <div id="hub-root"></div>',
  "    </div>",
  "  </section>"
].join(nl);

const HUB_SCRIPT = `
var root = document.getElementById("hub-root");
var lead = document.getElementById("hub-lead");
var APP = null;
var ME = "";

function view(html) { root.innerHTML = html; }

/* How somebody would rather be paid. The choice is stored; nothing else is.
   No account number, no bank detail, no wallet credential ever reaches this
   database — those are set up on the provider's own site with a person. */
var PAY = [
  ["wise_bank",   "Wise, into your bank",        "Pesos into a Philippine bank account. Usually lands in under a minute."],
  ["wise_wallet", "Wise, into GCash or Maya",    "Pesos into your wallet by mobile number. Also GrabPay and ShopeePay."],
  ["payoneer",    "Payoneer",                    "If you already have an account and would rather keep using it."]
];

function signedOut(msg) {
  view(
    '<div class="card">' +
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      '<button class="gbtn" id="go" type="button">Continue with Google</button>' +
      '<p class="msg">Use the address on your application &mdash; that is how we find you.</p>' +
    "</div>"
  );
  document.getElementById("go").addEventListener("click", signIn);
}

function shut(title, body) {
  view(
    '<div class="card">' +
      '<div class="note"><b>' + esc(title) + "</b> " + body + "</div>" +
      '<p style="margin-top:1.2rem"><a class="btn btn--ghost" href="/status">See where your application is</a></p>' +
    "</div>"
  );
}

function tile(href, label, path) {
  return '<a class="tl" href="' + href + '">' +
    '<span class="tl__art"><svg viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg></span>" +
    '<span class="tl__l">' + esc(label) + "</span></a>";
}

function leaveRow(r) {
  return '<div class="lv">' +
    "<span><b>" + esc(when(r.starts_on)) + " to " + esc(when(r.ends_on)) + "</b>" +
      (r.reason ? '<span class="lv__w">' + esc(r.reason) + "</span>" : "") + "</span>" +
    '<span class="pill pill--' + esc(r.status) + '">' + esc(r.status) + "</span>" +
  "</div>";
}

function noticeRow(n) {
  return '<div class="nt">' +
    '<span class="nt__t">' + (n.pinned ? '<span class="nt__pin">Pinned</span> ' : "") + esc(n.title) + "</span>" +
    '<span class="nt__d">' + esc(when(n.published_at)) + "</span>" +
    '<p class="nt__b">' + esc(n.body) + "</p>" +
  "</div>";
}

function render(a, leaves, notices) {
  APP = a;
  var first = String(a.name || "").trim().split(/\\s+/)[0] || "there";
  lead.textContent = "Signed in as " + ME + ".";

  var pay = PAY.map(function (p) {
    return '<label class="pay' + (a.payout_method === p[0] ? " is-on" : "") + '">' +
      '<input type="radio" name="pay" value="' + p[0] + '"' +
        (a.payout_method === p[0] ? " checked" : "") + ">" +
      "<span><b>" + esc(p[1]) + "</b><span>" + esc(p[2]) + "</span></span></label>";
  }).join("");

  view(
    '<div class="who">' +
      '<div class="who__id"><span class="who__av">' + esc(first.charAt(0).toUpperCase()) + "</span>" +
      '<span class="who__t"><span class="who__n">' + esc(a.name || "Your account") + "</span>" +
      '<span class="who__e">' + esc(ME) + "</span></span></div>" +
      '<button class="btn btn--ghost" id="out" type="button" style="padding:.5rem .9rem;font-size:.88rem">Sign out</button>' +
    "</div>" +

    '<div class="hub__hi"><h2>Hello, ' + esc(first) + ".</h2>" +
      "<p>You are on the team. This is yours.</p></div>" +

    '<div class="tls">' +
      tile("/status", "Your profile", '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"></path>') +
      tile("#leave", "Ask for leave", '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M8 3v4M16 3v4M3.5 10h17"></path>') +
      tile("#pay", "Getting paid", '<rect x="3" y="6" width="18" height="12.5" rx="2"></rect><path d="M3 10.5h18M6.5 15h4"></path>') +
      /* Named rather than hidden. Somebody hired this week wonders where their
         hours go, and a tile saying we are building it answers that; an absence
         does not. It is not a link, because there is nothing behind it yet and
         a tile that goes nowhere is worse than one that says so. */
      '<span class="tl tl--soon"><span class="tl__art">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle>' +
        '<path d="M12 7v5.2l3.3 2"></path></svg></span>' +
        '<span class="tl__l">Hours and timesheet<small>Still working on it</small></span></span>' +
      tile("#notices", "Notice board", '<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"></path>') +
    "</div>" +

    '<div class="card" id="leave">' +
      "<h2>Ask for leave</h2>" +
      '<p class="msg" style="margin-top:0">Tell us the dates and we will come back to you. Nothing is booked until it says approved.</p>' +
      '<div class="edit__grid">' +
        '<div class="fld"><label for="lv-from">First day off</label><input id="lv-from" type="date"></div>' +
        '<div class="fld"><label for="lv-to">Last day off</label><input id="lv-to" type="date"></div>' +
      "</div>" +
      '<div class="fld"><label for="lv-why">Why, briefly</label><textarea id="lv-why" rows="2"></textarea></div>' +
      '<p class="err" id="lv-err" aria-live="polite"></p>' +
      '<div class="edit__foot"><span></span><span class="edit__act">' +
        '<span class="row__ok" id="lv-ok"></span>' +
        '<button class="btn btn--solid" id="lv-go" type="button">Send the request</button>' +
      "</span></div>" +
      (leaves.length
        ? '<div class="lvs">' + leaves.map(leaveRow).join("") + "</div>"
        : '<p class="msg">You have not asked for any leave yet.</p>') +
    "</div>" +

    '<div class="card" id="pay">' +
      "<h2>Getting paid</h2>" +
      '<p class="msg" style="margin-top:0">We send through Wise, which reaches a Philippine bank account or a GCash, Maya, GrabPay or ShopeePay wallet. Tell us which you would rather, and we will set it up with you.</p>' +
      '<div class="pays">' + pay + "</div>" +
      '<p class="msg"><b>We never ask for your account details on this page.</b> Nothing about where your money goes is stored here &mdash; that is agreed with a person and set up on the provider\\'s own site.</p>' +
      '<span class="row__ok" id="pay-ok"></span>' +
    "</div>" +

    '<div class="card" id="notices">' +
      "<h2>Notice board</h2>" +
      (notices.length
        ? '<div class="nts">' + notices.map(noticeRow).join("") + "</div>"
        : '<p class="msg">Nothing on the board just now.</p>') +
    "</div>" +

    '<div class="card">' +
      "<h2>Support</h2>" +
      '<div class="edit__grid">' +
        '<p class="msg"><b>Something broken</b><br>Your laptop, your connection, anything technical. ' +
          '<a href="/contact?about=tech">Tell us</a> and a person answers.</p>' +
        '<p class="msg"><b>Your work or your pay</b><br>Hours, a client that is not working out, anything about money. ' +
          '<a href="/contact?about=work">Tell us</a>.</p>' +
      "</div>" +
    "</div>"
  );

  document.getElementById("out").addEventListener("click", signOut);
  wireLeave();
  wirePay();
}

function wireLeave() {
  var go = document.getElementById("lv-go");
  go.addEventListener("click", function () {
    var from = document.getElementById("lv-from");
    var to = document.getElementById("lv-to");
    var reason = document.getElementById("lv-why");
    var err = document.getElementById("lv-err");
    var ok = document.getElementById("lv-ok");

    /* Said here as well as in the constraint. The database refuses a backwards
       range either way; being told which end is wrong is the difference between
       fixing it and guessing. */
    err.textContent = "";
    if (!from.value) { err.textContent = "Which day do you want off first?"; from.focus(); return; }
    if (!to.value) { err.textContent = "And the last day?"; to.focus(); return; }
    if (to.value < from.value) { err.textContent = "The last day is before the first one."; to.focus(); return; }

    go.disabled = true;
    flash(ok, "Sending\\u2026");
    api("leave_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        application_id: APP.id,
        starts_on: from.value,
        ends_on: to.value,
        reason: reason.value.trim() || null
      }
    }).then(function () {
      return load();
    }).catch(function (e) {
      go.disabled = false;
      flash(ok, why(e), true);
    });
  });
}

function wirePay() {
  var ok = document.getElementById("pay-ok");
  Array.prototype.forEach.call(document.querySelectorAll("[name=pay]"), function (r) {
    r.addEventListener("change", function () {
      flash(ok, "Saving\\u2026");
      api("applications?id=eq." + encodeURIComponent(APP.id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { payout_method: r.value }
      }).then(function () {
        APP.payout_method = r.value;
        Array.prototype.forEach.call(document.querySelectorAll(".pay"), function (l) {
          l.classList.toggle("is-on", l.contains(r) ? true : false);
        });
        flash(ok, "Saved");
      }).catch(function (e) { flash(ok, why(e), true); });
    });
  });
}

function flash(el, text, bad) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-bad", !!bad);
  el.classList.add("is-on");
}

function why(e) {
  var m = String(e && e.message ? e.message : e);
  if (m === "signed out") return "Signed out";
  return "Did not save";
}

function load() {
  return api("applications?select=id,name,email,status,payout_method&order=created_at.desc")
    .then(function (rows) {
      var a = (rows || [])[0];
      if (!a) {
        shut("Nothing here under this address.",
          "We cannot find an application for " + esc(ME) + ". If you applied with a different address, sign out and use that one.");
        return;
      }
      if (a.status !== "hired") {
        shut("This opens when you are hired.",
          "Your application is at <b>" + esc(a.status) + "</b>. The portal appears here the day you are placed &mdash; nothing to do in the meantime.");
        return;
      }
      /* Both are fenced by policy: the leave rows are matched to applications
         this person owns, and a notice is only visible once it is published.
         Neither filter is written here, because a filter written in a page is
         a filter somebody can change. */
      return Promise.all([
        api("leave_requests?select=id,starts_on,ends_on,reason,status&order=starts_on.desc"),
        api("notices?select=id,title,body,pinned,published_at&order=pinned.desc,published_at.desc")
      ]).then(function (r) {
        render(a, r[0] || [], r[1] || []);
      });
    });
}

function start() {
  captureRedirect();
  if (CAME_FROM_RESET) { passwordForm(""); return; }
  var err = authError();
  if (!session()) { signedOut(err); return; }

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) {
    clearSession();
    signedOut("That sign-in did not carry an email address.");
    return;
  }
  ME = claims.email;

  view('<div class="card"><span class="spin"></span>Opening your portal&hellip;</div>');
  load().catch(function (e) {
    if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
    view('<div class="card"><p class="msg msg--bad">We could not open your portal just now. ' +
         "Refresh, or try again in a minute.</p></div>");
  });
}

start();
`.trim();

writeFileSync("hub.html", shell({
  title: "Your portal — SecureJobVA",
  links: [
    '        <a href="/status">Your application</a>',
    '        <a href="/careers">Careers</a>'
  ].join(nl),
  body: HUB_BODY,
  script: HUB_SCRIPT
}));

console.log("hub.html written");

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
