/* Composes status.html and admin.html from the chrome the other two pages
   already use, so the portal cannot drift away from the site around it. */
import { readFileSync, writeFileSync } from "node:fs";

import { SCENARIOS, BANKS, TRACK_AXES, TYPING_TARGET_WPM, TYPING_MIN_ACCURACY } from "./assessment-items.mjs";

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
/* The assessment. Reuses the stage ladder's shape on purpose — she has just
   read one list of numbered rungs above it, and a second list that looked
   different would read as a different kind of thing. */
.apts{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}
.apt{display:grid;grid-template-columns:auto 1fr auto;gap:.9rem;align-items:center;
  border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem;background:var(--paper)}
.apt.is-done{background:var(--accent-soft);border-color:var(--accent)}
.apt__n{width:1.7rem;height:1.7rem;border-radius:50%;display:grid;place-items:center;
  font-size:.85rem;font-weight:700;background:var(--accent-soft);color:var(--accent)}
.apt.is-done .apt__n{background:var(--accent);color:var(--accent-ink)}
.apt__t{font-weight:700;display:block}
.apt__d{display:block;font-size:.88rem;color:var(--ink-2);margin-top:.15rem}
.apt__s{font-size:.85rem;color:var(--accent);font-weight:700;white-space:nowrap}
.apt__go{padding:.45rem .9rem;font-size:.88rem}
.a-lbl{display:block;font-weight:700;font-size:.9rem;margin:1rem 0 .35rem}
.a-src{margin:0;padding:1rem 1.1rem;border-left:3px solid var(--accent);background:var(--accent-soft);
  border-radius:0 8px 8px 0;font-size:1rem;line-height:1.7}
.a-qs{margin:1rem 0 0;padding:0 0 0 1.2rem;display:grid;gap:1.4rem}
.a-q__p{font-weight:700;margin:0 0 .6rem}
.a-opts{display:grid;gap:.4rem}
/* The whole row is the target, not the 13px circle. Most people sitting this
   are on a phone. */
.a-opt{display:grid;grid-template-columns:auto 1fr;gap:.6rem;align-items:start;
  border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem;cursor:pointer;line-height:1.5}
.a-opt:hover{border-color:var(--accent)}
.a-opt:focus-within{outline:2px solid var(--accent);outline-offset:2px}
.a-opt input{margin-top:.25rem}
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

/* 060. Every button in /admin was the same blue, which is fine while nothing
   there is destructive and wrong the moment something is: a delete that looks
   like Save is a delete somebody presses on the way to Save. These are the
   only red controls in the product and they are meant to stop the eye. */
.btn--stop{background:#A11B2B;color:#fff;border-color:#A11B2B}
.btn--stop:hover{background:#8A1624;border-color:#8A1624}
.btn--stop[disabled]{opacity:.4;cursor:not-allowed}
.lnk--stop{color:#A11B2B}
.forget{margin-top:1rem;padding-top:.95rem;border-top:1px dashed var(--line);width:100%}
.danger{border:1px solid #F2C6CC;background:#FDECEE;border-radius:10px;padding:1rem 1.1rem}
.danger__t{font-weight:700;font-size:.97rem;margin:0;color:var(--ink)}
.danger p{margin:.45rem 0 0;font-size:.9rem;color:var(--ink-2);line-height:1.55}
.goes{list-style:none;margin:.85rem 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.3rem .9rem}
.goes li{font-size:.87rem;color:var(--ink-2);display:flex;gap:.5rem;align-items:baseline}
.goes b{font-weight:600;font-size:.82rem;color:var(--ink);font-variant-numeric:tabular-nums;min-width:1.4rem;text-align:right;flex:none}
.goes .is-file{color:#A11B2B;font-weight:600}
.goes .is-file b{color:#A11B2B}
.type{margin-top:1rem;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.type input{flex:1;min-width:12rem;font-size:.88rem;padding:.5rem .65rem;border-radius:7px;border:1px solid #F2C6CC;background:var(--surface);color:var(--ink)}
:root[data-theme="dark"] .btn--stop{background:#8E1826;border-color:#8E1826;color:#FFECEE}
:root[data-theme="dark"] .lnk--stop{color:#FF9AA6}
:root[data-theme="dark"] .danger{background:#2A1116;border-color:#4E2028}
:root[data-theme="dark"] .goes .is-file,:root[data-theme="dark"] .goes .is-file b{color:#FF9AA6}
:root[data-theme="dark"] .type input{border-color:#4E2028}

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
/* 055. The weeks a payment can be ticked against. Deliberately quiet: it is
   the optional half of the form, and it sits under six required fields. */
.payw{margin-top:1.2rem;padding:1rem 1.1rem;background:var(--surface-2);border-radius:10px}
.payw__h{margin:0;font-weight:700;font-size:.92rem}
.payw__h em{font-style:normal;font-weight:400;color:var(--muted);font-size:.85rem}
.payw__d{margin:.3rem 0 0;font-size:.85rem;color:var(--muted);line-height:1.5}
.payw__list{margin-top:.8rem;display:grid;gap:.4rem;max-height:19rem;overflow-y:auto}
.payw__i{display:grid;grid-template-columns:auto 1fr;gap:.6rem;align-items:start;
  padding:.5rem .65rem;background:var(--surface);border:1px solid var(--line);border-radius:8px;cursor:pointer}
.payw__i.is-off{opacity:.55;cursor:default}
.payw__i input{margin-top:.15rem}
.payw__n{display:block;font-weight:600;font-size:.88rem}
.payw__m{display:block;color:var(--muted);font-size:.8rem;margin-top:.1rem}
/* 056. The time zone card, shared by /status, /hub and /seats. */
.tz{display:grid;gap:.5rem;margin-top:1.1rem}
@media(min-width:34rem){.tz{grid-template-columns:minmax(0,22rem) 1fr;align-items:end;gap:1rem}}
.tz__now{margin:0;font-size:.88rem;color:var(--muted);padding-bottom:.5rem}
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
/* class="hint" has been used on all four portals since 007 and never had a
   rule, so every one of them rendered at full body size — the same weight as
   the sentence it was meant to sit quietly underneath. Found by looking at a
   page rather than by reading it. */
.hint{font-size:.85rem;color:var(--muted);line-height:1.5}
.edit__act{display:inline-flex;align-items:center;gap:.7rem;flex:0 0 auto}
.adm__wrap{display:grid;grid-template-columns:1fr;gap:0;align-items:stretch;min-height:100vh}
@media(min-width:900px){
  .adm__wrap{grid-template-columns:16rem 1fr}
  /* Without this the rail is only as tall as its links and the column below it
     goes white, which reads as the page having run out rather than as a
     sidebar. */
  .rail{min-height:100vh}
}
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
/* The cards below the tiles used to be one narrow column down the middle of
   however wide a screen was, which on a large monitor is a thin ribbon in a
   field of nothing. Columns flow them side by side once there is room, and
   break-inside keeps a card whole rather than splitting it across the fold. */
/* Two real columns, not flowed ones. column-count split the timesheet in
   half — its Send button ended up at the top of the other column, away from
   the days it belonged to — because a tall card is exactly what column flow
   breaks. A grid cannot split anything. */
.hub__cols{display:grid;gap:1.1rem;grid-template-columns:1fr;align-items:start}
@media(min-width:64rem){.hub__cols{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr)}}
.hub__col{display:flex;flex-direction:column;gap:1.1rem;min-width:0}
.hub__body{padding:1.3rem clamp(1rem,2.5vw,1.9rem) 3rem}
.hub__hi{text-align:left;margin:0}
.hub__hi h2{font-size:1.35rem;margin:0;color:#fff}
.hub__hi p{color:#9DB3D0;font-size:.86rem}
.tls{display:grid;gap:.8rem;grid-template-columns:repeat(2,1fr);margin-bottom:1.6rem}
/* auto-fit rather than a fixed four. There are five tiles, and four columns
   left Notice board alone on a second row looking like an afterthought. This
   lays out however many there are, at whatever width there is. */
@media(min-width:720px){.tls{grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))}}
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

/* The timesheet. Its own pill classes rather than the application ones —
   pill--approved is the signal yellow an approved *application* wears, and an
   approved week of work reading as a warning is exactly backwards. */
.pill--ts_draft{background:var(--surface-2);color:var(--muted)}
.pill--ts_submitted{background:var(--signal);color:var(--signal-ink)}
.pill--ts_approved{background:#0B7A63;color:#fff}
.pill--iv_go{background:#0B7A63;color:#fff}
.pill--iv_wait{background:var(--signal);color:var(--signal-ink)}
.pill--iv_none{background:var(--surface-2);color:var(--muted);border:1px solid var(--line)}
.pill--ts_returned{background:#B3261E;color:#fff}
.pill--pl_matched{background:var(--surface-2);color:var(--ink-2)}
.pill--pl_trial{background:var(--signal);color:var(--signal-ink)}
.pill--pl_ongoing{background:#0B7A63;color:#fff}
.pill--pl_ended{background:var(--surface-2);color:var(--muted)}
.ts__hd{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem}
.ts__wk{font-family:"IBM Plex Mono",monospace;font-size:.75rem;color:var(--muted)}
.sheet{margin-top:1.1rem;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.day{display:grid;grid-template-columns:5rem 1fr 4.6rem;align-items:center;gap:.6rem;padding:.45rem .75rem;border-bottom:1px solid var(--line)}
.day:last-of-type{border-bottom:0}
.day--wknd{background:var(--surface-2)}
.day__d{display:flex;flex-direction:column;min-width:0}
.day__n{font-weight:600;font-size:.88rem;color:var(--ink)}
.day__t{font-family:"IBM Plex Mono",monospace;font-size:.65rem;color:var(--muted)}
.day__note{font-family:inherit;font-size:.85rem;color:var(--ink-2);border:0;background:none;padding:.15rem 0;min-width:0;width:100%}
.day__note:focus{outline:none;border-bottom:1px solid var(--accent)}
.hrs{font-family:"IBM Plex Mono",monospace;font-size:.92rem;text-align:right;padding:.3rem .45rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);font-variant-numeric:tabular-nums;width:100%}
.hrs:disabled{background:var(--surface-2);color:var(--muted)}
.sum{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem;padding:.65rem .75rem;background:var(--glow,var(--accent-soft));border-top:1px solid var(--line)}
.sum__l{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.sum__v{font-size:1.4rem;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}
.sum__v small{font-size:.85rem;font-weight:400;color:var(--muted)}
.wks{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:1.1rem}
.wk{background:var(--surface);padding:.65rem .9rem;display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.wk__d{font-weight:600;font-size:.9rem;color:var(--ink)}
.wk__h{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:.85rem;color:var(--ink-2);font-variant-numeric:tabular-nums}
.wk__m{width:100%;font-family:"IBM Plex Mono",monospace;font-size:.68rem;color:var(--muted)}
.row__tot{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.bd{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.5rem}
.bd i{font-family:"IBM Plex Mono",monospace;font-size:.66rem;font-style:normal;border:1px solid var(--line);border-radius:4px;padding:.12rem .36rem;color:var(--ink-2);background:var(--surface-2);font-variant-numeric:tabular-nums}
.bd i.z{color:var(--muted);opacity:.65}

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
/* The assessment panel in /admin. Two of the controls on it are the only
   things a person decides; everything else came from the trigger. */
.sit{margin-top:.6rem;padding:.7rem .85rem;border:1px solid var(--line);border-radius:9px;
  background:var(--surface-2)}
.sit__hd{display:flex;flex-wrap:wrap;gap:.5rem .8rem;align-items:baseline;margin-bottom:.55rem}
.sit__meta{color:var(--muted);font-size:.84rem}
.sit__wait{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:.66rem;
  letter-spacing:.07em;text-transform:uppercase;font-weight:600;padding:.18rem .45rem;
  border-radius:4px;background:var(--signal);color:var(--signal-ink)}
.sit__v{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:.66rem;
  letter-spacing:.07em;text-transform:uppercase;font-weight:600;padding:.18rem .45rem;border-radius:4px}
.sit__v--passed{background:#0B7A63;color:#fff}
.sit__v--below_line{background:#FAE6EB;color:#B5123A}
.sit__v--in_progress{background:var(--line);color:var(--muted)}
.sit__row{display:flex;flex-wrap:wrap;gap:.45rem .7rem;align-items:center;
  padding:.4rem 0;border-top:1px dashed var(--line)}
.sit__row:first-of-type{border-top:0;padding-top:0}
.sit__lab{font-size:.82rem;color:var(--muted);min-width:5rem}
.sit__s{font-size:.84rem;padding:.16rem .45rem;border-radius:4px;background:var(--surface)}
.sit__s b{font-variant-numeric:tabular-nums}
.sit__ok{color:#0B7A63}
.sit__low{color:#B5123A}
.sit__off,.sit__s.sit__off{color:var(--muted);font-size:.82rem}
.sit__claim{font-family:"IBM Plex Mono",monospace;font-size:.84rem}
.sit__lnk{font-size:.84rem;color:var(--accent);text-decoration:underline}
.sit__in{font-family:"IBM Plex Mono",monospace;font-size:.84rem;width:4.6rem;
  padding:.3rem .45rem;border:1.5px solid var(--accent);border-radius:6px;
  background:var(--paper);color:var(--ink)}
.sit__btn{padding:.35rem .75rem;font-size:.84rem}
.sit__reply{margin-top:.5rem;padding:.7rem .85rem;background:var(--paper);border-radius:8px;
  border:1px solid var(--line);white-space:pre-wrap;font-size:.9rem;line-height:1.6}
.sit__ask{margin:.55rem 0 0;font-size:.84rem;color:var(--ink-2)}
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

/* ── whose rows are these? ────────────────────────────────────

   Every portal page below asks the database for its rows and, until now, took
   the answer as final: "the policy returns only rows carrying this address, so
   there is no filter here to get wrong". That is true of an applicant and
   false of staff, because every one of those SELECT policies ends with an or
   on has_permission('applications.view_all') so that /admin can read the queue
   at all. A staff account is therefore handed EVERY row, on four pages whose
   whole premise is that the rows are yours.

   What it looked like: /status listed five strangers' applications under
   "Where you are in the process"; /hub opened as somebody else and greeted
   them by name; /seats put another company's name on the account. And it was
   not only something to read. The edit form binds to the first row, so Save
   changes sent a PATCH to the newest application in the database, whoever it
   belonged to.

   So the pages narrow as well. This is not a second fence and not distrust of
   the first — Postgres still decides what may leave it, and nothing here can
   widen that by a single row. It is the page choosing, from among the rows it
   is allowed, the ones belonging to the person reading them.

   The test mirrors the applicant half of those policies word for word: the
   account id, or the address on the token. An applicant's set therefore comes
   back exactly as it did before, by construction, and only the accounts the
   policies deliberately widen for see any change at all. */
function whoAmI() {
  var s = session();
  var c = s ? readToken(s.access_token) : null;
  return {
    uid: (c && c.sub) || "",
    email: String((c && c.email) || "").toLowerCase()
  };
}

/* Throws when the row carries neither column, rather than answering no. The
   two ways of getting this wrong are not equally bad: a select that forgets
   email and user_id would otherwise quietly filter away an applicant's own
   application and show her a portal that says nothing is wrong with it. An
   error says which line to look at. */
function isMine(row) {
  if (!row) return false;
  var hasId = Object.prototype.hasOwnProperty.call(row, "user_id");
  var hasEmail = Object.prototype.hasOwnProperty.call(row, "email");
  if (!hasId && !hasEmail) {
    throw new Error("cannot tell whose row this is: the select is missing email and user_id");
  }
  var me = whoAmI();
  if (hasId && row.user_id && me.uid && row.user_id === me.uid) return true;
  return hasEmail && !!row.email && String(row.email).toLowerCase() === me.email;
}

function onlyMine(rows) {
  return (rows || []).filter(isMine);
}

/* Rows hanging off one application — leave, weeks, placements. Kept apart
   from isMine because these carry no address of their own: they are mine
   because the application they point at is. */
function forApplication(id, rows) {
  return (rows || []).filter(function (r) { return r.application_id === id; });
}

/* The client side asks sql/032's question instead — is_client_contact() — so
   it gets its own test rather than being bent into the one above. Returns a
   lookup rather than a list, because every use of it is a membership test. */
function myClientIds(rows) {
  var me = whoAmI(), out = {};
  (rows || []).forEach(function (c) {
    if (c.contact_email && String(c.contact_email).toLowerCase() === me.email) {
      out[c.client_id] = true;
    }
  });
  return out;
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
/* redirect_to as a query parameter, for the reason spelled out over
   resetPassword below. This one was left on the options shape when that was
   fixed, so the confirmation link kept falling back to the project's Site URL
   and landing people on the home page — a page with nothing that reads an auth
   fragment, so the token sat in the address bar and the account stayed
   unconfirmed. It looked, from the outside, exactly like an email that had not
   arrived. */
function signUpPassword(email, password) {
  var back = location.origin + location.pathname;
  return authPost("signup?redirect_to=" + encodeURIComponent(back), {
    email: email,
    password: password
  }).then(function (j) {
    if (j && j.access_token) { keepSession(j); return "in"; }
    return "confirm";
  });
}

/* Sends the confirmation link again. redirect_to is a query parameter here for
   exactly the reason spelled out below, and getting it wrong on this one would
   be the same bug a third time. */
function resendConfirmation(email) {
  var back = location.origin + location.pathname;
  return authPost("resend?redirect_to=" + encodeURIComponent(back), {
    type: "signup",
    email: email
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
var CAME_FROM_LINK = false;

function captureRedirect() {
  if (!location.hash || location.hash.indexOf("access_token") === -1) return false;
  var p = new URLSearchParams(location.hash.slice(1));
  var tok = p.get("access_token");
  if (!tok) return false;
  var kind = p.get("type");
  if (kind === "recovery") CAME_FROM_RESET = true;
  /* Arrived by a link from an email rather than by typing anything. Worth
     knowing, because on a phone that link usually opens inside the mail app's
     own browser: the sign-in genuinely works, and the session is written to
     that webview's storage, which is a different box from Safari or Chrome.
     Close it, open your real browser, and you are signed out — same link, same
     code, different container. A password is the thing that survives that. */
  else if (kind === "magiclink" || kind === "invite" || kind === "signup") CAME_FROM_LINK = true;
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
/* back is where Cancel goes. Signing out is right when somebody arrived here
   from a reset link and has no portal behind them; it is wrong for a client
   who is already signed in and chose to set a password — throwing them out for
   changing their mind is a strange thing to do. Defaults to the old behaviour
   so the reset path is untouched. */
function passwordForm(msg, back) {
  var already = typeof back === "function";
  view(
    '<div class="card">' +
      '<h2 class="edit__h">' +
        (already ? "Choose a password" : "Choose a new password") + "</h2>" +
      (msg ? '<p class="msg msg--bad">' + esc(msg) + "</p>" : "") +
      '<p class="msg" style="margin-top:0">At least eight characters. ' +
      (already
        ? "Once it is saved you can sign in with it instead of waiting for a link."
        : "You will be signed in once it is saved.") + "</p>" +
      '<div class="field" style="margin-top:1rem">' +
        '<input id="pw1" type="password" autocomplete="new-password" ' +
        'placeholder="New password" aria-label="New password">' +
      "</div>" +
      '<button class="btn btn--solid" id="pwgo" type="button" style="margin-top:1rem">Save password</button>' +
      '<p class="msg" style="margin-top:1rem">' +
        '<button class="lnk" id="pwskip" type="button">' +
        (already ? "Cancel" : "Cancel and sign out") + "</button></p>" +
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

  document.getElementById("pwskip").addEventListener("click", already ? back : signOut);
}

/* The message an emailed link came back with, kept where anything can reach
   it. It used to be a local in start(): read once, handed to signedOut(), and
   dropped for anybody who happened to already be signed in. So an expired
   reset link explained itself to a signed-out person and said nothing at all
   to a signed-in one — the same silence the home page used to give everybody,
   one step further in. */
var AUTH_ERR = "";
/* Separate from the message on purpose. Clearing AUTH_ERR as it was drawn
   stopped a second banner and also emptied the thing the /seats redirect
   below reads, so the message was shown for the instant before the page
   navigated away and then lost — the same silence, arrived at differently.
   Found by following an expired link on the live site, not by the test, which
   checked the two behaviours one at a time. */
var AUTH_ERR_SHOWN = false;

function authError() {
  if (!location.hash) return "";
  var p = new URLSearchParams(location.hash.slice(1));
  var e = p.get("error_description") || p.get("error");
  if (e) history.replaceState(null, "", location.pathname);
  AUTH_ERR = e ? decodeURIComponent(e.replace(/\\+/g, " ")) : "";
  return AUTH_ERR;
}

/* Drawn outside the view root, because every page replaces that wholesale when
   it renders and a banner written into it would be gone before anybody read
   it. Cleared as it is shown, so a later render cannot stack a second copy.

   It names the link rather than only quoting the server: "Email link is
   invalid or has expired" on its own reads as the site being broken to
   somebody who has just clicked a button in their mail. */
function noteAuthError() {
  if (!AUTH_ERR || AUTH_ERR_SHOWN) return;
  if (typeof root === "undefined" || !root || !root.parentNode) return;
  var n = document.createElement("div");
  n.className = "note note--warn";
  n.style.margin = "0 0 1.2rem";
  var b = document.createElement("b");
  b.textContent = "That link did not work.";
  n.appendChild(b);
  /* GoTrue sends its reason without a full stop, so joining it to the next
     sentence read as "has expired You are still signed in". Punctuated here
     rather than rewritten, because the server’s words are the accurate half. */
  var said = AUTH_ERR;
  if (!/[.!?]$/.test(said)) said += ".";
  n.appendChild(document.createTextNode(" " + said +
    " You are still signed in, so nothing is lost — ask for a new link and use the newest email."));
  root.parentNode.insertBefore(n, root);
  AUTH_ERR_SHOWN = true;
}

/* An expired token reads as "not signed in" rather than failing mid-request. */
/* What is in storage, expired or not. It used to throw the whole session away
   the moment the access token went stale — which took the refresh token with
   it, so an hour was a hard limit on staying signed in. It did not announce
   itself either: it simply refused the next thing you did. Filling in the
   match form in /admin took longer than that, and the first click reported
   nothing at all while the second said "signed out".

   The refresh token was in storage the whole time, written by two code paths
   and read by none. */
function session() {
  var s = loadSession();
  if (!s || !s.access_token) return null;
  return s;
}

/* Thirty seconds of margin, so a request that leaves now does not arrive
   after the token it is carrying has died. */
function tokenLive(s) {
  return !!(s && s.access_token && (!s.expires_at || Date.now() < s.expires_at - 30000));
}

/* One renewal at a time. A page that fires four requests at once must not
   spend four refresh tokens — Supabase rotates the token on every use, so the
   second call would present one that had just been retired and the whole
   session would be lost trying to save it. */
var RENEWING = null;

function refreshSession() {
  if (RENEWING) return RENEWING;
  var s = loadSession();
  if (!s || !s.refresh_token) return Promise.resolve(null);
  RENEWING = authPost("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
    .then(keepSession)
    .then(
      function () { RENEWING = null; return loadSession(); },
      /* A refused refresh is a real sign-out — the token has been used,
         revoked or has expired in its own right — so clear rather than keep
         retrying with something the server has already rejected. */
      function () { RENEWING = null; clearSession(); return null; }
    );
  return RENEWING;
}

/* An access token good to use right now, renewing first if the one in hand
   has gone stale. Null means genuinely signed out. */
function liveSession() {
  var s = loadSession();
  if (tokenLive(s)) return Promise.resolve(s);
  return refreshSession();
}

function api(path, opts) {
  opts = opts || {};
  return liveSession().then(function (s) {
    if (!s) throw new Error("signed out");
    return send(s, false);
  });

  /* Renew once on a 401 and try again before giving up. The token can expire
     between the check above and the request landing, and a clock that is a
     little out is enough on its own — neither is a reason to throw somebody
     out of a form they are halfway through. */
  function send(s, retried) {
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
    if (r.status === 401) {
      if (retried) { clearSession(); throw new Error("signed out"); }
      return refreshSession().then(function (s2) {
        if (!s2) { clearSession(); throw new Error("signed out"); }
        return send(s2, true);
      });
    }
    if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
    /* Prefer: return=minimal answers a POST with 201 and an empty body, not
       204, so checking the status was not enough — adding a note reported
       "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
       in red under the box, after the note had already been saved. Read the
       body and decide on what is actually there. */
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
}

/* Storage lives beside PostgREST on the same project. */
function storageBase() {
  return SB + "/storage/v1";
}

/* Returns a URL good for one minute. Opened immediately, never stored. */
function signDoc(path) {
  /* liveSession rather than session: storage sits behind the same token, and
     opening somebody's CV an hour into a shift should renew like everything
     else rather than be the one thing that still throws you out. */
  return liveSession().then(function (sess) {
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
  /* The condition is stated on the rung itself rather than left to be
     discovered. Somebody reads this while deciding whether to give up a week
     to training, and "paid training" on its own answers a question it was not
     asked. */
  ["approved",   "Approved &mdash; paid training",
                 "You are through. Paid training starts within a week &mdash; and is paid only if you are hired at the end of it."],
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
/* ── the clock somebody reads ──────────────────────────────────────────────

   sql/056. Every timestamp on these portals has always been rendered with the
   browser's own zone, which is a good default and a bad decision: an assistant
   in Manila working American hours does not think in Manila time, and an
   applicant who has just got off a flight is reading their interview time in
   whatever zone their laptop still believes in.

   So the browser's guess stands until somebody says otherwise, and this is the
   otherwise. Null means "keep guessing", which is deliberately the default —
   freezing the guess into a stored decision at first sign-in would make
   everybody responsible for a setting almost nobody needs to touch.

   A plain date is untouched by any of this. A date is a day, not an instant;
   sql/030's week starts on its Monday everywhere in the world. Only a
   timestamptz moves. */
var MY_TZ = null;

/* Whether the chosen zone actually works in this browser. Intl throws on a
   name it does not know — an old browser, or a zone added to the database
   after it shipped — and one throw here would take out every date on the page
   rather than one. Checked once, then trusted. */
function tzOk(name) {
  if (!name) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name }).format(new Date());
    return true;
  } catch (e) {
    return false;
  }
}

/* Passed to toLocale*, where an undefined timeZone means "this browser's" —
   which is exactly the behaviour every one of these calls had before 056. */
function tzOpts(o) {
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  if (MY_TZ) out.timeZone = MY_TZ;
  return out;
}

/* What the browser thinks, used only as the label on the "use my browser"
   option. Never stored. */
function browserTz() {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) {
    return "";
  }
}

/* Read before the page draws anything with a date on it. A missing table, a
   missing row and a zone this browser cannot use all land in the same place:
   MY_TZ stays null and every date renders exactly as it did before this file
   existed. A settings row is not worth a broken portal. */
function loadMyTz() {
  var s = session();
  if (!s) return Promise.resolve();
  var claims = readToken(s.access_token);
  if (!claims || !claims.sub) return Promise.resolve();
  MY_USER = claims.sub;
  return api("user_settings?select=time_zone&limit=1")
    .then(function (rows) {
      var tz = rows && rows[0] && rows[0].time_zone;
      MY_TZ = tzOk(tz) ? tz : null;
    })
    .catch(function () { MY_TZ = null; });
}

var MY_USER = "";
var TZ_LIST = [];

/* Its own two, rather than the page's. /admin and /hub each define a flash()
   and a why() and they are not the same function — hub's why() answers "Did
   not save" to everything, admin's unpacks the PostgREST body. This card is
   rendered on three portals and must say the same thing on all of them, so it
   carries the pair it needs instead of picking up whichever happens to be in
   scope. Unifying those two is worth doing and is not this file's job. */
function tzFlash(el, text, bad) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-bad", !!bad);
  el.classList.add("is-on");
  clearTimeout(el._t);
  if (!bad) el._t = setTimeout(function () { el.classList.remove("is-on"); }, 1600);
}

function tzWhy(e) {
  var t = String((e && e.message) || e || "");
  if (t === "signed out") return "Signed out — reload and sign in again";
  try {
    var j = JSON.parse(t);
    return [j.message, j.hint].filter(Boolean).join(" — ").slice(0, 180) || t.slice(0, 180);
  } catch (x) {}
  return t.slice(0, 180) || "That did not save";
}

/* The card itself, rendered by each portal wherever its own settings live.
   One definition, because three copies of a preference form is three places
   for it to drift and this one writes to a table with a trigger that will
   refuse a value the other two might still offer. */
function tzCard() {
  return '<div class="card" id="tz-card">' +
    "<h2>Your time zone</h2>" +
    '<p class="msg" style="margin-top:0">Times on your pages are shown in this zone. ' +
      "Dates are not affected &mdash; a week that starts on a Monday starts on that Monday " +
      "wherever you are.</p>" +
    '<div class="tz">' +
      '<div class="fld"><label for="tz-pick">Show times in</label>' +
        '<select id="tz-pick"><option value="">Loading&hellip;</option></select></div>' +
      '<p class="tz__now" id="tz-now"></p>' +
    "</div>" +
    '<div class="edit__foot">' +
      '<span class="hint">We use Central time for anything about the business itself &mdash; ' +
        "the week a timesheet covers, the day a placement ended. This changes what you read, " +
        "not what is recorded.</span>" +
      '<span class="edit__act"><span class="row__ok" id="tz-ok"></span>' +
      '<button class="btn btn--solid" id="tz-go" type="button">Save</button></span>' +
    "</div>" +
  "</div>";
}

/* Called after tzCard() is in the DOM. Fills the dropdown from the database's
   own list of zones, so the options cannot include one the trigger would then
   refuse — and falls back to a short hand-written list if that function is not
   there yet, because a settings card that cannot be used is worse than one
   with fewer choices. */
function wireTz() {
  var sel = document.getElementById("tz-pick");
  var go = document.getElementById("tz-go");
  var ok = document.getElementById("tz-ok");
  if (!sel || !go) return;

  var mine = browserTz();

  function fill(rows) {
    TZ_LIST = rows;
    var opts = '<option value="">Use this device&rsquo;s zone' +
      (mine ? " &mdash; " + esc(mine) : "") + "</option>";
    opts += rows.map(function (z) {
      return '<option value="' + esc(z.name) + '"' +
        (z.name === MY_TZ ? " selected" : "") + ">" + esc(z.name) +
        (z.label ? " &mdash; " + esc(z.label) : "") + "</option>";
    }).join("");
    sel.innerHTML = opts;
    if (!MY_TZ) sel.value = "";
    showNow();
  }

  /* "UTC+08:00" out of the interval Postgres hands back, so somebody can find
     their zone by offset when they do not know its name. */
  function label(off) {
    var s = String(off || "");
    var m = s.match(/^(-?)(\\d{1,2}):(\\d{2})/);
    if (!m) return "";
    return "UTC" + (m[1] === "-" ? "-" : "+") + (m[2].length < 2 ? "0" : "") + m[2] + ":" + m[3];
  }

  api("rpc/time_zones", { method: "POST", body: {} })
    .then(function (rows) {
      fill((rows || []).map(function (z) {
        return { name: z.name, label: label(z.utc_offset) };
      }));
    })
    .catch(function () {
      /* sql/056 not pasted yet, or the function is not readable. The zones
         below cover where this product's people actually are. */
      fill([
        { name: "America/Chicago", label: "Central" },
        { name: "America/New_York", label: "Eastern" },
        { name: "America/Denver", label: "Mountain" },
        { name: "America/Los_Angeles", label: "Pacific" },
        { name: "Asia/Manila", label: "UTC+08:00" },
        { name: "Asia/Kolkata", label: "UTC+05:30" },
        { name: "Africa/Nairobi", label: "UTC+03:00" },
        { name: "Africa/Lagos", label: "UTC+01:00" },
        { name: "Europe/London", label: "UTC+00:00" },
        { name: "UTC", label: "UTC" }
      ]);
    });

  /* The clock, right now, in whatever is selected. A zone name means nothing
     to most people and a time does — this is how somebody knows they picked
     the right one without saving and reloading to find out. */
  function showNow() {
    var box = document.getElementById("tz-now");
    if (!box) return;
    var pick = sel.value || null;
    try {
      var t = new Date().toLocaleString(undefined, {
        timeZone: pick || undefined,
        weekday: "short", hour: "numeric", minute: "2-digit"
      });
      box.textContent = "It is " + t + " there right now.";
    } catch (e) {
      box.textContent = "";
    }
  }
  sel.addEventListener("change", showNow);

  go.addEventListener("click", function () {
    var pick = sel.value || null;
    if (pick && !tzOk(pick)) {
      tzFlash(ok, "This browser does not know that zone", true);
      return;
    }
    go.disabled = true;
    tzFlash(ok, "Saving…");

    /* Upsert by hand: one row per user, and whether it exists yet depends on
       whether they have ever opened this card. Prefer resolution=merge-duplicates
       makes the first save and the tenth the same request. */
    api("user_settings", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
        "Content-Profile": "public"
      },
      body: { user_id: MY_USER, time_zone: pick }
    }).then(function () {
      MY_TZ = pick;
      tzFlash(ok, "Saved");
      go.disabled = false;
      /* Reloaded rather than repainted. Every date already on screen was
         formatted in the old zone, and a page showing two zones at once is
         worse than a page that takes a second to come back. */
      setTimeout(function () { location.reload(); }, 500);
    }).catch(function (e) {
      go.disabled = false;
      tzFlash(ok, tzWhy(e), true);
    });
  });
}

/* ── an interview time, in two clocks ──────────────────────────────────────

   sql/057. A slot is a timestamptz and is the one thing in this product that
   genuinely means the same moment to two people in different places. Both of
   them have to be able to read it as their own without doing arithmetic.

   The second clock is Central, and always Central, rather than "the other
   person's". That is not laziness — it is the only zone either side can
   actually be shown. sql/056 makes a person's chosen zone readable by nobody
   but themselves, deliberately, and neither can read the other's: an assistant
   cannot read the client's seat request, and a client has no way to reach an
   applicant's settings. Guessing at the other end and labelling the guess with
   their name would be worse than naming a zone that is simply true.

   Central is the business's own clock. It is what /admin already stamps a date
   in, it is what the client is almost always on, and it is a thing both people
   can name in a sentence to each other — which is the actual job here. */
var CENTRAL = "America/Chicago";

function slotDay(iso, zone) {
  var d = new Date(iso);
  if (isNaN(d)) return "";
  try {
    return d.toLocaleString(undefined, {
      timeZone: zone || undefined,
      weekday: "short", day: "numeric", month: "short"
    });
  } catch (e) {
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
}

function slotClock(iso, zone) {
  var d = new Date(iso);
  if (isNaN(d)) return "";
  try {
    return d.toLocaleString(undefined, {
      timeZone: zone || undefined, hour: "numeric", minute: "2-digit"
    });
  } catch (e) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
}

/* "Tue 8 Sep · 9:00 AM", in whatever the reader has chosen or their browser
   believes. */
function slotLabel(iso) {
  return slotDay(iso, MY_TZ) + " \\u00b7 " + slotClock(iso, MY_TZ);
}

/* The line underneath. Left empty when the reader is already on Central,
   because "9:00 AM · 9:00 AM Central" is noise rather than help.

   The day is repeated only when it differs — which is exactly the case worth
   spelling out, since 10:00 PM Manila on Tuesday is 9:00 AM Central on that
   same Tuesday, and an assistant who reads only the clock can book herself
   into the wrong night. */
function slotAlso(iso, minutes) {
  var mine = MY_TZ || browserTz();
  var out = minutes ? String(minutes) + " minutes" : "";

  if (mine && mine !== CENTRAL) {
    var here = slotDay(iso, mine), there = slotDay(iso, CENTRAL);
    out += (out ? " \\u00b7 " : "") +
      (here === there
        ? slotClock(iso, CENTRAL) + " Central"
        : there + " " + slotClock(iso, CENTRAL) + " Central");
  } else if (mine) {
    out += (out ? " \\u00b7 " : "") + "Central";
  }
  return out;
}

/* Which of the two people the interview is sitting on, from the slots alone.
   There is no status column in 057 — the state is derived, so that there is
   one place it can be read and no second place to disagree with it. This is
   the same derivation as the interview_state view, in the language of a page
   that already has the rows in hand. */
function slotState(slots) {
  var live = [], picked = null, done = null, declined = false;
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    if (s.confirmed_at) done = s;
    if (s.chosen_at && !s.declined_at) picked = s;
    if (s.declined_at) declined = true;
    else live.push(s);
  }
  live.sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
  return {
    slots: live,
    picked: picked,
    confirmed: done,
    declined: declined && !live.length,
    state: done ? "confirmed"
         : picked ? "waiting_on_client"
         : declined && !live.length ? "declined"
         : live.length ? "waiting_on_assistant"
         : "not_started"
  };
}

function when(iso) {
  if (!iso) return "";
  /* A plain date is a day, not an instant. new Date("2026-09-07") is midnight
     UTC, and every timezone behind UTC renders that as the 6th — so leave
     starting on the 7th has been shown as starting on the 6th since 026, and a
     timesheet week has been labelled with the Sunday before its Monday.
     Parsed from its parts, a date means the same day everywhere.

     A timestamptz still goes through Date, because that one really is an
     instant and should be shown in the reader's own time. */
  var d;
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(String(iso))) {
    var p = String(iso).split("-");
    d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  } else {
    d = new Date(iso);
  }
  if (isNaN(d)) return "";
  /* tzOpts only adds timeZone when somebody has chosen one, and a date-only
     string took the branch above — it was built from its own parts and carries
     no instant to convert. Passing a zone here would push the 7th back to the
     6th for a reader in a zone behind it, which is the exact bug the comment
     above this function exists about. */
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(String(iso))) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined,
    tzOpts({ year: "numeric", month: "short", day: "numeric" }));
}
var SIGNIN_HINT = "Use the same address you applied with &mdash; that is how we find your application.";

function signedOut(msg, mode) {
  /* One card, three states: sign in, create an account, reset. They share the
     email field and most of the markup, so they are one function rather than
     three that drift apart.

     Every portal gets all three. /hub and /seats used to override this with a
     Google button and nothing else, which locked out everybody whose address
     is not a Google account — an assistant who set a password on /status could
     not open her own portal, and a client contact on a company address had no
     door at all. The functions this form calls were sitting unused in both
     files the whole time. */
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
            ? 'Already have an account? <button class="lnk" data-mode="in" type="button">Sign in</button>'
            : 'No account yet? <button class="lnk" data-mode="up" type="button">Create one</button>' +
              ' &middot; <button class="lnk" data-mode="reset" type="button">Forgot password</button>') +
      "</p>" +
      '<p class="msg">' + SIGNIN_HINT + "</p>" +
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
      var msg = String((e && e.message) || "");
      /* The one refusal that is not the person's fault and has a way out. */
      if (/not confirmed/i.test(msg)) { unconfirmed(em); return; }
      fail(msg || "That did not work.");
    });
  });
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
    /* Styles for one page only. Everything above is shared by all four, which
       is right for the chrome and wrong for a component that exists on one of
       them: the bill went into PAGE_CSS and landed in /admin and /hub, where
       there is no bill and never will be. A page that only has some of these
       rules is not a drift risk — a page carrying rules for a card it does not
       render is just weight nobody will ever remove, because nobody will know
       it is safe to. */
    o.css || "",
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

/* "Email not confirmed" is Supabase's own wording and a dead end. It is shown
   to somebody whose address and password are both correct, names what is
   wrong, and offers nothing to do about it — while the one thing they need is
   a link they may never have received. A red line is not an answer here. */
function unconfirmed(email) {
  view(
    '<div class="card">' +
      '<div class="note"><b>Almost there.</b> That password is right, but ' +
      esc(email) + " has not been confirmed yet. We sent a link when the account " +
      "was made &mdash; it is worth checking your spam folder.</div>" +
      '<button class="btn btn--solid" id="again" type="button" style="margin-top:1.1rem">' +
        "Send the link again</button>" +
      '<p class="msg" id="againmsg"></p>' +
      '<p class="msg"><button class="lnk" id="againback" type="button">Back to signing in</button></p>' +
    "</div>"
  );

  document.getElementById("againback").addEventListener("click", function () { signedOut(""); });

  document.getElementById("again").addEventListener("click", function () {
    var b = document.getElementById("again");
    var m = document.getElementById("againmsg");
    b.disabled = true;
    b.textContent = "Sending\\u2026";
    resendConfirmation(email).then(function () {
      b.textContent = "Sent";
      m.textContent = "Open the link in that email and you are in.";
    })["catch"](function (e) {
      b.disabled = false;
      b.textContent = "Send the link again";
      m.textContent = (e && e.message) || "That did not work.";
    });
  });
}

/* The line under the sign-in card, which is the only part of it that differs
   between portals. Each page overwrites this before start() runs. Held as a
   variable rather than an argument because signedOut() is called from a dozen
   places that have no business knowing which portal they are in.

   It is our own markup and goes in unescaped, which is what lets the client
   one carry a link. Nothing from a user reaches it. */

/* ── the assessment ───────────────────────────────────────────────────────
   Three parts, shown only while she is at the assessment stage. Note there is
   not a backtick anywhere in this block: it is inside a template literal, and
   one would end the whole page script here rather than at the bottom.

   The scenarios below
   are the prompts and the options and NOTHING ELSE — the points live in
   sql/045's trigger, and this array is emitted from tools/assessment-items.mjs
   with the scores stripped at build time rather than trusted to be left out.
   She sends the positions she ticked; the database decides what they were
   worth. Same rule 025 set for DISC, for the same reason: view-source. */
var QBANK = ${JSON.stringify(
  Object.fromEntries(Object.entries(BANKS).map(([k, bank]) =>
    [k, bank.map((it) => [it[0], it[1].map((o) => o[0])])]))
)};
var SCEN = QBANK.scenarios;
/* Which measures gate which track. The page uses this for one thing only —
   whether to show the sales part — and the database decides the verdict from
   its own copy, so a browser that lies about its track gets asked different
   questions and scored on the same rules either way. */
var TRACK_AXES = ${JSON.stringify(TRACK_AXES)};
var TYPE_TARGET = ${TYPING_TARGET_WPM};
var TYPE_MIN_ACC = ${TYPING_MIN_ACCURACY};

/* The passage she types. Support-email prose rather than random words, because
   the thing being measured is typing the work, not typing. */
var TYPE_TEXT = "Thank you for getting in touch about your order. I have checked " +
  "the account and I can see the payment went through on Tuesday. The parcel " +
  "left our warehouse the same evening and the tracking number is in the email " +
  "below. If it has not arrived by Friday, reply to this message and I will " +
  "open a case with the courier straight away.";

function assessCard(a, s) {
  /* Nothing to show unless she is actually at this stage. A finished
     assessment stays visible so she can see it was received — an empty space
     where her work was is the thing that generates the email asking whether
     it arrived. */
  if (a.status !== "assessment" && !(s && s.submitted_at)) return "";

  if (s && s.submitted_at) {
    return '<div class="card">' +
      '<div class="row__top"><span><span class="row__n">Your assessment</span>' +
      '<span class="row__meta"> &middot; sent ' + esc(when(s.submitted_at)) + "</span></span>" +
      '<span class="pill pill--approved">Received</span></div>' +
      '<p class="msg" style="margin-top:1rem">We have it. There is nothing more for you ' +
      "to do on this part &mdash; you will hear from us either way.</p></div>";
  }

  /* Sales is only asked of the track it gates. Nobody else answers eight
     questions that cannot affect their result — and the database agrees,
     because sales is in no other track's axes, so an empty bank scores zero
     and gates nothing. */
  var wantsSales = (TRACK_AXES[a.track] || []).indexOf("sales") > -1;

  /* Finished, not merely started. Read from part_done, which only closePart
     writes — answers appearing in a column mean she has begun, and 051 made
     that happen two and a half seconds after her first click. */
  var fin = (s && s.part_done) || {};
  var done = {
    english: !!fin.english,
    scen:    !!fin.scenarios,
    detail:  !!fin.detail,
    sales:   !!fin.sales,
    written: !!fin.written,
    typing:  !!fin.typing
  };

  /* part_opened is written by open_part() and, until now, read by nothing on
     this page. So a part with its clock running looked exactly like one never
     touched: the same Start, the same silence. Close the tab mid-part — a
     phone, a dropped connection — and you came back to a card offering to
     start something that had been running for six minutes.

     The deadline itself is right and stays: a clock that pauses when you close
     the tab is not a clock, and 051 moved it into the database precisely so
     reopening could not reset it. What was missing was saying so.

     Typing is not in here because it is not timed — partShell gets 0 minutes
     and never calls open_part, so it has no clock to report. */
  var OPEN = (s && s.part_opened) || {};
  var MINS = { english: 8, scen: 20, detail: 10, sales: 8, written: 20 };
  var OPEN_KEY = { english: "english", scen: "scenarios", detail: "detail",
                   sales: "sales", written: "written" };

  /* Milliseconds left, or null when the part has no clock or has never been
     opened. Negative means the deadline passed while she was away, which is a
     real state: opening it then closes it and banks whatever was saved. */
  function msLeft(k) {
    if (!MINS[k]) return null;
    var at = Date.parse(OPEN[OPEN_KEY[k]] || "");
    if (isNaN(at)) return null;
    return at + MINS[k] * 60000 - Date.now();
  }

  function clockText(ms) {
    var secs = Math.max(0, Math.round(ms / 1000));
    return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  }

  var left = 0;
  ["english", "scen", "detail", "written", "typing"].forEach(function (k) {
    if (!done[k]) left++;
  });
  if (wantsSales && !done.sales) left++;

  /* Three states, not two. A part is untouched, or open with time on it, or
     open with the time gone — and the middle one is the whole point: the
     button has to say Resume and the row has to say how long is left, or the
     card is telling somebody their clock has not started. The time shown is
     read when the card is drawn, which is every time this page loads and
     every time a part closes. */
  function part(k, n, t, d, isDone, note) {
    var ms = isDone ? null : msLeft(k);
    var live = ms !== null && ms > 0;
    var over = ms !== null && ms <= 0;
    return '<li class="apt' + (isDone ? " is-done" : "") + '">' +
      '<span class="apt__n">' + (isDone ? "&#10003;" : n) + "</span>" +
      '<span><span class="apt__t">' + t + "</span>" +
      '<span class="apt__d">' + d +
        (live ? " &middot; " + clockText(ms) + " left"
              : over ? " &middot; the time on this one has gone" : "") +
      "</span></span>" +
      (isDone
        ? '<span class="apt__s">' + esc(note || "done") + "</span>"
        : '<button class="btn btn--solid apt__go" data-part="' + k + '" type="button">' +
          (live ? "Resume" : over ? "Finish" : "Start") + "</button>") +
      "</li>";
  }

  return '<div class="card">' +
    '<div class="row__top"><span><span class="row__n">Your assessment</span>' +
    '<span class="row__meta"> &middot; about an hour, in parts</span></span>' +
    '<span class="pill pill--assessment">' + (left ? left + " left" : "Ready to send") + "</span></div>" +
    /* Ordered by what each one costs her, cheapest first, and that is not a
       tidiness choice. Almost all drop-off happens at the first thing asked —
       once somebody finishes one part they overwhelmingly finish the rest. So
       the first part is eight quick questions with nothing to install and
       nowhere to go, and the one that sends her to another website is last. */
    '<p class="msg" style="margin:1rem 0">' + (wantsSales ? "Six" : "Five") + " parts, shortest " +
    "first. You can stop between them and nothing is lost, but once a part is open it is timed &mdash; " +
    "so start each one when you have a quiet moment.</p>" +
    '<ol class="apts">' +
      part("english", 1, "English", QBANK.english.length + " short questions, eight minutes",
        done.english) +
      part("scen", 2, "Judgement", SCEN.length + " situations, twenty minutes",
        done.scen) +
      part("detail", 3, "Detail", QBANK.detail.length + " things to check, ten minutes",
        done.detail) +
      (wantsSales
        ? part("sales", 4, "Sales", QBANK.sales.length + " questions, eight minutes", done.sales)
        : "") +
      part("written", wantsSales ? 5 : 4, "Written reply to a customer",
        "Twenty minutes, about 150 words", done.written) +
      part("typing", wantsSales ? 6 : 5, "Typing and your setup",
        "A test on another site, and a connection check",
        done.typing, done.typing ? s.typing_wpm + " wpm, we check it" : "") +
    "</ol>" +
    (left === 0
      ? '<button class="btn btn--solid" id="a-send" type="button" style="margin-top:1.2rem">Send my assessment</button>' +
        '<p class="msg" style="margin-top:.7rem">Once it is sent you cannot change it.</p>'
      : "") +
    '<p class="msg msg--bad" id="a-card-err" style="display:none"></p>' +
    "</div>";
}

/* ── running a part ───────────────────────────────────────────────────────
   One at a time, full card, timed. The timer is a deadline rather than a
   countdown of work done: she can leave the page and the part is still over
   when it is over, because a clock that pauses when you close the tab is not
   a clock. What it never does is throw the work away — expiry saves whatever
   is there and closes the part, so a slow typist loses the rest of the time
   and not the paragraph she wrote. */
var SIT = null;          /* her row, once started */
var APP_ID = null;
var TICK = null;
var ENDS = 0;

function fmtLeft(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
}

function startRow(a) {
  if (SIT) return Promise.resolve(SIT);
  return api("application_assessment", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { application_id: a.id, track: (a.tracks && a.tracks[0]) || a.track || "Customer Service" }
  }).then(function (r) { SIT = (r && r[0]) || {}; return SIT; });
}

/* Saves one part. Only the four columns a page is granted — a score or a
   verdict sent from here is refused by the grant, not by good manners. */
function savePart(patch) {
  return api("application_assessment?application_id=eq." + APP_ID, {
    method: "PATCH",
    body: patch
  });
}

/* The second argument is which part is being finished, and it is not

   The list of parts used to decide a part was done by looking at whether its
   answers column held anything. That was true while answers were only written
   on this button — and stopped being true the moment 051 started saving them
   as she goes, because the first answer she picked then marked the whole part
   finished and took the Start button away. One question of eight, and no way
   back in.

   So finishing is recorded rather than inferred. sql/054 holds the moment, the
   same way 051 holds the moment a part was opened, and neither is a guess
   about the other. */
function closePart(patch, part, err) {
  if (TICK) { clearInterval(TICK); TICK = null; }
  var e = document.getElementById("a-err");
  return savePart(patch)
    .then(function () {
      /* After the answers, not before: a part marked finished whose answers
         failed to save is the one order that loses her work. */
      return part ? api("rpc/close_part", { method: "POST", body: { part: part } }) : null;
    })
    .then(function () { return loadApplications(); })
    .catch(function () {
      if (e) { e.style.display = ""; e.textContent =
        "That did not save. Check your connection and try the part again."; }
    });
}

/* The done button is rendered here rather than passed in by each part. Three
   callers each emitting their own done-button id is three copies of one id in
   the page source — never two at once on screen, but the audit reads the
   source and is right to: an id that exists three times is one rename away
   from the timer clicking the wrong one.

   And the id is not written out in this comment, because comments ship inside
   the inline script and the audit found the one in the prose too. */
/* mins of 0 means there is no clock on this one.

   The typing part used to run here and was timed, because the typing happened
   here. It happens on another site now, and this part is a form for reporting
   what it said — putting a five-minute countdown on typing three numbers would
   be theatre. It still goes through this shell rather than rendering its own
   card, because the alternative was a second copy of #a-err and #a-done in the
   source, and the comment below already explains why that is a bad trade. */
/* ── the deadline, and what happens when it passes ────────────────────────

   Three things were wrong with the clock and they compounded.

   The deadline was set in the browser when a part opened — ENDS = now + mins —
   so it was fresh every time. Twenty minutes long, right up until somebody
   closed the tab at nineteen and opened it again, at which point twenty
   minutes again. The comment above it claimed the opposite.

   The auto-submit at zero only ran while the page was open. Close the tab and
   the interval died with it, so a part that ran out was not submitted, it was
   simply never finished — and stayed open forever.

   And answers lived in memory until the Done button, so anything typed before
   a closed tab was gone regardless.

   sql/051 moved the deadline into the database: open_part() records the moment
   a part is first opened and refuses to move it afterwards. These three
   functions are the other half. */

/* Where this part's clock actually started. Asked once, on opening; the answer
   is the same on the tenth reopen as on the first.

   Fails toward letting her sit the part. If the call does not come back we run
   the clock from now rather than refusing to open anything — a generous
   deadline costs a few minutes, a blocked applicant costs the applicant. */
function openPart(part, mins) {
  return api("rpc/open_part", { method: "POST", body: { part: part } })
    .then(function (at) {
      var t = Date.parse(at);
      return isNaN(t) ? Date.now() + mins * 60000 : t + mins * 60000;
    }, function () {
      return Date.now() + mins * 60000;
    });
}

/* Saving as she goes, so an auto-submit is not automatically empty.

   Debounced, because a radio button fires on every pick and eight questions
   answered quickly is eight writes nobody needs. Flushed immediately when the
   page is hidden, which is the case this exists for: closing a tab, switching
   apps on a phone, the screen locking. visibilitychange is the one that
   actually fires on mobile — pagehide and beforeunload are unreliable there,
   so both are wired and whichever arrives first wins. */
var SAVE_T = null;
var SAVE_PENDING = null;

function saveProgress(column, collect) {
  SAVE_PENDING = function () {
    var patch = {};
    patch[column] = collect();
    return savePart(patch)["catch"](function () { return null; });
  };
  if (SAVE_T) clearTimeout(SAVE_T);
  SAVE_T = setTimeout(function () {
    SAVE_T = null;
    var run = SAVE_PENDING;
    SAVE_PENDING = null;
    if (run) run();
  }, 2500);
}

function flushProgress() {
  if (SAVE_T) { clearTimeout(SAVE_T); SAVE_T = null; }
  var run = SAVE_PENDING;
  SAVE_PENDING = null;
  if (run) run();
}

/* Wired once, not per part, so nothing accumulates listeners as she moves
   between them. */
(function () {
  var go = function () { if (document.visibilityState === "hidden") flushProgress(); };
  document.addEventListener("visibilitychange", go);
  window.addEventListener("pagehide", flushProgress);
})();

/* The second argument is a moment, not a length. It comes from openPart(), which asks the
   database when this part actually started — so reopening a part does not
   restart it, which is what "mins" allowed for as long as it was computed
   here. Pass 0 for a part with no clock. */
function partShell(title, ends, inner, doneLabel, pill) {
  ENDS = ends || 0;
  var mins = ends ? Math.max(0, ends - Date.now()) / 60000 : 0;
  view('<div class="card">' +
    '<div class="row__top"><span><span class="row__n">' + title + "</span></span>" +
    '<span class="pill pill--assessment" id="a-clock">' +
      (mins ? fmtLeft(mins * 60000) : esc(pill || "no time limit")) + "</span></div>" +
    inner +
    '<p class="msg msg--bad" id="a-err" style="display:none"></p>' +
    '<button class="btn btn--solid" id="a-done" type="button" style="margin-top:1.1rem">' +
    esc(doneLabel) + "</button></div>");
  if (!mins) return;
  TICK = setInterval(function () {
    var el = document.getElementById("a-clock");
    if (!el) { clearInterval(TICK); TICK = null; return; }
    el.textContent = fmtLeft(ENDS - Date.now());
    if (Date.now() >= ENDS) {
      clearInterval(TICK); TICK = null;
      var done = document.getElementById("a-done");
      if (done) done.click();
    }
  }, 500);
}

/* Where the typing test now happens. It is a link rather than a page of ours,
   and that is the point: the score arrives with something behind it instead of
   being whatever a browser said. Change this to whichever test you settle on —
   pick one whose result has its own address, because the whole value here is
   that somebody at this end can open the proof and read it. */
var TYPING_TEST_URL = "https://10fastfingers.com/typing-test/english";
var TYPING_TEST_NAME = "10FastFingers";

function typingPart() {
  partShell("Typing and accuracy", 0,
    '<p class="msg" style="margin:1rem 0">Take the test at ' +
      '<a href="' + esc(TYPING_TEST_URL) + '" target="_blank" rel="noopener">' +
      esc(TYPING_TEST_NAME) + "</a>, then come back and tell us what you scored. " +
      "Accuracy counts for more than speed &mdash; work somebody has to redo is slower " +
      "than typing slowly.</p>" +

    '<div class="note" style="margin-bottom:1.1rem"><b>We check every one.</b> ' +
      "Paste a link to your result page, or to a screenshot of it. A score nobody " +
      "can check is not counted, so this part matters as much as the number.</div>" +

    '<label class="a-lbl" for="a-wpm">Words per minute</label>' +
    '<input id="a-wpm" type="number" min="0" max="250" step="1" inputmode="numeric" ' +
      'style="width:100%;margin:.4rem 0 1rem" placeholder="e.g. 58">' +

    '<label class="a-lbl" for="a-acc">Accuracy, as a percentage</label>' +
    '<input id="a-acc" type="number" min="0" max="100" step="1" inputmode="numeric" ' +
      'style="width:100%;margin:.4rem 0 1rem" placeholder="e.g. 97">' +

    '<label class="a-lbl" for="a-proof">Link to your result, or to a screenshot of it</label>' +
    '<input id="a-proof" type="url" maxlength="500" ' +
      'style="width:100%;margin:.4rem 0 .3rem" placeholder="https://">' +
    '<p class="msg" style="margin-top:.3rem">Most tests give the result its own address. ' +
      "If yours does not, put a screenshot in Google Drive or Dropbox and paste a link " +
      "anyone can open.</p>" +

    /* The connection check. The application form has asked about equipment and
       internet since 005 as a yes-or-no that nobody could verify, which made
       it a question rather than a check. This is the one thing the better
       agencies genuinely do that this process did not. It rides along here
       because she is already off on another website for the typing test, so it
       costs one more link rather than one more part. */
    '<label class="a-lbl" for="a-conn">Link to a speed test of your connection</label>' +
    '<input id="a-conn" type="url" maxlength="500" ' +
      'style="width:100%;margin:.4rem 0 .3rem" placeholder="https://">' +
    '<p class="msg" style="margin-top:.3rem">Run one at speedtest.net and paste the result link. ' +
      "It takes a minute, and it is what stops somebody starting a client on a connection that " +
      "cannot hold a call.</p>",
    "Save this part", "no time limit");

  document.getElementById("a-done").addEventListener("click", function () {
    var err = document.getElementById("a-err");
    var wpm = document.getElementById("a-wpm");
    var acc = document.getElementById("a-acc");
    var proof = document.getElementById("a-proof");
    var conn = document.getElementById("a-conn");
    var fail = function (m, el) {
      err.style.display = "";
      err.textContent = m;
      if (el) el.focus();
    };
    err.style.display = "none";

    var w = Number(wpm.value);
    var a = Number(acc.value);
    var p = String(proof.value || "").trim();
    var c = String(conn.value || "").trim();

    if (!wpm.value || !(w >= 0 && w <= 250)) {
      return fail("Enter your words per minute — the number the test gave you.", wpm);
    }
    if (!acc.value || !(a >= 0 && a <= 100)) {
      return fail("Enter your accuracy as a percentage, between 0 and 100.", acc);
    }
    /* Checked before the score saves, so nobody is told to go and find a link
       after the numbers have already gone. Checked loosely on purpose — what
       matters is that a person at this end can open it, not that it matches
       some pattern. */
    if (!/^https?:\\/\\/\\S+\\.\\S+/i.test(p)) {
      return fail("Paste a link we can open — it should start with http.", proof);
    }
    if (p.length > 500) {
      return fail("That link is too long. Use a shorter one.", proof);
    }
    if (!/^https?:\\/\\/\\S+\\.\\S+/i.test(c)) {
      return fail("Paste a link to your speed test too — speedtest.net gives you one.", conn);
    }
    if (c.length > 500) {
      return fail("That speed test link is too long. Use a shorter one.", conn);
    }

    closePart({
      typing_wpm: Math.round(w),
      typing_accuracy: Math.round(a),
      typing_proof: p,
      connection_proof: c
    }, "typing");
  });
}

/* How close what was typed is to the passage, allowing for the typist being a
   human being.

   This used to compare position against position — typed[i] against
   TYPE_TEXT[i] — which is only correct while the two strings stay in step, and
   one dropped or doubled character early on puts them out of step for good.
   Miss a letter at position fifty and the remaining two hundred and eighty
   comparisons all fail: accuracy came out around fifteen per cent, and
   anything under ninety-five drops the score into a branch that caps it at
   four, which is below the pass mark on every track. So the arithmetic
   rejected good typists for one typo, silently, and told them they were slow.
   The denominator was wrong too — typed.length, so three correct characters
   and nothing else scored a hundred per cent.

   An edit distance against the best-matching PREFIX of the passage answers the
   question actually being asked: of what she typed, how much is right, whether
   or not she finished. One missed letter in three hundred and thirty now costs
   what one missed letter should. */
function typingAccuracy(typed) {
  var n = typed.length;
  if (!n) return 0;
  var m = TYPE_TEXT.length;

  /* One row at a time: the passage is short, but there is no reason to hold a
     330 x 330 grid to read back a single number. */
  var prev = new Array(m + 1);
  var cur = new Array(m + 1);
  for (var j = 0; j <= m; j++) prev[j] = j;

  for (var i = 1; i <= n; i++) {
    cur[0] = i;
    for (var k = 1; k <= m; k++) {
      var cost = typed.charAt(i - 1) === TYPE_TEXT.charAt(k - 1) ? 0 : 1;
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
    }
    for (var c = 0; c <= m; c++) prev[c] = cur[c];
  }

  /* The best prefix, not the whole passage: stopping early is a matter for the
     speed, not for whether the words are right. */
  var best = prev[0];
  for (var q = 1; q <= m; q++) if (prev[q] < best) best = prev[q];

  var acc = Math.round(((n - best) / n) * 100);
  return Math.max(0, Math.min(100, acc));
}

function writtenPart() {
  openPart("written", 20).then(function (ends) {
    /* Same rule as the question banks: the clock started when she first opened
       this, not when she last opened it, and a part whose time has gone is
       closed with what she had rather than handed back for another twenty
       minutes. */
    if (Date.now() >= ends) {
      var e = document.getElementById("a-card-err");
      if (e) {
        e.style.display = "";
        e.textContent = "That part's time had run out, so it has been closed with what you had written.";
      }
      closePart({ written_reply: (SIT && SIT.written_reply) || "" }, "written");
      return;
    }
    drawWritten(ends);
  });

  function drawWritten(ends) {
  partShell("Written reply to a customer", ends,
    '<p class="msg" style="margin:1rem 0"><b>A customer writes:</b> &ldquo;I ordered two weeks ago ' +
    "and nothing has arrived. Nobody has answered my last two emails. I want a refund and I want " +
    "to know why this happened.&rdquo;</p>" +
    '<p class="msg">Write the reply you would send. About 150 words. You do not have the order ' +
    "in front of you &mdash; part of what is being read is what you do about that.</p>" +
    '<div class="note" style="margin:1rem 0"><b>Write it yourself.</b> Pasting is turned off ' +
    "on this part. We ask about your answers in the interview.</div>" +
    '<label class="a-lbl" for="a-write">Your reply to the customer</label>' +
    '<textarea id="a-write" rows="11" placeholder="Your reply" style="width:100%;margin-top:1rem"></textarea>' +
    '<p class="msg" id="a-count" style="margin-top:.5rem">0 words</p>',
    "Done writing");

  var box = document.getElementById("a-write");
  var count = document.getElementById("a-count");

  /* Same as the question banks: what she has already written is put back, or
     reopening the part and finishing it would save an empty reply over twenty
     minutes of work. */
  if (SIT && SIT.written_reply) {
    box.value = SIT.written_reply;
    var w0 = box.value.trim() ? box.value.trim().split(/\\s+/).length : 0;
    count.textContent = w0 + " words";
  }
  box.addEventListener("input", function () {
    var n = box.value.trim() ? box.value.trim().split(/\\s+/).length : 0;
    count.textContent = n + " words";
    /* Saved as she writes, on the same debounce as the question banks. This is
       the part where losing the work would hurt most — twenty minutes of
       writing against a tab that closed. */
    saveProgress("written_reply", function () { return box.value.slice(0, 8000); });
  });
  /* Pasting is off here, and this is the part where it matters most.

     The written reply is a work sample — a piece of the real job, marked by a
     person — and since 049 it decides half of the english axis. It is also the
     one part of this assessment a chatbot can simply write.

     A guard like this existed once, on the typing test that used to run on
     this page, and went with it when the typing moved to another site. The
     written reply never had one at all, which was the wrong way round: nobody
     needs to paste into a typing test to cheat it, and pasting is the whole
     method here.

     Worth being honest about what this is: a speed bump, not a wall. Somebody
     can read an answer off a second screen and type it. That is why the real
     defence is the interviewer asking her about two of her own answers, and
     why this is only the cheap half of it. */
  ["paste", "drop"].forEach(function (ev) {
    box.addEventListener(ev, function (e) {
      e.preventDefault();
      var w = document.getElementById("a-err");
      if (w) {
        w.style.display = "";
        w.textContent = "Write this one yourself — pasting is turned off.";
      }
    });
  });

  box.focus();

  document.getElementById("a-done").addEventListener("click", function () {
    if (SAVE_T) { clearTimeout(SAVE_T); SAVE_T = null; SAVE_PENDING = null; }
    closePart({ written_reply: box.value.slice(0, 8000) }, "written");
  });
  }
}

/* One renderer, four banks.

   This was scenPart(), and it was the only bank there was. English, detail and
   sales are the same shape down to the last detail — a prompt, four options,
   pick one — so they are the same function rather than three copies that drift
   apart the first time somebody fixes a bug in one of them.

   Everything specific to a bank is an argument: which questions, what the card
   is called, how long it runs, which column the answers land in, and the line
   of explanation above them. */
function bankPart(key, title, mins, column, intro) {
  var bank = QBANK[key] || [];

  /* What she has picked so far, as positions. Read out of the page rather than
     kept in a variable, so the autosave and the Done button can never disagree
     about what is on screen. */
  var collect = function () {
    var out = [];
    for (var i = 0; i < bank.length; i++) {
      var hit = document.querySelector('input[name="q' + i + '"]:checked');
      out.push({ p: hit ? Number(hit.value) : null });
    }
    return out;
  };

  openPart(key, mins).then(function (ends) {
    /* The clock ran out while she was away. Nothing to show her and nothing to
       decide — whatever was saved as she went is what the part is worth, and
       the part is over. Closing it rather than reopening it is the difference
       between a deadline and a suggestion. */
    if (Date.now() >= ends) {
      var e = document.getElementById("a-card-err");
      if (e) {
        e.style.display = "";
        e.textContent = "That part's time had run out, so it has been closed with the answers you had.";
      }
      var patch = {};
      patch[column] = (SIT && SIT[column]) || [];
      /* Through closePart so the part is recorded as finished. Saving alone
         would leave it open, and a part whose time has gone would offer its
         Start button again every time she came back to the page. */
      closePart(patch, key);
      return;
    }
    drawBank(ends);
  });

  function drawBank(ends) {
  var qs = bank.map(function (s, i) {
    var opts = s[1].map(function (o, j) {
      return '<label class="a-opt"><input type="radio" name="q' + i + '" value="' + j + '"> ' +
        "<span>" + esc(o) + "</span></label>";
    }).join("");
    return '<li class="a-q"><p class="a-q__p">' + esc(s[0]) + "</p>" +
      '<div class="a-opts">' + opts + "</div></li>";
  }).join("");

  partShell(title, ends,
    '<p class="msg" style="margin:1rem 0">' + intro + "</p>" +
    '<ol class="a-qs">' + qs + "</ol>", "Done");

  /* Put back what she already answered.

     Since 051 the answers save as she goes, so a part she opened, answered
     three of and walked away from has three answers stored. The questions were
     redrawn blank, and collect() reads the screen — so finishing the part
     wrote nulls over every one of them. She would have had to answer them
     twice and would never have been told why.

     Found by reopening a part and counting: four answered, three saved. */
  var prior = (SIT && SIT[column]) || [];
  for (var pi = 0; pi < prior.length; pi++) {
    var was = prior[pi] && prior[pi].p;
    if (was === null || was === undefined) continue;
    var hit = document.querySelector('input[name="q' + pi + '"][value="' + was + '"]');
    if (hit) hit.checked = true;
  }

  /* Every pick is saved, quietly, a couple of seconds later. So the clock
     running out while the tab is shut costs her the questions she had not
     reached rather than all of them. */
  var card = document.querySelector(".card");
  if (card) {
    card.addEventListener("change", function (ev) {
      if (!ev.target || ev.target.type !== "radio") return;
      saveProgress(column, collect);
    });
  }

  document.getElementById("a-done").addEventListener("click", function () {
    /* Positions, never letters and never scores. The database holds the key
       and decides what each position was worth. */
    if (SAVE_T) { clearTimeout(SAVE_T); SAVE_T = null; SAVE_PENDING = null; }
    var patch = {};
    patch[column] = collect();
    closePart(patch, key);
  });
  }
}

function scenPart() {
  bankPart("scenarios", "Judgement scenarios", 20, "scenario_answers",
    QBANK.scenarios.length + " situations. Pick what you would actually do. More than one " +
    "answer is reasonable in some of them &mdash; pick the best one.");
}

function englishPart() {
  bankPart("english", "English", 8, "english_answers",
    "Eight short ones. Each is a line you might really send a customer &mdash; pick the version " +
    "you would send.");
}

function detailPart() {
  bankPart("detail", "Detail", 10, "detail_answers",
    "Eight small records, each with one thing wrong in it. Some of them are odd but perfectly " +
    "fine, so read before you flag.");
}

function salesPart() {
  bankPart("sales", "Sales", 8, "sales_answers",
    "Eight people who have not bought anything yet. Pick what you would actually do next.");
}

function wireAssess(a) {
  APP_ID = a.id;
  SIT = a.sit;
  var go = document.querySelectorAll(".apt__go");
  for (var i = 0; i < go.length; i++) {
    go[i].addEventListener("click", function (ev) {
      var which = ev.currentTarget.getAttribute("data-part");
      startRow(a).then(function () {
        if (which === "typing") typingPart();
        else if (which === "written") writtenPart();
        else if (which === "english") englishPart();
        else if (which === "detail") detailPart();
        else if (which === "sales") salesPart();
        else scenPart();
      }).catch(function () {
        var e = document.getElementById("a-card-err");
        if (e) { e.style.display = ""; e.textContent =
          "We could not open that just now. Try again in a moment."; }
      });
    });
  }

  var send = document.getElementById("a-send");
  if (send) send.addEventListener("click", function () {
    send.disabled = true;
    send.textContent = "Sending\\u2026";
    /* submitted_at is not ours to write — the grant excludes it, and the
       trigger stamps it. This asks the database to close the row by sending
       the one thing a page may send that means "finished". */
    api("rpc/submit_assessment", { method: "POST", body: {} })
      .then(function () { loadApplications(); })
      .catch(function () {
        send.disabled = false;
        send.textContent = "Send my assessment";
        var e = document.getElementById("a-card-err");
        if (e) { e.style.display = ""; e.textContent =
          "That did not send. Try again in a moment."; }
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
    /* A client with no application is sent to their own page. Carrying the
       message with them, because the hash has already been cleared by the
       read above and a redirect would otherwise be the third place this
       error goes to die. */
    location.replace("/seats" +
      (AUTH_ERR ? "#error_description=" + encodeURIComponent(AUTH_ERR) : ""));
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

    /* After the card rather than inside it: the assessment is a thing to do,
       not a detail of the application, and burying a timed task under the
       shift list is how it goes unnoticed for three days. */
    html += assessCard(a, a.sit);
  }

  /* Only the first application is editable. Someone with two open
     applications is rare enough that quietly editing the wrong one would be
     worse than making them ask. */
  html += editForm(apps[0]);
  html += '<p class="msg">Name and email are fixed here &mdash; they are on your ID check. ' +
          "Tell us in a reply if either needs changing.</p>";
  html += tzCard();
  view(html);
  wireTz();
  /* After view(), because the buttons do not exist until the markup is in the
     document. Wired for the first application only, which is the same one
     editForm() takes and for the same reason. */
  wireAssess(apps[0]);
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
  noteAuthError();

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) { clearSession(); signedOut("That sign-in did not carry an email address."); return; }
  view('<div class="card"><span class="spin"></span>Looking up your application&hellip;</div>');

  /* Everyone signs in through the same link, so a staff member lands here
     first. Rather than showing them an empty applicant view, ask what they
     can do and point them at the right page. They may also be an applicant,
     so this offers rather than redirects. */
  Promise.all([
    api("rpc/my_permissions", { method: "POST", body: {} }).catch(function () { return []; }),
    api("rpc/my_account_requests", { method: "POST", body: {} }).catch(function () { return []; }),
    /* In here rather than beside it, so the chosen zone is known before the
       first date is drawn. It never rejects — a missing table, a missing row
       and a zone this browser cannot use all leave MY_TZ null — so it cannot
       be the thing that stops the portal loading. */
    loadMyTz()
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
        '<a class="opt" href="/careers#apply">' + tick +
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
    /* email and user_id are read to be filtered on, not to be shown: they are
       what onlyMine() compares, and without them it cannot tell. */
    api("applications?select=id,created_at,email,user_id,tracks,track,experience,shifts,country,region,availability,has_equipment,phone,cv,note,status,status_changed_at,skill_english,skill_customer,skill_data_entry,skill_social,skill_bookkeeping&order=created_at.desc"),
    api("application_documents?select=application_id,path,filename,bytes&order=uploaded_at.desc")
      .catch(function () { return []; }),
    /* Caught rather than allowed to fail the page. Until sql/045 is pasted
       this table does not exist and PostgREST answers 404 — and an applicant
       being shown "we could not load your application" because a stage she is
       not at has no table is the portal breaking over a feature she cannot
       see. No row and no table both mean the same thing here: nothing to sit
       yet. The same shape 030 needed on /hub, for the same reason. */
    api("application_assessment?select=application_id,track,attempt,started_at,submitted_at," +
        "typing_wpm,typing_accuracy,typing_proof,connection_proof,scenario_answers,english_answers,detail_answers,sales_answers,written_reply,verdict,part_done")
      .catch(function () { return []; })
  ])
    .then(function (r) {
      /* Mine, not every row the policy was willing to hand over. For staff
         that is the difference between this page and the admin queue. */
      var rows = onlyMine(r[0] || []);
      var byId = {};
      (r[1] || []).forEach(function (d) {
        (byId[d.application_id] = byId[d.application_id] || []).push(d);
      });
      var sits = {};
      (r[2] || []).forEach(function (s) { sits[s.application_id] = s; });
      rows.forEach(function (a) { a.docs = byId[a.id] || []; a.sit = sits[a.id] || null; });
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

/* ────────────────────── what a client owes, in one place ──────────────────

   Two pages answer the same question now — the bill on /seats and the whole
   of /pay — and the answer is arithmetic over rows neither page owns. Kept
   here so there is exactly one definition of what "owed" means. Two pages
   quoting a client two different totals is the kind of thing that ends a
   relationship with a business, and it is one copied helper away.

   Everything below is derived. Nothing here stores a number: approved,
   non-trial weeks at the rate on their placement, less the payments somebody
   has written down. */
const CLIENT_MONEY = `
function cIso(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
function cFrom(s) {
  var p = String(s).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function cHours(w) {
  var ds = (w && w.timesheet_days) || [], t = 0;
  for (var i = 0; i < ds.length; i++) t += Number(ds[i].hours || 0);
  return t;
}
function cNum(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\\.$/, "");
}
function cMoney(n) {
  return "$" + (Math.round(Number(n) * 100) / 100).toFixed(2);
}
/* Payments are stored as an integer number of cents, so they are divided here
   and nowhere else. cMoney rounds, which is right for a product of hours and a
   rate and would be a quiet lie about a figure that is already exact. */
function cCents(cents) {
  return "$" + (Number(cents || 0) / 100).toFixed(2);
}
function cWeekLabel(iso) {
  var a = cFrom(iso), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  var f = { month: "short", day: "numeric" };
  return a.toLocaleDateString(undefined, f) + " to " + b.toLocaleDateString(undefined, f);
}

/* The bill, computed once and read by both pages.

   Returns the weeks newest first, what each came to, the grand total, and the
   hours that could not be priced. A week with no rate on its placement is
   deliberately left OUT of the money and counted separately — quoting a total
   that silently omits somebody's hours is a bug this page has already been
   through once. */
function cBill() {
  var nameOf = {};
  C_NAMES.forEach(function (n) { if (n.name) nameOf[n.application_id] = n.name; });

  var placeById = {};
  C_PLACE.forEach(function (p) { placeById[p.id] = p; });

  var byWeek = {}, unpriced = 0, missingRate = false;
  var hours = 0, freeHours = 0, people = {};

  C_WEEKS.forEach(function (w) {
    if (w.status !== "approved") return;
    var p = placeById[w.placement_id];
    if (!p) return;
    var h = cHours(w);
    if (!h) return;
    var rate = C_RATE[p.id];
    if (rate === undefined && !w.trial_week) { missingRate = true; unpriced += h; return; }
    people[p.application_id] = true;
    if (w.trial_week) { freeHours += h; } else { hours += h; }
    byWeek[w.week_starts_on] = byWeek[w.week_starts_on] || [];
    byWeek[w.week_starts_on].push({
      id: w.id,
      who: nameOf[p.application_id] || "your assistant",
      hours: h,
      rate: rate,
      free: !!w.trial_week,
      settled: !!C_SETTLED[w.id]
    });
  });

  /* Sorted as strings, which for an ISO date is the same as sorting by date
     and does not build 260 Date objects to find out. Newest first, because the
     week somebody is about to pay for is the one they came to look at. */
  var order = Object.keys(byWeek).sort().reverse();
  var grand = 0;
  var weeks = order.map(function (wk) {
    var lines = byWeek[wk], total = 0, settled = lines.length > 0;
    lines.forEach(function (l) {
      if (!l.free) total += l.hours * l.rate;
      if (!l.free && !l.settled) settled = false;
    });
    grand += total;
    return { week: wk, lines: lines, total: total, settled: settled };
  });

  return {
    weeks: weeks,
    grand: grand,
    hours: hours,
    freeHours: freeHours,
    people: Object.keys(people).length,
    oldest: order.length ? order[order.length - 1] : null,
    unpriced: unpriced,
    missingRate: missingRate
  };
}

/* What has actually been paid, and therefore what is actually left.

   Before sql/055 there was nothing to subtract, so the bill's heading —
   "Total approved, not yet paid" — was half a guess: the first half was
   counted and the second half was assumed. A client who paid was told, on
   their own page, that they still owed it. */
function cPaidCents() {
  var t = 0;
  for (var i = 0; i < C_PAID.length; i++) t += Number(C_PAID[i].amount_cents || 0);
  return t;
}

/* In cents throughout, and only converted for display. The approved side is a
   product of numeric hours and a numeric rate, so it is rounded to the cent
   once, here, rather than drifting a fraction at a time through a subtraction. */
function cOwedCents(grand) {
  return Math.round(Number(grand) * 100) - cPaidCents();
}

var C_PAY_METHOD = {
  bank_transfer: "Bank transfer", wise: "Wise", paypal: "PayPal",
  card: "Card", cheque: "Cheque", cash: "Cash", other: "Other"
};
`;

const SEATS_SCRIPT = "var root = document.getElementById(\"pt-root\");\nvar lead = document.getElementById(\"pt-lead\");\n\nfunction view(html) { root.innerHTML = html; }\n\n/* The five stages the home page already promises. Kept in one place so the\n   wording a client reads here matches the wording that sold them the seat. */\nvar SEAT_STAGES = [\n  [\"received\",    \"Request received\",  \"We have it. A person reads every one.\"],\n  [\"call_booked\", \"Call booked\",       \"Twenty minutes to agree the hours, the tasks and the rate.\"],\n  [\"matching\",    \"Matching\",          \"We are shortlisting from assistants already trained in your track.\"],\n  [\"shortlist\",   \"Shortlist sent\",    \"Names with you. You choose; we handle the handover.\"],\n  [\"running\",     \"Seat running\",      \"Your assistant is working the hours you set.\"]\n];\nvar SEAT_LABEL = {\n  received: \"Received\", call_booked: \"Call booked\", matching: \"Matching\",\n  shortlist: \"Shortlist\", running: \"Running\", closed: \"Closed\"\n};\n\nfunction seatStageIndex(s) {\n  for (var i = 0; i < SEAT_STAGES.length; i++) if (SEAT_STAGES[i][0] === s) return i;\n  return -1;\n}\n\n/* No signedOut() of its own — the shared one carries Google, email and\n   password, create-an-account and reset. This page used to shadow it with the\n   Google button alone, which left a client contact on a company address with\n   no way in at all: they never apply, never set a password, and nothing ever\n   invited them. Creating an account is the path they actually need, so the\n   line below points at it. */\nSIGNIN_HINT = 'Use the address we hold for your business &mdash; that is how we find your seats. ' +\n  'No account yet? Create one with that address and it becomes how you sign in. ' +\n  'If you have not asked us for a seat yet, <a href=\"/#book\">book a call</a> first.';\n\n/* Whole dollars only, which is what a seat request's rounded `weekly` column\n   can express. Kept for the rows written before sql/046 added the exact one. */\nfunction money(n) {\n  if (n === null || n === undefined) return \"\";\n  return \"$\" + Number(n).toLocaleString(\"en-US\");\n}\n\n/* The quote, to the cent, exactly as the visitor was shown it on the home\n   page. 30 hours at $7.75 is $232.50 there; the integer `weekly` column holds\n   233, and this page used to print that back to the same person under the word\n   \"Quoted\". Fifty cents is not much money and it is the whole argument the\n   site makes, so it is worth a column and a formatter.\n\n   Falls back to the rounded figure for rows taken before 046 ran — those never\n   carried the cents and guessing them back would be inventing a number rather\n   than reporting one. */\nfunction quoted(r) {\n  if (r.weekly_cents !== null && r.weekly_cents !== undefined) {\n    return \"$\" + (r.weekly_cents / 100).toLocaleString(\"en-US\", {\n      minimumFractionDigits: 2, maximumFractionDigits: 2\n    });\n  }\n  return money(r.weekly);\n}\n\nfunction stages(r) {\n  if (r.status === \"closed\") {\n    return '<div class=\"note note--warn\" style=\"margin-top:1.2rem\"><b>This request is closed.</b> ' +\n           'If you want to pick it up again, <a href=\"/#book\">book a call</a> and we will start from what we already know.</div>';\n  }\n  var at = seatStageIndex(r.status);\n  var out = \"\";\n  for (var i = 0; i < SEAT_STAGES.length; i++) {\n    var st = SEAT_STAGES[i];\n    var done = at > i;\n    var now = at === i;\n    out +=\n      '<li class=\"' + (now ? \"is-now is-done\" : done ? \"is-done\" : \"\") + '\">' +\n        '<span class=\"stg__dot\">' + (done ? \"&#10003;\" : String(i + 1)) + \"</span>\" +\n        \"<span>\" +\n          '<span class=\"stg__t\">' + st[1] + \"</span>\" +\n          '<span class=\"stg__d\">' + st[2] + \"</span>\" +\n          (now ? '<span class=\"stg__badge\">You are here</span>' : \"\") +\n        \"</span>\" +\n      \"</li>\";\n  }\n  return '<ol class=\"stg\">' + out + \"</ol>\";\n}\n\nfunction render(email, rows) {\n  var initial = (email || \"?\").charAt(0).toUpperCase();\n  var who =\n    '<div class=\"who\">' +\n      '<div class=\"who__id\"><span class=\"who__av\">' + esc(initial) + \"</span>\" +\n      '<span class=\"who__t\"><span class=\"who__n\">' +\n      esc((rows[0] && rows[0].company) || \"Your account\") + \"</span>\" +\n      '<span class=\"who__e\">' + esc(email) + \"</span></span></div>\" +\n      '<span style=\"display:flex;gap:.5rem\">' +\n      /* A client who arrived by link has no password at all. Offering one here\n         is the difference between signing in and waiting for an email every\n         time; declining it is perfectly reasonable, so it is a quiet button\n         rather than a prompt. */\n      '<button class=\"btn btn--ghost\" id=\"setpw\" type=\"button\" style=\"padding:.5rem .9rem;font-size:.88rem\">Set a password</button>' +\n      '<button class=\"btn btn--ghost\" id=\"out\" type=\"button\" style=\"padding:.5rem .9rem;font-size:.88rem\">Sign out</button>' +\n      \"</span>\" +\n    \"</div>\";\n\n  /* Arriving by a link is not the same as being able to come back. On a\n     phone the link opens inside the mail app\u2019s own browser, so the session\n     lands in that webview\u2019s storage and is simply not there when they open\n     Safari or Chrome. It looks like the link failed. It did not \u2014 it worked\n     somewhere they cannot get back to. A password is what survives that, so\n     this offers one at the only moment they are certain to see it. */\n  if (CAME_FROM_LINK) {\n    who += '<div class=\"note\" style=\"margin-bottom:1.2rem\"><b>You came in by a link.</b> ' +\n      'A link signs you in wherever you clicked it \u2014 on a phone that is usually the mail ' +\n      'app rather than your browser, so you may find yourself signed out again there. ' +\n      'Set a password and you can sign in anywhere. ' +\n      '<button class=\"lnk\" id=\"nudgepw\" type=\"button\">Set one now</button></div>';\n  }\n\n  lead.textContent = \"Signed in as \" + email + \".\";\n\n  /* A client made in /admin has no seat_requests row \u2014 that table is the\n     enquiry form on the home page, and a business we matched by hand never\n     filled it in. This branch used to return here, so the placement, the week\n     waiting to be approved and the statement were all unreachable for every\n     client who arrived the way clients actually arrive. The note below is\n     about seat requests, so it now only stands in when there is genuinely\n     nothing else to show. */\n  if (!rows.length) {\n    var only = clientBlock();\n    view(who + (only ||\n      '<div class=\"card\">' +\n        '<div class=\"note\"><b>Nothing here under this address yet.</b> ' +\n        \"A seat request appears here once you have sent one. If you booked a call with a \" +\n        \"different email, sign out and use that one.</div>\" +\n        '<p style=\"margin-top:1.2rem\"><a class=\"btn btn--solid\" href=\"/#book\">Book a 20-minute call</a></p>' +\n      \"</div>\") + tzCard());\n    if (only) wireClient();\n    wireTz();\n    document.getElementById(\"out\").addEventListener(\"click\", signOut);\n  document.getElementById(\"setpw\").addEventListener(\"click\", function () { passwordForm(\"\", start); });\n  var nudge = document.getElementById(\"nudgepw\");\n  if (nudge) nudge.addEventListener(\"click\", function () { passwordForm(\"\", start); });\n    return;\n  }\n\n  var html = who;\n  for (var i = 0; i < rows.length; i++) {\n    var r = rows[i];\n    /* weekly is what the dialog quoted at the time. Shown as the quote it was\n       rather than as a live price, because the rate is agreed on the call and\n       this row is a record of what was asked for. */\n    html +=\n      '<div class=\"card\">' +\n        '<div class=\"row__top\">' +\n          \"<span>\" +\n            '<span class=\"row__n\">' +\n              esc((r.seats && r.seats.length ? r.seats.join(\" + \") : \"Seat\")) + \"</span>\" +\n            '<span class=\"row__meta\"> &middot; asked ' + esc(when(r.created_at)) + \"</span>\" +\n          \"</span>\" +\n          '<span class=\"pill pill--' + esc(r.status) + '\">' +\n            esc(SEAT_LABEL[r.status] || r.status) + \"</span>\" +\n        \"</div>\" +\n        stages(r) +\n        '<ul class=\"meta\">' +\n          \"<li><b>Hours a week</b><span>\" + esc(r.hours || \"—\") + \"</span></li>\" +\n          (r.weekly || r.weekly_cents ? \"<li><b>Quoted</b><span>\" + esc(quoted(r)) + \" a week</span></li>\" : \"\") +\n          \"<li><b>Cover</b><span>\" + esc((r.blocks || []).join(\", \") || \"—\") + \"</span></li>\" +\n          \"<li><b>Your time zone</b><span>\" + esc(r.timezone || \"—\") + \"</span></li>\" +\n          \"<li><b>Last updated</b><span>\" +\n            esc(when(r.status_changed_at) || when(r.created_at)) + \"</span></li>\" +\n        \"</ul>\" +\n      \"</div>\";\n  }\n\n  html += '<p class=\"msg\">Something not right? Reply to the email we sent you, or write to ' +\n          '<a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>';\n  html += clientBlock();\n  html += billingBlock();\n  html += tzCard();\n  view(html);\n  wireTz();\n  wireClient();\n  document.getElementById(\"out\").addEventListener(\"click\", signOut);\n  document.getElementById(\"setpw\").addEventListener(\"click\", function () { passwordForm(\"\", start); });\n  var nudge = document.getElementById(\"nudgepw\");\n  if (nudge) nudge.addEventListener(\"click\", function () { passwordForm(\"\", start); });\n}\n\nfunction start() {\n  captureRedirect();\n  if (CAME_FROM_RESET) { passwordForm(\"\"); return; }\n  var err = authError();\n  if (!session()) { signedOut(err); return; }\n  noteAuthError();\n\n  var claims = readToken(session().access_token);\n  if (!claims || !claims.email) {\n    clearSession();\n    signedOut(\"That sign-in did not carry an email address.\");\n    return;\n  }\n\n  view('<div class=\"card\"><span class=\"spin\"></span>Looking up your seats&hellip;</div>');\n\n  loadMyTz().then(function () {\n\n  /* The policy returns the rows carrying this address and, for anybody\n     holding a role, everybody else's as well - that trailing or on\n     has_permission is what makes /admin possible at all. So being handed your\n     own is half the database's job and half this page's, and the half that was\n     missing put another company's name on this account. */\n  api(\"seat_requests?select=id,created_at,email,seats,hours,weekly,weekly_cents,blocks,timezone,company,status,status_changed_at&order=created_at.desc\")\n    .then(function (rows) { return loadClient(claims.email, onlyMine(rows || [])); })\n    .catch(function (e) {\n      if (String(e.message) === \"signed out\") { signedOut(\"Your session expired. Sign in again.\"); return; }\n      view('<div class=\"card\"><p class=\"msg msg--bad\">We could not load your seats just now. ' +\n           \"Refresh, or try again in a minute.</p>\" +\n           '<button class=\"btn btn--ghost\" id=\"out-error\" type=\"button\" style=\"margin-top:1.1rem\">Sign out</button></div>');\n      document.getElementById(\"out-error\").addEventListener(\"click\", signOut);\n    });\n  });\n}\n\nstart();" + `

/* ── the client's own portal ──
   Everything above this line is about seats somebody once asked us for.
   This is about the assistant actually working for them: the week waiting on
   their word, what it comes to, and the way to ask for somebody different.

   Appended rather than woven in, because the two halves answer different
   questions and a client may well have one and not the other — somebody
   matched by hand never filled in the seats form, and somebody who filled it
   in may still be waiting. */
/* 032 again, asked from the page rather than from a policy: the clients this
   address is the contact for. Everything on the client side is narrowed
   through it, because every one of those policies also answers yes to a role,
   and a role is not a client. */
var MY_CLIENTS = {};
var C_PLACE = [];
var C_RATE = {};
var C_WEEKS = [];
var C_SWAPS = [];
var C_STARTS = [];
var C_NAMES = [];
/* 055. What has been paid, and which weeks somebody said it settled. Both
   empty until that file is pasted, and an empty ledger is honest: it says
   nothing has been recorded, which is exactly what is true. */
var C_PAID = [];
var C_SETTLED = {};
/* 057. Every interview time offered on this client's placements. */
var C_SLOTS = [];
var C_OFF = false;

/* The statement adds up approved weeks, and the weeks are read with a limit,
   so the limit is a cap on the total. At 26 it was half a year — which meant a
   running total that started QUIETLY FALLING once the oldest approved week
   dropped off the end, on a card headed "what the hours you have approved come
   to". Nothing on the page said the number had a horizon.

   Raised to something a placement will not reach for years, and the page now
   says so when it is reached rather than leaving the client to notice. Both
   halves matter: a bigger number alone just moves the day it goes wrong. */
var C_WEEK_LIMIT = 260;
var C_TRUNCATED = false;

var C_LABEL = { matched: "matched", trial: "on trial", ongoing: "kept on", ended: "ended" };
var C_DAY = ["M", "T", "W", "T", "F", "S", "S"];

function loadClient(email, rows) {
  return Promise.all([
    api("placements?select=id,client_id,application_id,status,started_on,ended_on,hours_per_week," +
        "trial_weeks&order=started_on.desc.nullslast"),
    api("placement_billing?select=placement_id,rate"),
    api("timesheets?select=id,placement_id,week_starts_on,status,note,submitted_at,decided_at," +
        "trial_week,timesheet_days(worked_on,hours)&order=week_starts_on.desc&limit=" + C_WEEK_LIMIT),
    api("swap_requests?select=id,placement_id,reason,status,created_at&order=created_at.desc"),
    /* 042. A row here means this client has already said when the work starts,
       so the card asking them stops asking. */
    api("placement_starts?select=placement_id,starts_on,confirmed_at"),
    /* Read on its own rather than embedded in the placement above, and that is
       not a style choice. 041 shipped it as application_public(name) nested in
       the placements select, and PostgREST answered 400: there is no foreign
       key between those two tables. Both point at applications, which is not a
       relationship it can traverse.
       Worse than a broken name — loadClient catches any failure here by hiding
       the whole client block, so the client's portal showed "Nothing here
       under this address yet" while a live placement sat behind it.
       The policy on this table already returns only the people this client is
       actually placed with, so asking for it plainly is enough. */
    api("application_public?select=application_id,name"),
    /* 055, and both of these are read separately from everything above for
       the same reason the names are: they are their own tables, their policies
       already return only this client's rows, and asking plainly is enough.

       Wrapped so that a database without 055 pasted yet answers with nothing
       rather than taking the client's whole portal down with it. loadClient's
       own catch hides the entire client block on any failure, which for a
       missing table would mean a live placement vanishing behind "nothing here
       under this address yet" — the exact failure 041 already cost us once. */
    api("client_payments?select=id,client_id,amount_cents,paid_on,method,reference&order=paid_on.desc")
      .catch(function () { return []; }),
    api("client_payment_weeks?select=timesheet_id")
      .catch(function () { return []; }),
    /* 057. Every time offered on any of this client's placements. The policy
       returns only their own, so there is no filter here to get wrong. */
    api("interview_slots?select=id,placement_id,starts_at,minutes,chosen_at," +
        "confirmed_at,declined_at,meeting_url&order=starts_at.asc")
      .catch(function () { return []; }),
    /* Which clients this address is actually the contact for. sql/032 decides
       that with is_client_contact(); this asks the same question from here,
       and its answer is what narrows every list above. Without it a role reads
       this page as somebody else's statement. */
    api("client_private?select=client_id,contact_email").catch(function () { return []; })
  ]).catch(function (e) {
    if (String(e.message) === "signed out") throw e;
    /* 032 is pasted by hand some time after this ships, and a client who has
       no placement is an ordinary thing rather than a fault. Either way the
       seats half of the page is unaffected. */
    C_OFF = true;
    return [[], [], [], [], [], [], [], [], [], []];
  }).then(function (r) {
    MY_CLIENTS = myClientIds(r[9]);
    C_PLACE = (r[0] || []).filter(function (p) { return MY_CLIENTS[p.client_id]; });
    var onMine = {};
    C_PLACE.forEach(function (p) { onMine[p.id] = true; });
    C_RATE = {};
    (r[1] || []).forEach(function (b) { C_RATE[b.placement_id] = Number(b.rate); });
    var rawWeeks = r[2] || [];
    C_WEEKS = rawWeeks.filter(function (w) { return onMine[w.placement_id]; });
    /* Exactly at the limit is how a capped read announces itself — there may
       be more behind it and there is no way from here to know. Treated as
       truncated, which is the safe direction: saying so when it is not quite
       true costs a sentence, and not saying so when it is costs a number. */
    C_TRUNCATED = rawWeeks.length >= C_WEEK_LIMIT;
    C_SWAPS = (r[3] || []).filter(function (w) { return onMine[w.placement_id]; });
    C_STARTS = (r[4] || []).filter(function (w) { return onMine[w.placement_id]; });
    C_NAMES = r[5] || [];
    C_PAID = (r[6] || []).filter(function (p) { return MY_CLIENTS[p.client_id]; });
    C_SETTLED = {};
    (r[7] || []).forEach(function (a) { C_SETTLED[a.timesheet_id] = true; });
    C_SLOTS = (r[8] || []).filter(function (w) { return onMine[w.placement_id]; });
    render(email, rows);
  });
}

${CLIENT_MONEY}

function cDays(w) {
  var by = {};
  (w.timesheet_days || []).forEach(function (d) { by[d.worked_on] = Number(d.hours || 0); });
  var mon = cFrom(w.week_starts_on), out = "";
  for (var i = 0; i < 7; i++) {
    var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    var h = by[cIso(d)] || 0;
    out += '<i class="' + (h ? "" : "z") + '">' + C_DAY[i] + " " + esc(cNum(h)) + "</i>";
  }
  return '<div class="bd">' + out + "</div>";
}

/* One block per assistant working for this business, not one block.

   This used to take the first placement that was not ended and return. The
   constraint behind that reading is placements_one_live_idx, and it is unique
   on application_id — one live placement per ASSISTANT. Nothing has ever
   limited a business to one assistant, and the page is called /seats because
   the product sells them by the seat.

   So a client with two assistants saw one of them. The second one's weeks
   never appeared for approval, which stalls her pay until staff step in, and
   her hours were missing from the statement entirely — a total that looked
   right, was internally consistent, and was wrong. */
function clientBlock() {
  var live = [];
  for (var i = 0; i < C_PLACE.length; i++) {
    if (C_PLACE[i].status !== "ended") live.push(C_PLACE[i]);
  }
  if (!live.length) return "";

  return live.map(function (pl, k) { return placeBlock(pl, k); }).join("");
}

/* ── the bill ──────────────────────────────────────────────────────────────
   One bill for the business, not one per assistant.

   The statement inside each placement card answers "what has this person cost
   me". This answers the question somebody actually pays against: what does the
   business owe, this week and in total, across everybody working for them. A
   client with three assistants was previously left adding three cards up by
   hand — and, before the fix above, adding up a page that was only showing
   them one of the three.

   Everything here is derived from the same rows the placement cards use, so
   the two can never disagree: an approved week, not a trial week, times the
   rate on that placement. Nothing new is stored. There is no invoice table
   because there is no invoice — this is what the approved hours come to, and
   the moment money actually moves it will want a record of its own. */
function billingBlock() {
  var live = C_PLACE.filter(function (p) { return p.status !== "ended"; });
  if (!live.length && !C_PLACE.length) return "";

  /* The arithmetic moved to cBill in CLIENT_MONEY when /pay was built, so the
     two pages cannot drift into quoting the same business two totals. This
     function is now only the drawing. */
  var bill = cBill();
  var missingRate = bill.missingRate;
  var unpriced = bill.unpriced;
  var grand = bill.grand;

  /* No early return for an empty bill. A client with a placement and nothing
     approved yet still gets the card, saying so — otherwise the place their
     money will appear simply does not exist until the first week lands, and
     "there is no bill on my page" reads as something being broken rather than
     as nothing being owed. */
  var rows = bill.weeks.map(function (wk) {
    var body = wk.lines.map(function (l) {
      return '<div class="bill__ln">' +
        '<span class="bill__who">' + esc(l.who) + "</span>" +
        '<span class="bill__h">' + esc(cNum(l.hours)) + " h" +
          (l.free ? "" : " &times; " + esc(cMoney(l.rate))) + "</span>" +
        '<span class="bill__amt' + (l.free ? " bill__free" : "") + '">' +
          (l.free ? "free &mdash; trial" : esc(cMoney(l.hours * l.rate))) + "</span>" +
      "</div>";
    }).join("");
    return '<div class="bill__wk">' +
      '<div class="bill__wkh"><span class="bill__wkn">Week of ' + esc(cWeekLabel(wk.week)) + "</span>" +
      (wk.settled && wk.total ? '<span class="bill__paid">paid</span>' : "") +
      '<span class="bill__wkt">' + esc(cMoney(wk.total)) + "</span></div>" +
      body +
    "</div>";
  }).join("");

  var paid = cPaidCents();
  var owed = cOwedCents(grand);

  return '<div class="card" id="billing">' +
    "<h2>Your bill</h2>" +
    '<p class="msg" style="margin-top:0">Every assistant working for you, week by week. ' +
      "Only hours you have approved appear here, and trial weeks are ours to cover.</p>" +
    (missingRate
      ? '<div class="note note--warn" style="margin-top:1.1rem"><b>' + esc(cNum(unpriced)) +
        " hours are not priced yet.</b> They are approved and recorded, and they are not in the " +
        "total below. We are finishing your rate &mdash; write to " +
        '<a href="mailto:support@securejobva.com">support@securejobva.com</a> if it is not sorted within a day.</div>'
      : "") +
    (rows
      ? '<div class="bill">' + rows + "</div>" +
        /* Three lines rather than one, and only when there is something to
           subtract. Before 055 this said "Total approved, not yet paid" over a
           number that counted the first half and assumed the second — so the
           first client to pay was told on their own page that they still owed
           it. The heading below now means what it says, because the line above
           it is a figure somebody wrote down. */
        (paid
          ? '<div class="bill__tot bill__tot--sub"><span class="bill__totl">Total approved</span>' +
            '<span class="bill__totv">' + esc(cMoney(grand)) + "</span></div>" +
            '<div class="bill__tot bill__tot--sub"><span class="bill__totl">Paid</span>' +
            '<span class="bill__totv bill__totv--paid">&minus;&nbsp;' + esc(cCents(paid)) + "</span></div>"
          : "") +
        '<div class="bill__tot"><span class="bill__totl">' +
          (paid ? "Left to pay" : "Total approved, not yet paid") + "</span>" +
        '<span class="bill__totv">' + esc(cCents(owed)) + "</span></div>" +
        /* A credit is not an error. A client who pays a round number against a
           part week is ahead, and a page that shows that as a negative amount
           owed reads as a bug in the bill rather than as money in hand. */
        (owed < 0
          ? '<div class="note" style="margin-top:1rem"><b>You are ' + esc(cCents(-owed)) +
            " ahead.</b> That sits against the weeks still to come &mdash; there is nothing to pay " +
            "right now.</div>"
          : "") +
        (C_TRUNCATED
          ? '<p class="msg">This covers the most recent ' + C_WEEK_LIMIT +
            " weeks on file. Write to support for anything older.</p>"
            : "") +
        /* Every payment we have a record of, so the subtraction above is not
           something the client has to take on trust. */
        (C_PAID.length
          ? '<div class="pays"><p class="pays__h">Payments received</p>' +
            C_PAID.map(function (p) {
              return '<div class="pays__r">' +
                '<span class="pays__d">' + esc(when(p.paid_on)) + "</span>" +
                '<span class="pays__m">' + esc(C_PAY_METHOD[p.method] || p.method) +
                  (p.reference ? " &middot; " + esc(p.reference) : "") + "</span>" +
                '<span class="pays__a">' + esc(cCents(p.amount_cents)) + "</span>" +
              "</div>";
            }).join("") +
            "</div>"
          : "") +
        /* Deliberately a marked gap rather than a button that looks live.
           A control that says "Pay" and does nothing is worse than no control:
           somebody presses it, believes the money moved, and stops chasing the
           invoice. The shape of this panel is also the thing a payment
           provider decides — Stripe's hosted page redirects away, its embedded
           form wants its own container — so the button arrives with the
           provider rather than before it. */
        '<div class="bill__pay">' +
          '<p class="bill__payh">Paying this</p>' +
          '<p class="bill__payp">Card payment is not switched on yet. For now we invoice you ' +
            "separately and you pay us the way we agreed on the call. When card payment is " +
            "live it appears here, and this total is the number it will charge. " +
            'Your <a href="/pay">payment page</a> has the same figure with the details on it.</p>' +
        "</div>"
      : '<p class="msg">Nothing to pay yet. Approved hours appear here as they come in.</p>') +
  "</div>";
}

/* ── arranging the interview: the client's half ────────────────────────────

   sql/057. Shown only while a placement is 'matched' — picked, and nobody has
   met yet. Once it is confirmed the card becomes the details; once the
   placement moves to 'trial' it goes entirely, because by then they have met.

   The card is one function with four states rather than four cards, because
   they are the same card at four moments and a client should watch it change
   rather than watch cards appear and disappear underneath each other. */
function interviewBlock(live) {
  var mine = C_SLOTS.filter(function (s) { return s.placement_id === live.id; });
  var st = slotState(mine);
  var who = "your assistant";
  for (var n = 0; n < C_NAMES.length; n++) {
    if (C_NAMES[n].application_id === live.application_id && C_NAMES[n].name) {
      who = C_NAMES[n].name;
    }
  }

  var head = '<div class="card" data-iv="' + esc(live.id) + '"><h2>' +
    (st.state === "confirmed" ? "Your interview" : "Arrange the interview") + "</h2>";

  /* ── it is on ── */
  if (st.confirmed) {
    var c = st.confirmed;
    return head +
      '<p class="msg" style="margin-top:0">This is set. We have told ' + esc(who) + " it is on.</p>" +
      '<div class="iv__meet">' +
        '<span class="iv__k">When</span><span class="iv__v">' + esc(slotLabel(c.starts_at)) +
          "</span>" +
        (slotAlso(c.starts_at, c.minutes)
          ? '<span class="iv__k">Also</span><span class="iv__v">' +
            esc(slotAlso(c.starts_at, c.minutes)) + "</span>"
          : "") +
        '<span class="iv__k">Who</span><span class="iv__v">' + esc(who) + "</span>" +
        '<span class="iv__k">Where</span><span class="iv__v">' +
          (c.meeting_url
            ? '<a href="' + esc(c.meeting_url) + '" rel="noopener noreferrer" target="_blank">' +
              esc(c.meeting_url) + "</a>"
            : "She will write to you at the address on this account.") +
        "</span>" +
      "</div>" +
      '<div class="edit__foot"><span class="hint">Something come up? Take this time back and ' +
        "offer others.</span>" +
        '<span class="edit__act"><span class="row__ok" data-iv-ok></span>' +
        '<button class="btn btn--ghost" data-iv-undo="' + esc(c.id) + '" type="button">' +
        "Change the time</button></span></div>" +
    "</div>";
  }

  var body = "";

  /* ── she has picked one ── */
  if (st.picked) {
    body +=
      '<p class="msg" style="margin-top:0">' + esc(who) + " has picked a time. Confirm it and we " +
        "will tell her it is on.</p>" +
      '<div class="iv__slots">' + slotRow(st.picked, "picked", "She picked this") + "</div>" +
      '<div class="iv__add" style="grid-template-columns:1fr auto">' +
        '<div class="fld"><label for="iv-link">Where you will meet ' +
          '<em>&mdash; optional</em></label>' +
          '<input id="iv-link" type="url" placeholder="https://meet.google.com/..." maxlength="500"></div>' +
        '<button class="btn btn--solid" data-iv-confirm="' + esc(st.picked.id) + '" type="button">' +
        "Confirm this time</button>" +
      "</div>" +
      '<p class="hint" style="margin-top:.7rem">Leave the link empty and we will give her the ' +
        "email address on this account instead, so she has a way to reach you either way.</p>" +
      '<div class="edit__foot"><span class="hint">Does that time not work after all?</span>' +
        '<span class="edit__act"><span class="row__ok" data-iv-ok></span>' +
        '<button class="btn btn--ghost" data-iv-drop="' + esc(st.picked.id) + '" type="button">' +
        "Take it back</button></span></div>";
    return head + body + "</div>";
  }

  /* ── none of them worked ── */
  if (st.state === "declined") {
    body += '<div class="note note--warn" style="margin-top:0"><b>None of those times worked for ' +
      esc(who) + ".</b> Offer some others and she will pick one. She is on American hours, so " +
      "your morning is usually her evening.</div>";
  } else if (st.slots.length) {
    body += '<p class="msg" style="margin-top:0">Offered to ' + esc(who) +
      ". She will pick one, then you confirm it.</p>" +
      '<div class="iv__slots">' +
        st.slots.map(function (s) { return slotRow(s, "", "Offered"); }).join("") +
      "</div>";
  } else {
    body += '<p class="msg" style="margin-top:0">' + esc(who) + " is matched to your seat. Offer " +
      "a few times that suit you and she will pick one. Twenty to thirty minutes is usually " +
      "plenty.</p>";
  }

  /* The proposer. Two offered times is the smallest number that is actually a
     choice, so the hint says so rather than letting somebody offer one and
     wonder why it reads as an instruction. */
  body +=
    '<div class="iv__add">' +
      '<div class="fld"><label for="iv-day">Another time</label>' +
        '<input id="iv-day" type="date" min="' + esc(todayLocal()) + '"></div>' +
      '<div class="fld"><label for="iv-at">Starting at</label>' +
        '<input id="iv-at" type="time" value="09:00"></div>' +
      '<div class="fld"><label for="iv-mins">For</label>' +
        '<select id="iv-mins">' +
          '<option value="20">20 minutes</option>' +
          '<option value="30" selected>30 minutes</option>' +
          '<option value="45">45 minutes</option>' +
          '<option value="60">an hour</option>' +
        "</select></div>" +
      '<button class="btn btn--ghost" data-iv-offer="' + esc(live.id) + '" type="button">Offer it</button>' +
    "</div>" +
    '<div class="edit__foot"><span class="hint">' +
      (st.slots.length < 2
        ? "Two or three times gives her a real choice. One is an instruction."
        : "She sees these in her own time zone, with yours beside them.") +
    '</span><span class="edit__act"><span class="row__ok" data-iv-ok></span></span></div>';

  return head + body + "</div>";
}

/* One row, shared by every state of the card above. */
function slotRow(s, cls, tag) {
  var also = slotAlso(s.starts_at, s.minutes);
  return '<div class="iv__slot' + (cls ? " iv__slot--" + cls : "") + '">' +
    '<span class="iv__mk"></span>' +
    "<span>" +
      '<span class="iv__d">' + esc(slotLabel(s.starts_at)) + "</span>" +
      (also ? '<span class="iv__z">' + esc(also) + "</span>" : "") +
    "</span>" +
    '<span class="iv__tag' + (cls === "picked" ? " iv__tag--go" : "") + '">' + esc(tag) + "</span>" +
    (cls === "" ? '<button class="lnk" data-iv-drop="' + esc(s.id) + '" type="button">Take back</button>' : "") +
  "</div>";
}

/* The date input's floor. Not todayCentral() — this one is about what the
   person in front of the browser may pick from their own calendar, and a
   client in California should not be told that this morning is in the past
   because Houston is two hours ahead of them. */
function todayLocal() {
  var d = new Date();
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function wireInterview() {
  var root = document.getElementById("pt-root");
  if (!root) return;

  root.addEventListener("click", function (e) {
    var card = e.target.closest("[data-iv]");
    if (!card) return;
    var ok = card.querySelector("[data-iv-ok]");

    var offer = e.target.closest("[data-iv-offer]");
    if (offer) { offerSlot(offer, card, ok); return; }

    var drop = e.target.closest("[data-iv-drop], [data-iv-undo]");
    if (drop) {
      var id = drop.getAttribute("data-iv-drop") || drop.getAttribute("data-iv-undo");
      var undo = !!drop.getAttribute("data-iv-undo");
      if (undo && !window.confirm(
            "Take this interview back?\\n\\nThe time stops being confirmed and you can offer " +
            "others. We will tell her it has changed.")) {
        return;
      }
      ivCall("rpc/withdraw_interview_slot", { slot: id }, drop, ok);
      return;
    }

    var conf = e.target.closest("[data-iv-confirm]");
    if (conf) {
      var link = document.getElementById("iv-link");
      var url = link ? link.value.trim() : "";
      if (url && !/^https?:\\/\\//i.test(url)) {
        ivFlash(ok, "A meeting link should start with https://", true);
        link.focus();
        return;
      }
      ivCall("rpc/confirm_interview", { slot: conf.getAttribute("data-iv-confirm"), url: url || null },
             conf, ok);
    }
  });
}

function offerSlot(btn, card, ok) {
  var day = document.getElementById("iv-day");
  var at = document.getElementById("iv-at");
  var mins = document.getElementById("iv-mins");
  if (!day || !at) return;

  if (!day.value) { ivFlash(ok, "Pick a day", true); day.focus(); return; }
  if (!at.value) { ivFlash(ok, "Pick a time", true); at.focus(); return; }

  /* Built from the parts in the reader's own browser and sent as an instant.
     new Date("2026-09-08T09:00") is local, which is what somebody typing into
     a date and a time field means — and toISOString then turns it into the
     moment that is, which is what the column holds. */
  var when_ = new Date(day.value + "T" + at.value);
  if (isNaN(when_)) { ivFlash(ok, "That is not a time we can read", true); return; }
  if (when_ < new Date()) { ivFlash(ok, "That time has already passed", true); return; }

  ivCall("rpc/offer_interview", {
    placement: btn.getAttribute("data-iv-offer"),
    at_time: when_.toISOString(),
    mins: Number(mins && mins.value) || 30
  }, btn, ok);
}

/* One path for all five, because they fail the same way and every one of them
   ends with the page being redrawn from what the database now says rather than
   from what this browser thinks it just did. */
function ivCall(fn, body, btn, ok) {
  btn.disabled = true;
  ivFlash(ok, "Saving…");
  api(fn, { method: "POST", body: body })
    .then(function () { location.reload(); })
    .catch(function (e) {
      btn.disabled = false;
      ivFlash(ok, ivWhy(e), true);
    });
}

function ivFlash(el, text, bad) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-bad", !!bad);
  el.classList.add("is-on");
  clearTimeout(el._t);
  if (!bad) el._t = setTimeout(function () { el.classList.remove("is-on"); }, 1600);
}

/* The messages these functions raise are written to be read by the person who
   caused them — "she has not picked that time", "that time has already
   passed" — so they are shown rather than swallowed behind "did not save". */
function ivWhy(e) {
  var t = String((e && e.message) || e || "");
  if (t === "signed out") return "Signed out — reload and sign in again";
  try {
    var j = JSON.parse(t);
    return (j.message || t).replace(/^ERROR:\\s*/i, "").slice(0, 180);
  } catch (x) {}
  return t.slice(0, 180) || "That did not save";
}

function placeBlock(live, k) {
  /* Every id below carries this, because there are now several of these on the
     page and an id that appears twice is a control that operates on somebody
     else's placement. Where a label does not need to point at it, the hook is
     a data attribute scoped to the section instead. */
  var sfx = "-" + k;

  /* Matched up here rather than embedded — see loadClient for why that embed
     was a 400 and what it cost. */
  var who = "your assistant";
  for (var n = 0; n < C_NAMES.length; n++) {
    if (C_NAMES[n].application_id === live.application_id && C_NAMES[n].name) {
      who = C_NAMES[n].name;
      break;
    }
  }
  var rate = C_RATE[live.id];
  var mine = C_WEEKS.filter(function (w) { return w.placement_id === live.id; });
  var waiting = mine.filter(function (w) { return w.status === "submitted"; });
  var agreed = mine.filter(function (w) { return w.status === "approved"; });
  var asked = C_SWAPS.filter(function (s) {
    return s.placement_id === live.id && s.status === "open";
  });

  var html =
    '<section data-place-block="' + esc(live.id) + '">' +
    '<div class="card">' +
      '<div class="row__top"><span><span class="row__n">' + esc(who) + "</span>" +
        '<span class="row__meta"> &middot; ' +
          (live.started_on ? "with you since " + esc(when(live.started_on)) + " &middot; " : "") +
          esc(live.hours_per_week) + " hours a week</span></span>" +
        '<span class="pill pill--pl_' + esc(live.status) + '">' +
          esc(C_LABEL[live.status] || live.status) + "</span></div>" +
    "</div>";

  /* ── when the work starts ──
     042. started_on is a proposal until the client says otherwise: at matching
     nobody has met yet, and the trial — and therefore the first week anybody
     pays for — is counted from it. So it is asked rather than assumed, and
     asked of the only person who knows. */
  var said = null;
  for (var j = 0; j < C_STARTS.length; j++) {
    if (C_STARTS[j].placement_id === live.id) { said = C_STARTS[j]; break; }
  }
  /* Also drawn on trial, as details rather than as a form: the meeting is
     often still ahead of the day they said yes, and a card that vanishes the
     moment a client presses Accept takes the joining link with it. */
  if (live.status === "matched" ||
      (live.status === "trial" && C_SLOTS.some(function (x) {
        return x.placement_id === live.id && x.confirmed_at;
      }))) {
    html += interviewBlock(live);
  }

  if (live.status === "matched") {
    html +=
      '<div class="card">' +
        "<h2>When can they start?</h2>" +
        (said
          ? '<div class="note"><b>You said ' + esc(when(said.starts_on)) + ".</b> " +
            esc(who.split(" ")[0]) + " has been told, and the trial runs from that day.</div>"
          : '<p class="msg" style="margin-top:0">We have pencilled in <b>' +
              esc(when(live.started_on) || "a date to agree") + "</b>. Confirm it, or give us " +
              "the day that actually suits you &mdash; the trial is counted from the day work " +
              "begins, so this is the date your free weeks run from.</p>" +
            '<div class="fld"><label for="c-when' + sfx + '">First day</label>' +
              '<input id="c-when' + sfx + '" data-start-when type="date"' +
              (live.started_on ? ' value="' + esc(live.started_on) + '"' : "") + "></div>" +
            '<p class="err" data-start-err aria-live="polite"></p>' +
            '<div class="edit__foot"><span></span><span class="edit__act">' +
              '<span class="row__ok" data-start-ok></span>' +
              '<button class="btn btn--solid" data-start-go type="button" data-place="' +
                esc(live.id) + '">That is the day</button>' +
            "</span></div>") +
      "</div>";
  }

  /* ── the week waiting on them ── */
  html +=
    '<div class="card" data-weeks>' +
      "<h2>Hours</h2>" +
      (waiting.length
        ? '<p class="msg" style="margin-top:0">' + waiting.length +
          (waiting.length === 1 ? " week is" : " weeks are") +
          " waiting on you. Approved hours are what goes on your statement.</p>"
        : '<p class="msg" style="margin-top:0">Nothing waiting on you just now.</p>') +
      (mine.length
        ? '<div class="rows">' + mine.slice(0, 8).map(function (w) {
            var h = cHours(w);
            return '<div class="row" data-week="' + esc(w.id) + '">' +
              '<div class="row__top"><span><span class="row__n">' +
                esc(cWeekLabel(w.week_starts_on)) + "</span></span>" +
                '<span class="pill pill--ts_' + esc(w.status) + '">' +
                  esc(w.status === "submitted" ? "waiting on you" : w.status) + "</span>" +
                '<span class="row__tot">' + esc(cNum(h)) + " h" +
                  (w.trial_week
                    ? ' &middot; <span style="color:var(--muted);font-weight:400">free &mdash; trial</span>'
                    : rate !== undefined ? " &middot; " + esc(cMoney(h * rate)) : "") +
                "</span></div>" +
              cDays(w) +
              (w.status === "submitted"
                ? '<div class="row__ctl">' +
                    '<textarea data-c-why rows="1" aria-label="Why this week is going back" ' +
                      'placeholder="If you are sending it back, say what needs fixing"></textarea>' +
                    '<button class="btn btn--solid" data-c-yes type="button" style="padding:.45rem .8rem;font-size:.85rem">Approve these hours</button>' +
                    '<button class="btn btn--ghost" data-c-no type="button" style="padding:.45rem .8rem;font-size:.85rem">Something looks wrong</button>' +
                    '<span class="row__ok" data-c-ok></span>' +
                  "</div>"
                : "") +
            "</div>";
          }).join("") + "</div>"
        : '<p class="msg">No hours have been sent to you yet.</p>') +
    "</div>";

  /* ── what it comes to ──
     Called a statement rather than an invoice, deliberately. Same numbers, no
     invoice number and no payment terms: it is what the approved hours add up
     to, not a demand. */
  if (rate !== undefined) {
    /* The trial is what we spend to win the placement. Those weeks are
       approved, real and paid — by us — and they do not reach this total. */
    var billable = agreed.filter(function (w) { return !w.trial_week; });
    var onUs = agreed.filter(function (w) { return w.trial_week; });
    var total = 0;
    billable.forEach(function (w) { total += cHours(w) * rate; });
    html +=
      '<div class="card">' +
        "<h2>Your statement</h2>" +
        '<p class="msg" style="margin-top:0">What the hours you have approved come to. ' +
          "This is a running total rather than a bill &mdash; we invoice you separately.</p>" +
        '<ul class="meta">' +
          "<li><b>Chargeable hours</b><span>" +
            esc(cNum(billable.reduce(function (t, w) { return t + cHours(w); }, 0))) + "</span></li>" +
          /* Shown rather than quietly left out. A client who adds up the weeks
             above and gets a different number to the total has been given a
             puzzle instead of a statement. */
          (onUs.length
            ? "<li><b>Trial hours</b><span>" +
              esc(cNum(onUs.reduce(function (t, w) { return t + cHours(w); }, 0))) +
              " &mdash; free, we cover the trial</span></li>"
            : "") +
          "<li><b>Rate</b><span>" + esc(cMoney(rate)) + " an hour</span></li>" +
          "<li><b>Comes to</b><span>" + esc(cMoney(total)) + "</span></li>" +
        "</ul>" +
        /* Said out loud rather than left to be discovered. The weeks are read
           with a limit, so a placement old enough to reach it has approved
           weeks that are not in this total — and a running total that quietly
           starts falling as the oldest weeks drop off the end is worse than no
           total at all. */
        (C_TRUNCATED
          ? '<p class="msg">This covers the most recent ' + C_WEEK_LIMIT +
            " weeks on file. Older approved weeks are not included &mdash; " +
            'write to <a href="mailto:support@securejobva.com">support@securejobva.com</a> ' +
            "for the full history.</p>"
          : "") +
      "</div>";
  } else if (live.status === "trial" || live.status === "ongoing") {
    /* The card used to be omitted when no rate had been set, which is the one
       case where a client most needs to be told something. 032 stores the rate
       in its own row and /admin can leave that row unwritten — the match form
       says so in as many words when it fails. So the hours appeared, the
       statement did not, and nothing on the page accounted for the gap. */
    html +=
      '<div class="card">' +
        "<h2>Your statement</h2>" +
        '<div class="note note--warn"><b>We have not finished setting up your rate.</b> ' +
          esc(who.split(" ")[0]) + "&rsquo;s hours are being recorded and nothing is lost &mdash; " +
          "the statement appears here as soon as the rate is on your account. " +
          'If that is not within a day, write to <a href="mailto:support@securejobva.com">' +
          "support@securejobva.com</a>.</div>" +
      "</div>";
  }

  /* ── asking for somebody different ── */
  html +=
    '<div class="card">' +
      "<h2>Not working out?</h2>" +
      (asked.length
        ? '<div class="note"><b>You have asked us for somebody different.</b> ' +
          "We are on it, and we will come back to you. Nothing changes in the meantime &mdash; " +
          esc(who.split(" ")[0]) + " is still working and you are billed as normal.</div>"
        : '<p class="msg" style="margin-top:0">Tell us what is not working and we will find you ' +
          "somebody else. Nothing changes today: " + esc(who.split(" ")[0]) +
          " keeps working and you keep being billed as normal until a replacement is agreed with you.</p>" +
          '<div class="fld"><label for="c-why' + sfx + '">What is not working?</label>' +
            '<textarea id="c-why' + sfx + '" data-swap-why rows="3"></textarea></div>' +
          '<p class="err" data-swap-err aria-live="polite"></p>' +
          '<div class="edit__foot"><span></span><span class="edit__act">' +
            '<span class="row__ok" data-swap-ok></span>' +
            '<button class="btn btn--ghost" data-swap-go type="button" data-place="' +
              esc(live.id) + '">Ask for a different assistant</button>' +
          "</span></div>") +
    "</div>" +
    "</section>";

  return html;
}

/* Wired per section rather than per page.

   Every lookup in here used to be a getElementById against a fixed id, which
   was right while exactly one placement could ever be drawn. Now that a client
   may have several, a fixed id is a control that operates on the first
   placement on the page whichever one you clicked — the worst kind of wrong,
   because it does something and it looks like it worked.

   So the section is found first and every control is looked up inside it.
   Nothing here reaches out to the document. */
function wireClient() {
  wireInterview();
  var blocks = document.querySelectorAll("[data-place-block]");
  Array.prototype.forEach.call(blocks, function (sec) {
    wireWeeks(sec);
    wireStart(sec);
    wireSwap(sec);
  });
}

function wireWeeks(sec) {
  var box = sec.querySelector("[data-weeks]");
  if (!box) return;
  box.querySelectorAll("[data-c-yes], [data-c-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-week]");
      var ok = row.querySelector("[data-c-ok]");
      var yes = b.hasAttribute("data-c-yes");
      var whyEl = row.querySelector("[data-c-why]");
      var note = whyEl.value.trim();
      if (!yes && !note) {
        ok.textContent = "Say what needs fixing — that is the whole message";
        ok.classList.add("is-on", "is-bad");
        whyEl.focus();
        return;
      }
      /* Both buttons on the row, not only the one pressed. A second click
         while the first is in flight sends a PATCH the policy refuses — the
         row is no longer 'submitted' — and PostgREST answers that 204 with
         nothing changed, so it reads as success and reloads over the top of
         one. Harmless, and it should still not be reachable. */
      var pair = row.querySelectorAll("[data-c-yes], [data-c-no]");
      Array.prototype.forEach.call(pair, function (x) { x.disabled = true; });

      ok.classList.remove("is-bad");
      ok.textContent = "Saving…";
      ok.classList.add("is-on");
      api("timesheets?id=eq." + encodeURIComponent(row.getAttribute("data-week")), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        /* The note reaches the assistant now. Until sql/046 the trigger from
           030 put it back to whatever it had been for anybody without
           applications.edit — which is every client — so this field was
           required by the form above, sent, discarded before it was stored,
           and then left out of the email telling her a week needed changing. */
        body: yes ? { status: "approved" } : { status: "returned", note: note }
      }).then(function () { location.reload(); })
        .catch(function (e) {
          Array.prototype.forEach.call(pair, function (x) { x.disabled = false; });
          ok.textContent = "Did not save";
          ok.classList.add("is-bad");
        });
    });
  });
}

function wireStart(sec) {
  var startGo = sec.querySelector("[data-start-go]");
  if (!startGo) return;
  startGo.addEventListener("click", function () {
    var when_ = sec.querySelector("[data-start-when]");
    var err = sec.querySelector("[data-start-err]");
    var ok = sec.querySelector("[data-start-ok]");
    err.textContent = "";
    if (!when_.value) {
      err.textContent = "Pick the first day and we will set everything from it.";
      when_.focus();
      return;
    }
    startGo.disabled = true;
    ok.textContent = "Saving…";
    ok.classList.add("is-on");
    /* confirmed_by is not sent and is not grantable — the trigger stamps it
       from the token, because a field the browser fills is a field the
       browser can lie about, and this is the record of who agreed a date. */
    api("placement_starts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { placement_id: startGo.getAttribute("data-place"), starts_on: when_.value }
    }).then(function () { location.reload(); })
      .catch(function (e) {
        startGo.disabled = false;
        ok.classList.remove("is-on");
        err.textContent = why(e);
      });
  });
}

function wireSwap(sec) {
  var go = sec.querySelector("[data-swap-go]");
  if (!go) return;
  go.addEventListener("click", function () {
    var reason = sec.querySelector("[data-swap-why]");
    var err = sec.querySelector("[data-swap-err]");
    var ok = sec.querySelector("[data-swap-ok]");
    err.textContent = "";
    if (!reason.value.trim()) {
      err.textContent = "Tell us what is not working — that is what we go on.";
      reason.focus();
      return;
    }
    go.disabled = true;
    ok.textContent = "Sending…";
    ok.classList.add("is-on");
    api("swap_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { placement_id: go.getAttribute("data-place"), reason: reason.value.trim() }
    }).then(function () { location.reload(); })
      .catch(function (e) {
        go.disabled = false;
        ok.textContent = "Did not send";
        ok.classList.add("is-bad");
      });
  });
}
`;

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
      /* go-staff, not go: the shared signedOut() in LIB also builds a #go, and
         although this function shadows it so only one ever renders, two of the
         same id in one file is a real smell and the audit is right to say so.

         This page keeps its own sign-in deliberately. /hub and /seats gained
         email and password because people who cannot use Google were locked
         out of their own portals; the staff desk is the opposite case — it is
         the most privileged page here, access is granted by an administrator
         rather than asked for, and one narrow door is the point. */
      '<button class="gbtn" id="go-staff" type="button">Sign in with Google</button>'
    )
  );
  document.getElementById("go-staff").addEventListener("click", signIn);
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

/* ── removing somebody, and the file that goes with them ──────────────────

   Closed, and one line high. The stakes are not the same as Add note and the
   control should not be the same size as Add note — a red button sitting in
   that strip is one somebody eventually presses while reaching past it.

   To turn an applicant down you set the stage to declined. This is the other
   thing entirely: somebody has asked to be forgotten, and until sql/060 the
   only way to honour that was a hand-written DO block in the SQL editor. */
function forgetBlock() {
  return (
    '<div class="forget" data-forget>' +
      '<button class="lnk lnk--stop" data-forget-open type="button">' +
        "Remove this person entirely&hellip;</button>" +
    "</div>"
  );
}

/* The row on screen back to the record it was drawn from. save() already goes
   the same way round, by data-id, and this is the read-only half of it. */
function byRow(row) {
  var id = row.getAttribute("data-id");
  for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
  return { id: id, name: "", email: "" };
}

/* Counted when the panel opens rather than when the page loaded, because by
   the time somebody is reading this they are deciding on the strength of it.
   A table that is not there yet answers null and prints as a question mark:
   a zero would be a claim, and the honest answer is that we do not know. */
function forgetCounts(id) {
  var one = function (t) {
    return api(t + "?select=application_id&application_id=eq." + encodeURIComponent(id))
      .then(function (r) { return (r || []).length; })
      ["catch"](function () { return null; });
  };
  return Promise.all([
    one("application_notes"),
    one("application_disc"),
    one("application_assessment"),
    one("timesheets"),
    one("placements"),
    api("application_documents?select=id,path,filename&application_id=eq." + encodeURIComponent(id))
      ["catch"](function () { return []; })
  ]).then(function (r) {
    return { notes: r[0], disc: r[1], sit: r[2], weeks: r[3], places: r[4], docs: r[5] || [] };
  });
}

function openForget(row, a) {
  var box = row.querySelector("[data-forget]");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Counting what would go&hellip;';
  var who = a.name || a.email || "this person";
  forgetCounts(a.id).then(function (c) {
    var n = function (v) { return v === null ? "?" : String(v); };
    var s = function (v, one, many) { return v === 1 ? one : many; };
    box.innerHTML =
      '<div class="danger">' +
        '<p class="danger__t">Remove ' + esc(who) + " entirely</p>" +
        "<p>Everything below goes with them, in one action, and none of it comes back. " +
        "Use this when somebody asks to be forgotten &mdash; not to tidy the queue. To turn " +
        "an applicant down, set the stage to <b>declined</b>: they keep their record and may " +
        "apply again in three months.</p>" +
        '<ul class="goes">' +
          "<li><b>1</b> application</li>" +
          "<li><b>" + n(c.notes) + "</b> private " + s(c.notes, "note", "notes") + "</li>" +
          "<li><b>" + n(c.disc) + "</b> strengths " + s(c.disc, "questionnaire", "questionnaires") + "</li>" +
          "<li><b>" + n(c.sit) + "</b> " + s(c.sit, "assessment", "assessments") + "</li>" +
          "<li><b>" + n(c.weeks) + "</b> " + s(c.weeks, "week", "weeks") + " filed</li>" +
          "<li><b>" + n(c.places) + "</b> " + s(c.places, "placement", "placements") + "</li>" +
          '<li class="' + (c.docs.length ? "is-file" : "") + '"><b>' + c.docs.length + "</b> " +
            s(c.docs.length, "file", "files") + ", bytes and all</li>" +
        "</ul>" +
        '<div class="type">' +
          '<input type="text" data-forget-name autocomplete="off" spellcheck="false" ' +
            'placeholder="Type their name to confirm" aria-label="Type the name to confirm">' +
          '<button class="btn btn--stop" data-forget-go type="button" disabled>Remove ' +
            esc(who) + "</button>" +
        "</div>" +
        '<span class="hint" data-forget-say>Counted just now, not when the page loaded. ' +
          "The name has to match.</span>" +
      "</div>";
    box.setAttribute("data-forget-want", String(who).trim().toLowerCase());
    box.setAttribute("data-forget-docs", JSON.stringify(c.docs.map(function (d) { return d.path; })));
  })["catch"](function (e) {
    box.innerHTML = '<p class="msg msg--bad">Could not count what would go: ' + esc(why(e)) + "</p>";
  });
}

/* The row first, then the files, and that order is not arbitrary. If the row
   goes and a file will not, the orphan panel still knows the file is there and
   says so. Do it the other way round and a failure on the row leaves a CV
   destroyed for an application that still exists. */
function doForget(row, a, go) {
  var box = row.querySelector("[data-forget]");
  var say = box.querySelector("[data-forget-say]");
  var who = a.name || a.email || "this person";
  var paths = [];
  try { paths = JSON.parse(box.getAttribute("data-forget-docs") || "[]"); } catch (e) { paths = []; }
  go.disabled = true;
  say.textContent = "Removing\u2026";

  api("applications?id=eq." + encodeURIComponent(a.id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).then(function () {
    if (!paths.length) return { ok: 0, bad: 0 };
    return liveSession().then(function (sess) {
      if (!sess) throw new Error("signed out");
      var ok = 0, bad = 0;
      return paths.reduce(function (chain, p) {
        return chain.then(function () {
          return fetch(storageBase() + "/object/applicant-docs/" +
                       p.split("/").map(encodeURIComponent).join("/"), {
            method: "DELETE",
            headers: { apikey: ANON, Authorization: "Bearer " + sess.access_token }
          }).then(function (r) { if (r.ok) { ok++; } else { bad++; } })
            ["catch"](function () { bad++; });
        });
      }, Promise.resolve()).then(function () { return { ok: ok, bad: bad }; });
    });
  }).then(function (f) {
    /* Two outcomes, reported separately. One tick covering both would mean a
       tick that is sometimes half true, and the half it hides is the person's
       CV still sitting in a bucket. */
    box.innerHTML =
      '<div class="danger">' +
        '<p class="danger__t">' + esc(who) + " is gone.</p>" +
        "<p>The application and everything under it &mdash; removed." +
        (paths.length
          ? (f.bad
              ? "<br><b>" + f.bad + " " + (f.bad === 1 ? "file" : "files") +
                " could not be removed.</b> They are still in the bucket. Clear them under " +
                "<b>Files with no application</b> on the Inbox tab."
              : "<br>" + f.ok + " " + (f.ok === 1 ? "file" : "files") + " &mdash; removed too.")
          : "<br>There were no files to remove.") +
        "</p>" +
      "</div>";
    /* Out of the list as well, after long enough to read the result. Leaving
       them on screen would be the page disagreeing with the database. */
    setTimeout(function () {
      ALL = ALL.filter(function (x) { return x.id !== a.id; });
      paint();
    }, 3200);
  })["catch"](function (e) {
    go.disabled = false;
    say.textContent = "Did not remove it: " + why(e);
  });
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
        (can("applications.edit") ? forgetBlock() : "") +
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
      sitLine(a) +
      docList(a.docs) +
      contactLine(a) +
      scoreLine(a) +
      social +
      ctl +
    "</div>"
  );
}

/* ── the assessment, which nothing in here used to show ──────────────────
   045 built an assessment that scores itself, reaches a verdict and moves
   somebody to Interview, and no screen in /admin ever showed the result. You
   saw a stage change and nothing about why. This is that screen.

   Two boxes on it matter, and neither is decoration: until somebody types what
   the typing proof actually says, and what the writing was worth, sql/049
   holds the verdict at 'in_progress'. That is not a failure — it is the row
   saying it is waiting on us rather than on her. */
function sitLine(a) {
  var s = a.sit;
  if (!s || !s.submitted_at) return "";

  var need = [];
  if (s.typing_verified_wpm === null || s.typing_verified_wpm === undefined) need.push("the typing checked");
  if (s.written_score === null || s.written_score === undefined) need.push("the writing marked");

  /* Which measures decide this track. A Customer Service applicant is not held
     back by a sales score she was never asked to earn, so the ones that do not
     gate her are shown greyed rather than hidden — the number is still worth
     seeing, it just is not deciding anything. */
  var axes = (s.track === "Admin Tasks") ? ["english", "detail"]
           : (s.track === "Sales & Marketing") ? ["english", "sales", "customer"]
           : ["english", "customer"];
  var gates = function (k) { return axes.indexOf(k) > -1; };

  var score = function (label, v, on) {
    if (v === null || v === undefined) return "";
    var cls = on ? (v >= 7 ? "sit__ok" : "sit__low") : "sit__off";
    return '<span class="sit__s ' + cls + '">' + label + " <b>" + esc(v) + "</b>/10" +
      (on ? "" : " &middot; not gating") + "</span>";
  };

  var claimed = (s.typing_wpm === null || s.typing_wpm === undefined)
    ? "nothing yet"
    : esc(s.typing_wpm) + " wpm at " + esc(s.typing_accuracy) + "%";

  var num = function (v) {
    return (v === null || v === undefined) ? "" : esc(v);
  };

  return '<div class="sit" data-sit="' + esc(a.id) + '">' +
    '<div class="sit__hd"><b>Assessment</b>' +
      '<span class="sit__meta">' + esc(s.track || "") + " &middot; sent " + esc(when(s.submitted_at)) + "</span>" +
      (need.length
        ? '<span class="sit__wait">waiting on ' + esc(need.join(" and ")) + "</span>"
        : '<span class="sit__v sit__v--' + esc(s.verdict) + '">' +
          esc(s.verdict === "passed" ? "passed"
            : s.verdict === "below_line" ? "below the line" : "in progress") + "</span>") +
    "</div>" +

    '<div class="sit__row">' +
      score("English", s.score_english, gates("english")) +
      score("Judgement", s.score_scenarios, gates("customer")) +
      score("Detail", s.score_detail, gates("detail")) +
      score("Sales", s.score_sales, gates("sales")) +
    "</div>" +

    '<div class="sit__row">' +
      '<span class="sit__lab">She says</span>' +
      '<span class="sit__claim">' + claimed + "</span>" +
      (s.typing_proof
        ? '<a class="sit__lnk" href="' + esc(s.typing_proof) +
          '" target="_blank" rel="noopener noreferrer">open her proof</a>'
        : '<span class="sit__off">no proof sent</span>') +
      (s.connection_proof
        ? '<a class="sit__lnk" href="' + esc(s.connection_proof) +
          '" target="_blank" rel="noopener noreferrer">speed test</a>'
        : '<span class="sit__off">no speed test</span>') +
    "</div>" +

    '<div class="sit__row">' +
      '<span class="sit__lab">You read</span>' +
      '<input class="sit__in" data-vw type="number" min="0" max="250" placeholder="wpm" ' +
        'aria-label="Words per minute you read off the proof" value="' + num(s.typing_verified_wpm) + '">' +
      '<input class="sit__in" data-va type="number" min="0" max="100" placeholder="%" ' +
        'aria-label="Accuracy you read off the proof" value="' + num(s.typing_verified_accuracy) + '">' +
      (s.typing_verified_by
        ? '<span class="sit__off">checked by ' + esc(s.typing_verified_by) + "</span>"
        : "") +
    "</div>" +

    '<div class="sit__row">' +
      '<span class="sit__lab">Her writing</span>' +
      (s.written_reply
        ? '<button class="btn btn--ghost sit__btn" data-read type="button">Read her reply</button>'
        : '<span class="sit__off">nothing written</span>') +
      '<input class="sit__in" data-ws type="number" min="0" max="10" placeholder="/10" ' +
        'aria-label="Mark for the written reply, out of ten" value="' + num(s.written_score) + '">' +
      '<button class="btn btn--solid sit__btn" data-sit-save type="button">Save</button>' +
      '<span class="row__ok" data-sit-ok></span>' +
    "</div>" +

    (s.written_reply
      ? '<div class="sit__reply" hidden>' + esc(s.written_reply) + "</div>"
      : "") +

    /* Two of her own answers, named for whoever runs the interview. Somebody
       who chose an answer can say why she chose it. Somebody handed it by a
       chatbot cannot, and this is the only defence against that which the
       research says actually works. */
    (s.scenario_answers
      ? '<p class="sit__ask">In the interview, ask her about <b>judgement 8</b> ' +
        "(the file with other customers&rsquo; details) and <b>judgement 12</b> " +
        "(blocked at the end of the day).</p>"
      : "") +
  "</div>";
}

/* Saving the two things a person decides. Nothing else on this panel is
   writable: every score came from the trigger, and the two stamps recording
   who checked the typing are not granted to anybody. */
function wireSit(box) {
  box.querySelectorAll("[data-read]").forEach(function (b) {
    b.addEventListener("click", function () {
      var wrap = b.closest("[data-sit]");
      var reply = wrap.querySelector(".sit__reply");
      if (!reply) return;
      reply.hidden = !reply.hidden;
      b.textContent = reply.hidden ? "Read her reply" : "Hide her reply";
    });
  });

  box.querySelectorAll("[data-sit-save]").forEach(function (b) {
    b.addEventListener("click", function () {
      var wrap = b.closest("[data-sit]");
      var id = wrap.getAttribute("data-sit");
      var ok = wrap.querySelector("[data-sit-ok]");
      var vw = wrap.querySelector("[data-vw]").value;
      var va = wrap.querySelector("[data-va]").value;
      var ws = wrap.querySelector("[data-ws]").value;

      /* An empty box means "not checked yet" rather than zero, which is the
         difference between a verdict that waits and a verdict that fails
         somebody on a number nobody typed. */
      var body = {
        typing_verified_wpm: vw === "" ? null : Number(vw),
        typing_verified_accuracy: va === "" ? null : Number(va),
        written_score: ws === "" ? null : Number(ws)
      };
      if (body.written_score !== null && !(body.written_score >= 0 && body.written_score <= 10)) {
        flash(ok, "The written mark is out of 10", true);
        return;
      }
      if (body.typing_verified_wpm !== null &&
          !(body.typing_verified_wpm >= 0 && body.typing_verified_wpm <= 250)) {
        flash(ok, "That is not a words-per-minute figure", true);
        return;
      }

      b.disabled = true;
      flash(ok, "Saving…");
      api("application_assessment?application_id=eq." + encodeURIComponent(id), {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: body
      }).then(function () {
        /* Reloaded rather than patched in place: writing these re-runs the
           scoring, so the verdict and every axis on screen may have just
           changed and the page should not be showing the old ones. */
        location.reload();
      }).catch(function (e) {
        b.disabled = false;
        flash(ok, why(e), true);
      });
    });
  });
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
/* Today, in the company's own time, which is Central.

   Two bugs in one line, and the second only showed up once the first was
   fixed. ended_on was being written with toISOString().slice(0, 10) — the same
   trap the two functions above exist to avoid — so from Houston any save after
   about six in the evening recorded tomorrow's date. That matters because
   ended_on decides which weeks a placement covers, in timesheet_placement()
   and again in adopt_orphan_weeks().

   Reading the browser's own clock fixed that for you and quietly broke it for
   anybody else: an assistant or a contractor opening /admin from Manila is
   most of a day ahead, and would stamp a placement with a date the business
   had not reached yet. The business runs on Central, so this asks for Central
   by name and gets the same answer wherever the person is sitting.

   en-CA because it formats as YYYY-MM-DD, which is the shape a date column
   wants. Falls back to the local clock if the runtime has no timezone data,
   which is strictly better than the UTC it replaced. */
var COMPANY_TZ = "America/Chicago";

function todayCentral() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: COMPANY_TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  } catch (e) {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
}
function whenTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, tzOpts({
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit"
  }));
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
    accts:   s('<path d="M12 3.5l7 3.2v5.6c0 4.2-2.8 7.2-7 8.2-4.2-1-7-4-7-8.2V6.7z"></path>'),
    hours:   s('<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5.2l3.3 2"></path>'),
    place:   s('<path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.6"></circle>')
  };
})();

/* A count on a rail item, or nothing at all when there is nothing to say. A
   badge showing 0 is noise pretending to be information. */
function badge(id, n) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = n ? String(n) : "";
  el.classList.toggle("is-warn",
    id === "tab-unread" || id === "tab-leave" || id === "tab-hours" || id === "tab-place"
      ? !!n : false);
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
    /* The rail button's text is its label plus its badge count — "Messages1",
       "Seats3" — so the count is stripped before it becomes a heading.

       The backslash is doubled because this script is built inside a template
       literal, which eats one on the way out. Written singly it shipped as a
       pattern stripping trailing letter d's, leaving every digit exactly where
       it was — so each tab carrying a badge showed its count welded to its own
       title. Applications escaped it only because that heading is written in
       the static markup and never comes through here. */
    if (top) top.textContent = b.textContent.replace(/\\d+$/, "").trim();
    if (k) {
      var grp = b.previousElementSibling;
      while (grp && !grp.classList.contains("rail__k")) grp = grp.previousElementSibling;
      k.textContent = grp ? grp.textContent : "";
    }
    /* The bar and the backlog number belong to the queue, not to every tab.
       Both sit outside .adm__canvas, so the pane switch below never reached
       them: Clients opened with a search for "name, email, country, region,
       track", four applicant filters, a 4 of 4 count and an Export CSV that
       hands you the applicant queue — under a heading reading Clients, and
       beside a 4 waiting on you that was never about clients at all. */
    var isApps = want === "apps";
    var qbar = document.querySelector(".adm__bar");
    if (qbar) qbar.hidden = !isApps;
    var topn = document.querySelector(".adm__topn");
    if (topn) topn.hidden = !isApps;
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
        /* Status alone. sql/050 revoked decided_at and decided_by and stamps
           them from the verified session instead, so sending either would now
           be refused — and that is the point: a timesheet has always recorded
           who approved it that way, and leave was the same shape with a
           different answer. */
        body: { status: yes ? "approved" : "declined" }
      }).then(loadLeave)
        .catch(function (e) { flash(ok, why(e), true); });
    });
  });
}

/* ── timesheets ──
   The other half of /hub's fourth tile. Drafts are excluded: a week somebody
   is still filling in is not waiting on anybody, and a queue that shows it
   says three people need you when none of them do. */
var TS_D = ["M", "T", "W", "T", "F", "S", "S"];
var TS_LABEL = { submitted: "waiting", approved: "approved", returned: "sent back" };

function tsNum(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\\.$/, "");
}

function tsTotal(r) {
  var ds = r.timesheet_days || [], t = 0;
  for (var i = 0; i < ds.length; i++) t += Number(ds[i].hours || 0);
  return t;
}

/* Seven boxes, in the order they were worked, printed whether or not anything
   was entered. A missing Wednesday and a Wednesday with 0 in it look the same
   on a total and mean different things, and 16 hours on a Thursday is only
   visible if Thursday is on the screen. */
function tsBreak(r) {
  var by = {};
  (r.timesheet_days || []).forEach(function (d) { by[d.worked_on] = Number(d.hours || 0); });
  var p = String(r.week_starts_on).split("-");
  var out = "";
  for (var i = 0; i < 7; i++) {
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + i);
    var m = d.getMonth() + 1, day = d.getDate();
    var iso = d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
    var h = by[iso] || 0;
    out += '<i class="' + (h ? "" : "z") + '">' + TS_D[i] + " " + esc(tsNum(h)) + "</i>";
  }
  return '<div class="bd">' + out + "</div>";
}

function loadTimesheets() {
  var box = document.getElementById("ts-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading timesheets&hellip;';
  api("timesheets?select=id,application_id,week_starts_on,status,note,submitted_at," +
      "decided_at,decided_by,timesheet_days(worked_on,hours,note)" +
      "&status=neq.draft&order=week_starts_on.desc")
    .then(function (rows) { drawTimesheets(box, rows || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="msg msg--bad">Could not load timesheets: ' + esc(why(e)) + "</p>";
    });
}

function drawTimesheets(box, rows) {
  var byId = {};
  ALL.forEach(function (a) { byId[a.id] = a; });

  var waiting = rows.filter(function (r) { return r.status === "submitted"; });
  badge("tab-hours", waiting.length);

  box.innerHTML =
    "<h2>Timesheets</h2>" +
    (rows.length
      ? '<p class="msg" style="margin-top:0">' +
          (waiting.length ? waiting.length + " waiting on you." : "Nothing waiting.") + "</p>" +
        '<div class="rows">' + rows.map(function (r) {
          var a = byId[r.application_id];
          return '<div class="row" data-ts="' + esc(r.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(a ? a.name : "Unknown assistant") + "</span>" +
              '<span class="row__meta"> &middot; week of ' + esc(when(r.week_starts_on)) + "</span>" +
            "</span>" +
            '<span class="pill pill--ts_' + esc(r.status) + '">' +
              esc(TS_LABEL[r.status] || r.status) + "</span>" +
            '<span class="row__tot">' + esc(tsNum(tsTotal(r))) + " / 40 h</span></div>" +
            tsBreak(r) +
            (r.status === "submitted"
              ? '<div class="row__ctl">' +
                  '<textarea data-ts-why rows="1" aria-label="Why this week is going back" ' +
                    'placeholder="If you are sending it back, say what needs fixing"></textarea>' +
                  '<button class="btn btn--solid" data-ts-yes type="button" style="padding:.45rem .8rem;font-size:.85rem">Approve</button>' +
                  '<button class="btn btn--ghost" data-ts-no type="button" style="padding:.45rem .8rem;font-size:.85rem">Send back</button>' +
                  '<span class="row__ok" data-ts-ok></span>' +
                "</div>"
              : '<p class="msg" style="margin:.4rem 0 0">' +
                  esc(TS_LABEL[r.status] || r.status) + " by " + esc(r.decided_by || "somebody") +
                  " on " + esc(when(r.decided_at)) +
                  (r.status === "returned" && r.note ? " &mdash; " + esc(r.note) : "") +
                "</p>") +
          "</div>";
        }).join("") + "</div>"
      : '<p class="msg">Nobody has sent a week in yet.</p>');

  box.querySelectorAll("[data-ts-yes], [data-ts-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-ts]");
      var ok = row.querySelector("[data-ts-ok]");
      var yes = b.hasAttribute("data-ts-yes");
      var why_ = row.querySelector("[data-ts-why]").value.trim();

      /* Sending a week back without saying why leaves somebody looking at
         seven numbers they already believed were right. The reason is the
         whole message. */
      if (!yes && !why_) {
        flash(ok, "Say what needs fixing — that is the whole message", true);
        row.querySelector("[data-ts-why]").focus();
        return;
      }

      flash(ok, "Saving…");
      /* decided_at and decided_by are not sent and are not granted: the
         trigger in 030 stamps both from the verified token, so the record of
         who agreed to a number cannot be typed by anybody. */
      api("timesheets?id=eq." + encodeURIComponent(row.getAttribute("data-ts")), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: yes ? { status: "approved" } : { status: "returned", note: why_ }
      }).then(loadTimesheets)
        .catch(function (e) { flash(ok, why(e), true); });
    });
  });
}

/* ── clients and placements ──
   Who works for whom. Everything else in /admin is about people on their way
   in; this is the only page about people already working.

   Both rates are set here because this is the one screen where they may sit
   beside each other: 032 puts them in separate tables so a client can reach
   one and an assistant the other, and staff are the only ones who read both.
   That is the cut, and it exists nowhere else on any screen. */
var CLIENTS = [];
var PLACEMENTS = [];
var RATES = {};

var PLACE_LABEL = { matched: "Matched", trial: "On trial", ongoing: "Kept on", ended: "Ended" };

function loadPlacements() {
  var box = document.getElementById("place-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading placements&hellip;';
  Promise.all([
    /* Only the two columns the dropdown draws. 039 moved the rest into
       client_private, and this list never showed them anyway — it was asking
       for three columns it did not use. */
    api("clients?select=id,name&order=name.asc"),
    api("placements?select=id,application_id,client_id,status,started_on,ended_on," +
        "hours_per_week,trial_weeks,clients(name,client_private(billing_cycle))" +
        "&order=started_on.desc.nullslast"),
    api("placement_billing?select=placement_id,rate"),
    api("placement_pay?select=placement_id,rate"),
    api("swap_requests?select=id,placement_id,reason,status,created_at,resolved_at,resolved_by" +
        "&order=created_at.desc")
  ]).then(function (r) {
    CLIENTS = r[0] || [];
    PLACEMENTS = r[1] || [];
    RATES = {};
    (r[2] || []).forEach(function (b) {
      RATES[b.placement_id] = RATES[b.placement_id] || {};
      RATES[b.placement_id].bill = b.rate;
    });
    (r[3] || []).forEach(function (p) {
      RATES[p.placement_id] = RATES[p.placement_id] || {};
      RATES[p.placement_id].pay = p.rate;
    });
    drawPlacements(box, r[4] || []);
    loadInterviews();
    loadPayments();
  }).catch(function (e) {
    box.innerHTML = '<p class="msg msg--bad">Could not load placements: ' + esc(why(e)) + "</p>";
  });
}

function money(n) {
  if (n === null || n === undefined || n === "") return "";
  return "$" + Number(n).toFixed(2);
}

/* client_private hangs off clients by a primary key that is also the foreign
   key, so PostgREST reads it as one-to-one and nests an object. Normalised
   anyway: the same embed described as one-to-many comes back as an array, and
   which one you get is a property of the constraint rather than of this code.
   Staff are the only role whose policy returns the row at all. */
function priv(c) {
  var p = c && c.client_private;
  return (Array.isArray(p) ? p[0] : p) || {};
}

function drawPlacements(box, swaps) {
  var byApp = {};
  ALL.forEach(function (a) { byApp[a.id] = a; });

  /* Only the hired can be placed. Somebody still in the queue appearing in
     this list is an invitation to place a person who has not been taken on. */
  var hired = ALL.filter(function (a) { return a.status === "hired"; });
  var placedNow = {};
  PLACEMENTS.forEach(function (p) {
    if (p.status !== "ended") placedNow[p.application_id] = true;
  });
  var free = hired.filter(function (a) { return !placedNow[a.id]; });

  var open = swaps.filter(function (s) { return s.status === "open"; });
  SWAPS_OPEN = open.length;
  placeBadge();

  var clientOpts = CLIENTS.map(function (c) {
    return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
  }).join("");

  box.innerHTML =
    "<h2>Clients and placements</h2>" +
    '<p class="msg" style="margin-top:0">One client at a time. Matching somebody is what tells them &mdash; ' +
      "and what makes their hours billable to the right business.</p>" +

    (open.length
      ? '<div class="note note--warn"><b>' + open.length +
        (open.length === 1 ? " client has" : " clients have") + " asked for somebody different.</b> " +
        "Nothing has changed for the assistant, and they have not been told. See below.</div>"
      : "") +

    /* ── the match form ── */
    (free.length
      ? '<div class="edit__sec">Match somebody to a client</div>' +
        '<div class="edit__grid">' +
          '<div class="fld"><label for="pl-who">Assistant</label><select id="pl-who">' +
            free.map(function (a) {
              return '<option value="' + esc(a.id) + '">' + esc(a.name || a.email) + "</option>";
            }).join("") + "</select></div>" +
          '<div class="fld"><label for="pl-client">Client</label><select id="pl-client">' +
            clientOpts + '<option value="__new">+ A client not listed</option></select></div>' +
        "</div>" +

        '<div id="pl-new" hidden>' +
          '<div class="edit__grid">' +
            '<div class="fld"><label for="pl-cname">Business name</label><input id="pl-cname" type="text" placeholder="Rosehill Plumbing"></div>' +
            '<div class="fld"><label for="pl-cwho">Their contact</label><input id="pl-cwho" type="text" placeholder="Name"></div>' +
          "</div>" +
          '<div class="edit__grid">' +
            '<div class="fld"><label for="pl-cmail">Contact email</label><input id="pl-cmail" type="email" placeholder="name@rosehill.com">' +
              '<p class="fileinfo">This is how they sign in to see their statement. It has to be right.</p></div>' +
            '<div class="fld"><label for="pl-cycle">How they pay us</label><select id="pl-cycle">' +
              '<option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>' +
          "</div>" +
        "</div>" +

        '<div class="edit__grid">' +
          '<div class="fld"><label for="pl-start">Starts on</label><input id="pl-start" type="date"></div>' +
          '<div class="fld"><label for="pl-hours">Hours a week</label><input id="pl-hours" type="number" min="1" max="168" value="40"></div>' +
        "</div>" +
        '<div class="edit__grid">' +
          /* One, because that is what the site sells. index.html asks "Is the
             first week really free?", its section is headed "How the free week
             works", and refunds.html section 1 is "The free first week". This
             box defaulted to two, and a trial week never reaches the client's
             statement — so every placement matched without changing this gave
             away a second week nobody had promised and nobody had decided to
             give. Change it per placement whenever a longer trial is actually
             agreed; the default should be the published offer. */
          '<div class="fld"><label for="pl-trial">Trial, in weeks</label><input id="pl-trial" type="number" min="1" max="52" value="1"></div>' +
          '<div class="fld"></div>' +
        "</div>" +

        '<div class="edit__sec">The two rates &mdash; only you see both</div>' +
        '<div class="edit__grid">' +
          '<div class="fld"><label for="pl-bill">The client pays, an hour</label><input id="pl-bill" type="number" min="0" step="0.01" placeholder="7.75"></div>' +
          '<div class="fld"><label for="pl-pay">The assistant gets, an hour</label><input id="pl-pay" type="number" min="0" step="0.01" placeholder="4.50"></div>' +
        "</div>" +
        '<p class="msg">Neither of them can see the other\\'s number. The assistant\\'s portal shows hours and no money at all; the client\\'s shows what they are charged and nothing about what we pay.</p>' +
        '<p class="err" id="pl-err" aria-live="polite"></p>' +
        '<div class="edit__foot"><span></span><span class="edit__act">' +
          '<span class="row__ok" id="pl-ok"></span>' +
          '<button class="btn btn--solid" id="pl-go" type="button">Match them</button>' +
        "</span></div>"
      : '<div class="note"><b>Nobody to place right now.</b> ' +
        (hired.length
          ? "Everybody hired already has a client."
          : "Mark somebody Hired first and they will appear here.") + "</div>") +

    /* ── the placements themselves ── */
    '<div class="edit__sec">Placements</div>' +
    (PLACEMENTS.length
      ? '<div class="rows">' + PLACEMENTS.map(function (p) {
          var a = byApp[p.application_id];
          var r = RATES[p.id] || {};
          var mine = swaps.filter(function (s) {
            return s.placement_id === p.id && s.status === "open";
          });
          return '<div class="row" data-place="' + esc(p.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(a ? a.name : "Unknown assistant") + "</span>" +
              '<span class="row__meta"> &middot; ' + esc(p.clients ? p.clients.name : "a client") +
                (p.started_on ? " &middot; from " + esc(when(p.started_on)) : "") + "</span>" +
            "</span>" +
            '<span class="pill pill--pl_' + esc(p.status) + '">' +
              esc(PLACE_LABEL[p.status] || p.status) + "</span></div>" +

            '<div class="row__tags">' + esc(p.hours_per_week) + " h a week" +
              (p.trial_weeks ? " &middot; " + esc(p.trial_weeks) + "-week trial" : "") +
              (priv(p.clients).billing_cycle ? " &middot; billed " + esc(priv(p.clients).billing_cycle) : "") +
            "</div>" +

            (mine.length
              ? '<div class="note note--warn" style="margin-top:.6rem"><b>They have asked for somebody different.</b> ' +
                esc(mine[0].reason) + '<br><button class="btn btn--ghost" data-swap="' + esc(mine[0].id) +
                '" type="button" style="padding:.4rem .75rem;font-size:.84rem;margin-top:.5rem">Mark it handled</button></div>'
              : "") +

            '<div class="row__ctl">' +
              '<select data-pl-status aria-label="Placement stage">' +
                ["matched", "trial", "ongoing", "ended"].map(function (s) {
                  return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + ">" +
                    PLACE_LABEL[s] + "</option>";
                }).join("") +
              "</select>" +
              '<input data-pl-bill type="number" min="0" step="0.01" placeholder="client $/h" ' +
                'aria-label="What the client pays an hour" value="' + esc(r.bill === undefined ? "" : r.bill) + '" ' +
                'style="width:8rem">' +
              '<input data-pl-pay type="number" min="0" step="0.01" placeholder="assistant $/h" ' +
                'aria-label="What the assistant is paid an hour" value="' + esc(r.pay === undefined ? "" : r.pay) + '" ' +
                'style="width:8rem">' +
              '<button class="btn btn--ghost" data-pl-save type="button" style="padding:.45rem .8rem;font-size:.85rem">Save</button>' +
              '<button class="btn btn--ghost" data-pl-del type="button" style="padding:.45rem .8rem;font-size:.85rem">Remove</button>' +
              '<span class="row__ok" data-pl-ok></span>' +
            "</div>" +
          "</div>";
        }).join("") + "</div>"
      : '<p class="msg">Nobody is placed yet.</p>') +

    /* Until now a client existed only as a name inside the select above, which
       meant a business could be created here and then never seen again — and
       a client made by a typo could not be removed from anywhere in the
       product. */
    '<div class="edit__sec">Clients</div>' +
    (CLIENTS.length
      ? '<div class="rows">' + CLIENTS.map(function (c) {
          var mine = PLACEMENTS.filter(function (p) { return p.client_id === c.id; });
          return '<div class="row" data-client="' + esc(c.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(c.name) + "</span>" +
              '<span class="row__meta"> &middot; ' + mine.length +
                (mine.length === 1 ? " placement" : " placements") + "</span>" +
            "</span></div>" +
            (can("applications.edit")
              ? '<div class="row__ctl">' +
                  '<button class="btn btn--ghost" data-client-del type="button" ' +
                    'style="padding:.45rem .8rem;font-size:.85rem">Remove client</button>' +
                  '<span class="row__ok" data-client-ok></span>' +
                "</div>"
              : "") +
          "</div>";
        }).join("") + "</div>"
      : '<p class="msg">No clients yet. One is made the first time you match somebody to a business that is not on the list.</p>');

  wirePlacementForm();
  wirePlacementRows(box);
  wireRemovals(box);
}

/* The two smaller removals. Neither asks for a name to be typed: a placement
   is a match that can be made again in a minute, and a client is a name and a
   contact address. The panel on the queue is the only one that removes
   something nobody can reconstruct, and it is the only one with that friction.

   What both do have is the refusal, explained. clients and client_payments are
   ON DELETE RESTRICT in sql/032 and sql/055 — deliberately, because a business
   with money against its name should not be removable by accident. Without
   this the page would hand somebody 23503 in an alert box. */
function wireRemovals(box) {
  box.querySelectorAll("[data-pl-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-place]");
      var id = row.getAttribute("data-place");
      if (!window.confirm(
            "Remove this placement?\\n\\nIts two rates, the agreed start and any interview " +
            "times offered on it go with it. The assistant and the client both stay — only " +
            "the match between them goes.")) {
        return;
      }
      b.disabled = true;
      api("placements?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      }).then(loadPlacements)
        .catch(function (e) {
          b.disabled = false;
          flash(row.querySelector("[data-pl-ok]"), why(e), true);
        });
    });
  });

  box.querySelectorAll("[data-client-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-client]");
      var id = row.getAttribute("data-client");
      var ok = row.querySelector("[data-client-ok]");
      b.disabled = true;
      flash(ok, "Checking\u2026");
      /* Counted now rather than when the panel was drawn, so the refusal is
         about what is true at the moment somebody presses the button. */
      Promise.all([
        api("client_payments?select=id&client_id=eq." + encodeURIComponent(id))
          ["catch"](function () { return []; }),
        api("placements?select=id&client_id=eq." + encodeURIComponent(id))
          ["catch"](function () { return []; })
      ]).then(function (r) {
        var pays = (r[0] || []).length;
        var places = (r[1] || []).length;
        if (pays) {
          b.disabled = false;
          flash(ok, "Refused", true);
          window.alert(
            "This client has " + pays + (pays === 1 ? " payment" : " payments") +
            " recorded against them.\\n\\nA business with money against its name is not a " +
            "test row, so this is refused until the payments are removed. Remove them in " +
            "Money in first, and only if you really mean to.");
          return null;
        }
        if (!window.confirm(
              "Remove this client?\\n\\n" + places +
              (places === 1 ? " placement goes" : " placements go") + " with them, along " +
              "with any interview times offered. Their contact details go too. " +
              "This cannot be undone.")) {
          b.disabled = false;
          flash(ok, "");
          return null;
        }
        /* Placements first. sql/032 makes them ON DELETE RESTRICT against the
           client, so the order is enforced by the database rather than
           remembered here — this just does it in the order that works. */
        return api("placements?client_id=eq." + encodeURIComponent(id), {
          method: "DELETE",
          headers: { Prefer: "return=minimal" }
        }).then(function () {
          return api("clients?id=eq." + encodeURIComponent(id), {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
          });
        }).then(loadPlacements);
      })["catch"](function (e) {
        b.disabled = false;
        flash(ok, why(e), true);
      });
    });
  });
}

function wirePlacementForm() {
  var pick = document.getElementById("pl-client");
  if (!pick) return;
  var fresh = document.getElementById("pl-new");
  var show = function () {
    if (pick.value === "__new") fresh.removeAttribute("hidden");
    else fresh.setAttribute("hidden", "");
  };
  pick.addEventListener("change", show);
  if (!CLIENTS.length) { pick.value = "__new"; }
  show();

  document.getElementById("pl-go").addEventListener("click", function () {
    var err = document.getElementById("pl-err");
    var ok = document.getElementById("pl-ok");
    var go = document.getElementById("pl-go");
    var start = document.getElementById("pl-start");
    var bill = document.getElementById("pl-bill");
    var pay = document.getElementById("pl-pay");
    err.textContent = "";

    if (!start.value) { err.textContent = "Which day do they start?"; start.focus(); return; }
    if (!bill.value) { err.textContent = "What does the client pay an hour? Without it their statement cannot be worked out."; bill.focus(); return; }
    if (!pay.value) { err.textContent = "And what does the assistant get an hour?"; pay.focus(); return; }
    if (Number(pay.value) > Number(bill.value)) {
      err.textContent = "The assistant is set to be paid more than the client is charged. Check both numbers.";
      pay.focus(); return;
    }

    go.disabled = true;
    flash(ok, "Saving\\u2026");

    /* Checked before the request, which is where a check belongs. This used to
       sit twenty lines below, AFTER clientStep had been built — and building
       it fires the POST, so an empty name sent a row the constraint refused
       and then returned early, leaving a rejected promise nobody was holding.
       The database caught it, which is why nothing ever went wrong; it was
       still a request made and abandoned on every mistyped form. */
    var wantNew = pick.value === "__new";
    if (wantNew && !document.getElementById("pl-cname").value.trim()) {
      go.disabled = false;
      err.textContent = "Give the business a name.";
      return;
    }

    /* A new client first, because the placement cannot point at one that does
       not exist yet. return=representation so the id comes back rather than
       being fetched again and hoped to be the right row. */
    var clientStep = wantNew
      ? api("clients", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: { name: document.getElementById("pl-cname").value.trim() }
        }).then(function (rows) {
          var c = (rows || [])[0];
          if (!c) throw new Error("the client did not come back");
          /* The details are a second row since 039, and the contact address
             is the one field that must be right — it is how they sign in to
             /seats. So a failure here is named rather than swallowed: the
             business exists, and somebody has to go and finish it. */
          return api("client_private", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: {
              client_id: c.id,
              contact_name: document.getElementById("pl-cwho").value.trim() || null,
              contact_email: document.getElementById("pl-cmail").value.trim() || null,
              billing_cycle: document.getElementById("pl-cycle").value
            }
          }).then(function () { return c.id; }, function () {
            throw new Error("The business was created, but their contact details did not save — " +
              "so nobody there can sign in yet. Add them before matching anyone.");
          });
        })
      : Promise.resolve(pick.value);

    clientStep.then(function (clientId) {
      return api("placements", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          application_id: document.getElementById("pl-who").value,
          client_id: clientId,
          status: "matched",
          started_on: start.value,
          hours_per_week: Number(document.getElementById("pl-hours").value || 40),
          trial_weeks: Number(document.getElementById("pl-trial").value || 0) || null
        }
      });
    }).then(function (rows) {
      var p = (rows || [])[0];
      if (!p) throw new Error("the placement did not come back");
      /* The rates are two more rows. If either fails the placement still
         exists, so the message says so rather than implying nothing happened —
         and both are editable on the row below. */
      return Promise.all([
        api("placement_billing", { method: "POST", headers: { Prefer: "return=minimal" },
          body: { placement_id: p.id, rate: Number(bill.value) } }),
        api("placement_pay", { method: "POST", headers: { Prefer: "return=minimal" },
          body: { placement_id: p.id, rate: Number(pay.value) } })
      ]).catch(function () {
        throw new Error("Matched, but the rates did not save. Set them on the row below.");
      });
    }).then(function () {
      loadPlacements();
    }).catch(function (e) {
      go.disabled = false;
      flash(ok, why(e), true);
      err.textContent = String(e && e.message ? e.message : e).slice(0, 300);
    });
  });
}

function wirePlacementRows(box) {
  box.querySelectorAll("[data-pl-save]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-place]");
      var id = row.getAttribute("data-place");
      var ok = row.querySelector("[data-pl-ok]");
      var status = row.querySelector("[data-pl-status]").value;
      var bill = row.querySelector("[data-pl-bill]").value;
      var pay = row.querySelector("[data-pl-pay]").value;

      var have = RATES[id] || {};

      /* Falls back to what is stored when a box is empty, which is the state
         of every row whose rate has never been set. The guard used to skip
         itself in exactly that case, so the first pay rate typed against a
         blank billing box was never compared with anything. */
      var billNum = bill !== "" ? Number(bill) : (have.bill === undefined ? null : Number(have.bill));
      var payNum  = pay  !== "" ? Number(pay)  : (have.pay  === undefined ? null : Number(have.pay));
      if (billNum !== null && payNum !== null && payNum > billNum) {
        flash(ok, "The assistant cannot be paid more than the client is charged", true);
        return;
      }

      flash(ok, "Saving\\u2026");

      /* Only what actually changed. This used to PATCH status and ended_on on
         every save, so correcting a rate on a placement that ended in March
         rewrote its end date to today \u2014 silently moving the boundary that
         decides which weeks the placement covers. A rate edit is a rate edit. */
      var wasStatus = null;
      for (var pi = 0; pi < PLACEMENTS.length; pi++) {
        if (PLACEMENTS[pi].id === id) { wasStatus = PLACEMENTS[pi].status; break; }
      }
      var jobs = [];
      if (status !== wasStatus) {
        jobs.push(api("placements?id=eq." + encodeURIComponent(id), {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: { status: status, ended_on: status === "ended" ? todayCentral() : null }
        }));
      }

      /* Upserted one at a time rather than with merge-duplicates: the update
         grant covers rate and nothing else, and an upsert would try to write
         placement_id too. */
      var rate = function (table, value, had) {
        /* An emptied box is not a change, and it never was — the old rate
           stays. What was wrong was the screen saying "Saved" over it. It now
           says what actually happened, because a rate that could be deleted
           would recreate the problem where a client sees hours and no money at
           all with nothing explaining the gap. */
        if (value === "") {
          if (had !== undefined) emptied = true;
          return null;
        }
        /* Rounded to the cent before it is sent. The inputs carry step="0.01"
           and nothing enforces it — this is not a form submit and nothing
           calls checkValidity — so 7.755 went through as typed and numeric(8,2)
           rounded it to 7.76 on the way in. On a site that sells "$7.75 flat,
           the number you were quoted", the rate stored has to be the rate
           somebody typed. */
        var cents = Math.round(Number(value) * 100);
        return had === undefined
          ? api(table, { method: "POST", headers: { Prefer: "return=minimal" },
              body: { placement_id: id, rate: cents / 100 } })
          : api(table + "?placement_id=eq." + encodeURIComponent(id), {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: { rate: cents / 100 } });
      };
      var emptied = false;
      var a = rate("placement_billing", bill, have.bill);
      var c = rate("placement_pay", pay, have.pay);
      if (a) jobs.push(a);
      if (c) jobs.push(c);

      Promise.all(jobs).then(function () {
        if (emptied) flash(ok, "Rates can be changed, not cleared", true);
        loadPlacements();
      }).catch(function (e) { flash(ok, why(e), true); });
    });
  });

  box.querySelectorAll("[data-swap]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-place]");
      var ok = row.querySelector("[data-pl-ok]");
      flash(ok, "Saving\\u2026");
      /* Status alone. sql/046 revoked UPDATE on resolved_at and resolved_by
         and put a trigger on the table instead, so sending either would now be
         refused outright — and that is the point: who resolved something is a
         record, and a record the browser fills is one the browser can choose.
         Every other such field here is stamped from the verified token; these
         two were the last that were not. */
      api("swap_requests?id=eq." + encodeURIComponent(b.getAttribute("data-swap")), {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: { status: "resolved" }
      }).then(loadPlacements)
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
  api("seat_requests?select=id,created_at,seats,hours,weekly,weekly_cents,blocks,timezone,name,company,email,phone,notes,status,status_changed_at&order=created_at.desc")
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
              /* The exact figure where there is one. This read the rounded
                 column, so /admin and the home page quoted different weeks to
                 the same client — and a conversation about a price should not
                 start with the two of you looking at different numbers. */
              (r.weekly_cents !== null && r.weekly_cents !== undefined
                ? " &middot; $" + esc((r.weekly_cents / 100).toFixed(2)) + "/wk quoted"
                : r.weekly ? " &middot; $" + esc(r.weekly) + "/wk quoted" : "") +
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
    /* What the database held when this dropdown was drawn, so a refusal can
       put it back. hub.html learned this the hard way and says so: a value
       that failed to save must not sit there looking saved. Here it did — the
       select kept the new choice, the row kept the old one, and only the next
       reload disagreed with what was on screen. */
    sel.setAttribute("data-was", sel.value);
    sel.addEventListener("change", function () {
      var row = sel.closest("[data-seat]");
      var id = row.getAttribute("data-seat");
      var st = sel.value;
      var ok = row.querySelector("[data-seat-ok]");
      var was = sel.getAttribute("data-was");

      /* Asked before it happens, because there is no Save button on this
         control: picking a stage writes it immediately, and the stage a seat
         request sits at is what the client is shown on /seats. A mis-click on
         a dropdown used to be a change the client could see before you knew
         you had made it. Cancelling puts the dropdown back rather than leaving
         it showing something the database does not hold. */
      var who = row.querySelector(".row__n");
      var okToGo = window.confirm(
        "Move " + ((who && who.textContent) || "this request") +
        " from “" + (SEAT_LABEL[was] || was) + "” to “" + (SEAT_LABEL[st] || st) + "”?\\n\\n" +
        "The client sees this stage on their own page as soon as it saves."
      );
      if (!okToGo) { sel.value = was; return; }

      flash(ok, "Saving…");
      api("seat_requests?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { status: st, status_changed_at: new Date().toISOString() }
      }).then(function () {
        var pill = row.querySelector(".pill");
        pill.className = "pill pill--" + st;
        pill.textContent = SEAT_LABEL[st] || st;
        sel.setAttribute("data-was", st);
        flash(ok, "Saved");
      }).catch(function (e) {
        sel.value = sel.getAttribute("data-was");
        flash(ok, why(e), true);
      });
    });
  });
}

/* ── the inbox ──
   010 stored contact messages and gave staff a policy to read them, and there
   was nowhere to do it. A form that writes to a table nobody opens is a form
   that loses messages politely. */

/* ── interviews being arranged ─────────────────────────────────────────────

   sql/057. Not a fourth screen. Staff do not arrange these — the client and
   the assistant settle it between themselves, which is the whole decision
   behind that file. What staff need is the one thing neither of those two can
   see: that something has been sitting for a week.

   So this is a list ordered by who is stuck, worst first, and nothing on it is
   a control. Reading it and picking up the phone is the intervention. */
var IV_STATE = [];

/* The two things behind the Placements tab that are worth a number on it: swap
   requests somebody has to resolve, and interviews that have stalled. Kept as
   two counts and one setter, because both panels redraw independently and each
   calling badge() with only its own half made the tab flicker between two
   different truths. */
var IV_STUCK = 0;
var SWAPS_OPEN = 0;
function placeBadge() { badge("tab-place", SWAPS_OPEN + IV_STUCK); }

var IV_LABEL = {
  confirmed:            ["On", "go"],
  waiting_on_client:    ["Client", "wait"],
  waiting_on_assistant: ["Assistant", "wait"],
  declined:             ["Offer more", "wait"],
  not_started:          ["Not started", "none"]
};

/* The order somebody works down. Confirmed is last because it is the one row
   that needs nothing — it is here so the list is the whole picture rather than
   only the bad news. */
var IV_ORDER = ["waiting_on_client", "waiting_on_assistant", "declined", "not_started", "confirmed"];

function loadInterviews() {
  var box = document.getElementById("iv-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading interviews&hellip;';
  api("interview_state?select=placement_id,client_id,application_id,offered,earliest," +
      "chosen_at,confirmed_at,state,days_waiting")
    .then(function (rows) { IV_STATE = rows || []; drawInterviews(box); })
    .catch(function () {
      box.innerHTML =
        "<h2>Interviews being arranged</h2>" +
        '<div class="note"><b>Not switched on yet.</b> Paste <code>sql/057</code> and this ' +
        "shows every match waiting on an interview, and which of the two people it is waiting " +
        "on.</div>";
    });
}

function drawInterviews(box) {
  var byId = {};
  ALL.forEach(function (a) { byId[a.id] = a; });
  var clientName = {};
  CLIENTS.forEach(function (c) { clientName[c.id] = c.name; });

  var rows = IV_STATE.slice().sort(function (a, b) {
    var d = IV_ORDER.indexOf(a.state) - IV_ORDER.indexOf(b.state);
    return d !== 0 ? d : (b.days_waiting || 0) - (a.days_waiting || 0);
  });

  /* Anything sitting for a week is worth interrupting for. Not a rule the
     database enforces — nothing here blocks — just the line at which a list
     stops being information and starts being a job. */
  var stuck = rows.filter(function (r) {
    return r.state !== "confirmed" && (r.days_waiting || 0) >= 7;
  });
  /* Not badge() directly. Two panels live behind this tab now — open swap
     requests and stalled interviews — and each calling badge() with its own
     count means whichever draws last erases the other's. */
  IV_STUCK = stuck.length;
  placeBadge();

  box.innerHTML =
    "<h2>Interviews being arranged</h2>" +
    '<p class="msg" style="margin-top:0">Every matched placement where the two of them have not ' +
      "met yet. Nobody here is waiting on us &mdash; they arrange it themselves &mdash; so this " +
      "is only for spotting the ones that have stopped moving.</p>" +

    (stuck.length
      ? '<div class="note note--warn" style="margin-top:1.1rem"><b>' + esc(String(stuck.length)) +
        (stuck.length === 1 ? " has" : " have") + " been sitting for a week or more.</b> " +
        "Worth a message to whichever side it is waiting on.</div>"
      : "") +

    (rows.length
      ? '<div class="rows" style="margin-top:1rem">' + rows.map(function (r) {
          var a = byId[r.application_id];
          var lab = IV_LABEL[r.state] || ["&mdash;", "none"];
          return '<div class="row">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(a ? a.name : "Unknown assistant") +
                " &middot; " + esc(clientName[r.client_id] || "unknown client") + "</span>" +
              '<span class="row__meta"> &middot; ' + esc(ivSays(r)) + "</span>" +
            "</span>" +
            '<span class="pill pill--iv_' + esc(lab[1]) + '">' + lab[0] + "</span></div>" +
          "</div>";
        }).join("") + "</div>"
      : '<div class="note" style="margin-top:1.1rem"><b>Nothing being arranged.</b> ' +
        "This fills in when a placement is set to matched.</div>");
}

/* One sentence per row, and it has to carry the two things somebody reads:
   where it has got to, and how long it has been there. */
/* Two shapes, not one. A day count reads differently depending on whether the
   sentence is about a moment or a duration, and one helper for both produced
   "matched today ago" on the day a placement was created — which is the only
   day anybody looks at a brand new one. */
function ivWhen(days) {
  return days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
}
function ivFor(days) {
  return days === 0 ? "since today" : days === 1 ? "for 1 day" : "for " + days + " days";
}

function ivSays(r) {
  var days = Number(r.days_waiting || 0);

  if (r.state === "confirmed") {
    return "confirmed for " + whenTime(r.earliest);
  }
  if (r.state === "waiting_on_client") {
    return "she picked a time — waiting on the client " + ivFor(days);
  }
  if (r.state === "waiting_on_assistant") {
    return r.offered + (r.offered === 1 ? " time" : " times") +
      " offered — waiting on her " + ivFor(days);
  }
  if (r.state === "declined") {
    return "none of the times worked — the client needs to offer more, " + ivWhen(days);
  }
  return "matched " + ivWhen(days) + " — no times offered yet";
}

/* ── money in ──────────────────────────────────────────────────────────────

   sql/055. Nothing in this product has ever recorded that a client paid, so
   the bill on /seats and the figure on /pay could only ever go up. This is the
   panel where a transfer somebody watched land gets written down.

   It is a ledger, not a payment provider: no card, no fee, no webhook. Staff
   type what arrived. The client's pages subtract it.

   Allocating the payment to specific weeks is optional and stays optional. A
   client wires a round number against three weeks and a bit; making somebody
   split that before the payment can be saved means the payment does not get
   saved, and an unrecorded payment is the whole bug this file exists to fix.
   The balance is right either way — the ticks only add the finer answer of
   WHICH weeks are settled. */
var PAY_METHODS = [
  ["bank_transfer", "Bank transfer"], ["wise", "Wise"], ["paypal", "PayPal"],
  ["card", "Card"], ["cheque", "Cheque"], ["cash", "Cash"], ["other", "Other"]
];
var PAY_METHOD_LABEL = {};
PAY_METHODS.forEach(function (m) { PAY_METHOD_LABEL[m[0]] = m[1]; });

var PAYMENTS = [];
var PAY_ALLOC = {};
var PAY_WEEKS = [];
var PAY_OFF = false;

function loadPayments() {
  var box = document.getElementById("pay-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Loading payments&hellip;';

  Promise.all([
    api("client_payments?select=id,client_id,amount_cents,paid_on,method,reference,note," +
        "recorded_at,recorded_by&order=paid_on.desc,recorded_at.desc"),
    api("client_payment_weeks?select=payment_id,timesheet_id"),
    /* Every chargeable week, so the allocation ticks can be drawn without a
       second round trip per client. Approved and not a trial week: a trial
       week costs nothing, so there is nothing for a payment to settle. */
    api("timesheets?select=id,placement_id,application_id,week_starts_on,status,trial_week," +
        "timesheet_days(hours)&status=eq.approved&trial_week=is.false&order=week_starts_on.desc")
  ]).then(function (r) {
    PAYMENTS = r[0] || [];
    PAY_ALLOC = {};
    (r[1] || []).forEach(function (a) { PAY_ALLOC[a.timesheet_id] = a.payment_id; });
    PAY_WEEKS = r[2] || [];
    PAY_OFF = false;
    drawPayments(box);
  }).catch(function () {
    /* Until 055 is pasted these tables do not exist and PostgREST answers 404.
       An admin page that will not load because a new panel is not switched on
       yet is worse than one without the panel. */
    PAY_OFF = true;
    box.innerHTML =
      "<h2>Money in</h2>" +
      '<div class="note"><b>Not switched on yet.</b> Paste <code>sql/055</code> and this ' +
      "becomes the place you write down a transfer when it lands. Until then the bill on a " +
      "client&rsquo;s page only ever goes up, because nothing can record that they paid.</div>";
  });
}

/* What a client owes us, from the same rows /seats and /pay read. Staff see
   every client, so this is computed per client rather than for the one signed
   in — otherwise the figure here and the figure the client sees are two
   different calculations, and the day they disagree is the day somebody is
   chased for money they have already sent. */
function payOwed(clientId) {
  var mine = {};
  PLACEMENTS.forEach(function (p) { if (p.client_id === clientId) mine[p.id] = p; });

  var cents = 0, weeks = [];
  PAY_WEEKS.forEach(function (w) {
    if (!mine[w.placement_id]) return;
    var rate = RATES[w.placement_id] && RATES[w.placement_id].bill;
    var hours = 0;
    (w.timesheet_days || []).forEach(function (d) { hours += Number(d.hours || 0); });
    if (!hours) return;
    weeks.push({
      id: w.id,
      week: w.week_starts_on,
      hours: hours,
      /* An unpriced week is listed and worth nothing, rather than left out.
         Silence about somebody's hours is how a client is quoted less than
         they owe — the same rule the client's own bill follows. */
      cents: rate === undefined || rate === null ? null : Math.round(hours * Number(rate) * 100),
      settledBy: PAY_ALLOC[w.id] || null,
      who: (byAppName(w.application_id) || "an assistant")
    });
    if (rate !== undefined && rate !== null) cents += Math.round(hours * Number(rate) * 100);
  });

  var paid = 0;
  PAYMENTS.forEach(function (p) { if (p.client_id === clientId) paid += Number(p.amount_cents || 0); });

  weeks.sort(function (a, b) { return a.week < b.week ? 1 : a.week > b.week ? -1 : 0; });
  return { approved: cents, paid: paid, owed: cents - paid, weeks: weeks };
}

function byAppName(id) {
  for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i].name;
  return "";
}

function payMoney(cents) {
  return "$" + (Number(cents || 0) / 100).toFixed(2);
}

/* Typed dollars to stored cents, and the one place the conversion happens.
   Number("12.345") * 100 is 1234.4999999999998, so it is rounded rather than
   truncated — sql/046 is the migration that exists because a money figure was
   quietly rounded once and nothing said so. */
function payCents(text) {
  /* Every backslash here is doubled because this script is assembled inside a
     template literal, which eats one on the way out. Written singly it shipped
     as [$,s] and ^d+(.d{1,2})?$ — a class stripping the letter s, and a pattern
     demanding a literal d before the digits. Nothing threw. The panel simply
     refused every amount anybody typed, and said the amount looked wrong. */
  var t = String(text || "").replace(/[$,\\s]/g, "");
  if (!t || !/^\\d+(\\.\\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

function drawPayments(box) {
  var opts = CLIENTS.map(function (c) {
    return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>";
  }).join("");

  /* Every client with money outstanding, worst first. This is the list that
     answers "who owes us", which is the question somebody opens this panel
     with — the form underneath is what they do about it. */
  var owing = CLIENTS.map(function (c) {
    var o = payOwed(c.id);
    return { c: c, o: o };
  }).filter(function (x) { return x.o.approved > 0 || x.o.paid > 0; });
  owing.sort(function (a, b) { return b.o.owed - a.o.owed; });

  var outstanding = 0;
  owing.forEach(function (x) { if (x.o.owed > 0) outstanding += x.o.owed; });

  box.innerHTML =
    "<h2>Money in</h2>" +
    '<p class="msg" style="margin-top:0">A transfer, written down when it lands. There is no card ' +
      "processing here and nothing is charged &mdash; this is the record that makes a client&rsquo;s " +
      "bill go down. Until a payment is here, their page tells them they still owe it.</p>" +

    (owing.length
      ? '<div class="kpis" style="margin-top:1.1rem">' +
          '<div class="kpi' + (outstanding > 0 ? " kpi--warn" : " kpi--good") + '">' +
            "<b>" + esc(payMoney(outstanding)) + "</b><span>outstanding across " +
            esc(String(owing.length)) + (owing.length === 1 ? " client" : " clients") + "</span></div>" +
        "</div>" +
        '<div class="rows" style="margin-top:1rem">' +
          owing.map(function (x) {
            return '<div class="row">' +
              '<div class="row__top"><span>' +
                '<span class="row__n">' + esc(x.c.name) + "</span>" +
                '<span class="row__meta"> &middot; ' + esc(payMoney(x.o.approved)) + " approved" +
                  (x.o.paid ? " &middot; " + esc(payMoney(x.o.paid)) + " paid" : "") + "</span>" +
              "</span>" +
              '<span class="row__tot' + (x.o.owed > 0 ? "" : " sit__ok") + '">' +
                /* The sign is dropped when the word carries it. "$-620.00 in
                   credit" says the same thing twice and reads like a bug in
                   the figure rather than money in hand. */
                esc(payMoney(Math.abs(x.o.owed))) +
                (x.o.owed < 0 ? " in credit" : " owed") + "</span></div>" +
            "</div>";
          }).join("") +
        "</div>"
      : '<div class="note" style="margin-top:1.1rem"><b>No client has been billed yet.</b> ' +
        "A client appears here once one of their weeks has been approved.</div>") +

    /* ── the form ── */
    '<div class="edit" style="margin-top:1.4rem">' +
      '<h3 class="edit__h">Record a payment</h3>' +
      '<div class="edit__grid">' +
        '<div class="fld"><label for="pay-client">Client</label>' +
          '<select id="pay-client"><option value="">Choose a client</option>' + opts + "</select></div>" +
        '<div class="fld"><label for="pay-amount">Amount</label>' +
          '<input id="pay-amount" type="text" inputmode="decimal" placeholder="620.00"></div>' +
        '<div class="fld"><label for="pay-on">Date it arrived</label>' +
          '<input id="pay-on" type="date" value="' + esc(todayCentral()) + '"></div>' +
        '<div class="fld"><label for="pay-method">How</label>' +
          '<select id="pay-method">' +
            PAY_METHODS.map(function (m) {
              return '<option value="' + esc(m[0]) + '">' + esc(m[1]) + "</option>";
            }).join("") +
          "</select></div>" +
        '<div class="fld"><label for="pay-ref">Their reference <em>&mdash; optional</em></label>' +
          '<input id="pay-ref" type="text" placeholder="What is on the bank statement" maxlength="200"></div>' +
        '<div class="fld"><label for="pay-note">Note <em>&mdash; optional</em></label>' +
          '<input id="pay-note" type="text" placeholder="Anything worth remembering" maxlength="2000"></div>' +
      "</div>" +
      '<div id="pay-weeks" class="payw" hidden></div>' +
      '<div class="edit__foot">' +
        '<span class="hint" id="pay-hint">Pick a client and the weeks they owe for appear here.</span>' +
        '<span class="edit__act"><span class="row__ok" id="pay-ok"></span>' +
        '<button class="btn btn--solid" id="pay-go" type="button">Record it</button></span>' +
      "</div>" +
    "</div>" +

    /* ── what has been recorded ── */
    (PAYMENTS.length
      ? '<h3 class="edit__h" style="margin-top:1.6rem">Recorded so far</h3>' +
        '<div class="rows">' + PAYMENTS.map(function (p) {
          var c = null;
          for (var i = 0; i < CLIENTS.length; i++) if (CLIENTS[i].id === p.client_id) c = CLIENTS[i];
          var n = 0;
          for (var k in PAY_ALLOC) if (PAY_ALLOC[k] === p.id) n++;
          return '<div class="row" data-pay="' + esc(p.id) + '">' +
            '<div class="row__top"><span>' +
              '<span class="row__n">' + esc(c ? c.name : "Unknown client") + "</span>" +
              '<span class="row__meta"> &middot; ' + esc(when(p.paid_on)) + " &middot; " +
                esc(PAY_METHOD_LABEL[p.method] || p.method) +
                (p.reference ? " &middot; " + esc(p.reference) : "") +
                (n ? " &middot; settles " + esc(String(n)) + (n === 1 ? " week" : " weeks") : "") +
              "</span>" +
            "</span>" +
            '<span class="row__tot">' + esc(payMoney(p.amount_cents)) + "</span>" +
            '<button class="btn btn--ghost" data-pay-del type="button" ' +
              'style="padding:.35rem .7rem;font-size:.82rem">Remove</button></div>' +
            (p.note ? '<p class="msg" style="margin:.4rem 0 0">' + esc(p.note) + "</p>" : "") +
            '<p class="hint" style="margin:.35rem 0 0">Written down by ' +
              esc(p.recorded_by || "somebody") + " on " + esc(when(p.recorded_at)) + "</p>" +
          "</div>";
        }).join("") + "</div>"
      : "");

  wirePayments(box);
}

/* The weeks a payment can be ticked against, redrawn whenever the client
   changes. A week already settled by another payment is shown and disabled
   rather than hidden — "why is that week not in the list" is a worse question
   to be left with than "that one is already covered". */
function drawPayWeeks() {
  var wrap = document.getElementById("pay-weeks");
  var sel = document.getElementById("pay-client");
  var hint = document.getElementById("pay-hint");
  if (!wrap || !sel) return;

  if (!sel.value) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    hint.textContent = "Pick a client and the weeks they owe for appear here.";
    return;
  }

  var o = payOwed(sel.value);
  var open = o.weeks.filter(function (w) { return !w.settledBy; });

  wrap.hidden = false;
  wrap.innerHTML =
    '<p class="payw__h">Which weeks does this settle? <em>Optional</em></p>' +
    '<p class="payw__d">Leave every box empty and the payment still counts against their ' +
      "balance. Ticking weeks only records which ones it covered.</p>" +
    (o.weeks.length
      ? '<div class="payw__list">' + o.weeks.map(function (w) {
          var done = !!w.settledBy;
          return '<label class="payw__i' + (done ? " is-off" : "") + '">' +
            '<input type="checkbox" data-pay-week="' + esc(w.id) + '"' + (done ? " disabled" : "") + ">" +
            "<span>" +
              '<span class="payw__n">Week of ' + esc(when(w.week)) + "</span>" +
              '<span class="payw__m">' + esc(w.who) + " &middot; " +
                esc(String(Math.round(w.hours * 100) / 100)) + " h &middot; " +
                (w.cents === null ? "no rate set yet" : esc(payMoney(w.cents))) +
                (done ? " &middot; already settled" : "") + "</span>" +
            "</span></label>";
        }).join("") + "</div>"
      : '<p class="payw__d">No approved chargeable weeks for this client yet.</p>');

  /* A client can be in credit and still have weeks nobody has ticked — they
     paid a round number up front. "$-90.00 outstanding across 2 unsettled
     weeks" is two wrong things in one sentence, so credit is said as credit
     and the weeks are mentioned separately. */
  var weeksBit = open.length
    ? " " + open.length + (open.length === 1 ? " week is" : " weeks are") + " not ticked against a payment."
    : "";

  hint.textContent = o.owed < 0
    ? payMoney(-o.owed) + " in credit." + weeksBit
    : o.owed > 0
      ? payMoney(o.owed) + " outstanding." + weeksBit
      : "Nothing outstanding for this client." + weeksBit;
}

function wirePayments(box) {
  var sel = document.getElementById("pay-client");
  if (sel) sel.addEventListener("change", drawPayWeeks);

  var go = document.getElementById("pay-go");
  if (go) go.addEventListener("click", function () { savePayment(go); });

  box.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pay-del]");
    if (!btn) return;
    var row = btn.closest("[data-pay]");
    if (!row) return;
    removePayment(row.getAttribute("data-pay"), btn);
  });
}

function savePayment(go) {
  var ok = document.getElementById("pay-ok");
  var client = document.getElementById("pay-client").value;
  var cents = payCents(document.getElementById("pay-amount").value);
  var on = document.getElementById("pay-on").value;
  var method = document.getElementById("pay-method").value;
  var ref = document.getElementById("pay-ref").value.trim();
  var note = document.getElementById("pay-note").value.trim();

  if (!client) { flash(ok, "Choose a client", true); return; }
  if (cents === null || cents <= 0) {
    flash(ok, "Amount should look like 620 or 620.50", true);
    return;
  }
  if (!on) { flash(ok, "When did it arrive?", true); return; }

  /* The weeks ticked, read before the insert so that a payment that saves and
     an allocation that does not is still a payment with the right total on it.
     The balance is what matters; the ticks are the finer answer. */
  var weeks = [];
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-pay-week]:checked"),
    function (cb) { weeks.push(cb.getAttribute("data-pay-week")); }
  );

  go.disabled = true;
  flash(ok, "Saving…");

  /* recorded_by is not sent and is not grantable — sql/055 stamps it from the
     token, because a field the browser fills is a field the browser can lie
     about, and this is the record of who wrote down that money arrived. */
  api("client_payments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      client_id: client,
      amount_cents: cents,
      paid_on: on,
      method: method,
      reference: ref || null,
      note: note || null
    }
  }).then(function (rows) {
    var id = rows && rows[0] && rows[0].id;
    if (!id || !weeks.length) return null;
    return api("client_payment_weeks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: weeks.map(function (w) { return { payment_id: id, timesheet_id: w }; })
    }).catch(function (e) {
      /* Said out loud rather than swallowed. The money is recorded and the
         balance is already right; what failed is only the record of which
         weeks it covered, and somebody should know that rather than wonder
         later why the ticks did not stick. */
      throw new Error("The payment saved, but the weeks did not tick: " + why(e));
    });
  }).then(function () {
    flash(ok, "Recorded");
    document.getElementById("pay-amount").value = "";
    document.getElementById("pay-ref").value = "";
    document.getElementById("pay-note").value = "";
    go.disabled = false;
    loadPayments();
  }).catch(function (e) {
    go.disabled = false;
    flash(ok, why(e), true);
    /* Reloaded even on a failure, because the half that succeeded — if any —
       is now on screen as it actually is rather than as it was typed. */
    loadPayments();
  });
}

function removePayment(id, btn) {
  if (!window.confirm(
        "Remove this payment?\\n\\nThe client's balance goes back up by the amount, and any " +
        "weeks it settled become unsettled. Do this to correct a mistake, not to record a refund.")) {
    return;
  }
  btn.disabled = true;
  /* The allocation rows go with it: sql/055 makes client_payment_weeks cascade
     on delete, so there is nothing to clear up here by hand. */
  api("client_payments?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).then(function () { loadPayments(); })
    .catch(function (e) {
      btn.disabled = false;
      window.alert("Could not remove it: " + why(e));
    });
}

/* ── files with nobody left to belong to ──────────────────────────────────

   Deleting an application takes the row recording its CV and leaves the CV.
   sql/053 explains why that cannot be fixed with a trigger: storage.objects is
   the metadata, and deleting the row from SQL strands the bytes AND throws
   away the only handle on them.

   So the removing happens here, through the storage API, with the session of
   whoever is looking at this page. 013 already grants staff DELETE on this
   bucket, so nothing new is trusted with anything.

   Not on a timer and not on page load — this is a person deciding to clear up,
   and a page that quietly deletes files while somebody reads it is a page
   nobody should trust with a bucket of CVs. */
function loadOrphans() {
  var box = document.getElementById("orphan-card");
  if (!box) return;
  box.innerHTML = '<span class="spin"></span>Looking for files with no application&hellip;';
  api("rpc/orphan_document_paths", { method: "POST", body: {} })
    .then(function (rows) { drawOrphans(box, rows || []); })
    .catch(function (e) {
      /* Until 053 is pasted this function does not exist and PostgREST answers
         404. An admin page that will not load because a cleanup tool is not
         switched on yet is worse than one without the tool. */
      box.innerHTML =
        "<h2>Files with no application</h2>" +
        '<div class="note"><b>Not switched on yet.</b> Paste sql/053 and this ' +
        "will show anything left in the bucket that nobody can reach.</div>";
    });
}

function drawOrphans(box, rows) {
  var total = 0;
  rows.forEach(function (r) { total += Number(r.bytes || 0); });

  box.innerHTML =
    "<h2>Files with no application</h2>" +
    '<p class="msg" style="margin-top:0">A CV stays in storage when its application is ' +
      "deleted &mdash; the row goes and the file does not. Anything here is unreachable from " +
      "every screen, and still on disk. Somebody who asked us to delete their information " +
      "is only really deleted once this list is empty.</p>" +

    (rows.length
      ? '<div class="note note--warn" style="margin-top:1.1rem"><b>' + rows.length +
          (rows.length === 1 ? " file" : " files") + ", " + kb(total) + ".</b> " +
          "Removing them cannot be undone, and nothing else in the product can reach them.</div>" +
        '<div class="rows" style="margin-top:1rem">' +
          rows.map(function (r) {
            return '<div class="row" data-orphan="' + esc(r.path) + '">' +
              '<div class="row__top"><span class="row__n" style="font-family:\\'IBM Plex Mono\\',monospace;' +
                'font-size:.82rem;overflow-wrap:anywhere">' + esc(r.path) + "</span>" +
                '<span class="row__meta">' + esc(kb(Number(r.bytes || 0))) +
                (r.uploaded ? " &middot; " + esc(when(r.uploaded)) : "") + "</span></div></div>";
          }).join("") +
        "</div>" +
        '<div class="edit__foot" style="margin-top:1.2rem"><span class="hint">' +
          "This deletes the files themselves, not just the record of them.</span>" +
          '<span class="edit__act"><span class="row__ok" id="orphan-ok"></span>' +
          '<button class="btn btn--solid" id="orphan-go" type="button">Delete ' +
            rows.length + (rows.length === 1 ? " file" : " files") + "</button></span></div>"
      : '<div class="note" style="margin-top:1.1rem"><b>Nothing to clear.</b> ' +
        "Every file in the bucket belongs to an application that still exists.</div>");

  var go = document.getElementById("orphan-go");
  if (go) go.addEventListener("click", function () { removeOrphans(rows, go); });
}

/* One at a time, and the count only goes up on a delete that actually
   returned. A sweep that reports success for files it could not remove is how
   somebody ends up believing a deletion request was honoured. */
function removeOrphans(rows, go) {
  if (!window.confirm(
        "Delete " + rows.length + (rows.length === 1 ? " file" : " files") + " for good?\\n\\n" +
        "These belong to applications that no longer exist. This cannot be undone.")) {
    return;
  }
  var ok = document.getElementById("orphan-ok");
  go.disabled = true;
  var done = 0, failed = 0;

  (function step(i) {
    if (i >= rows.length) {
      flash(ok, failed ? done + " deleted, " + failed + " could not be" : done + " deleted",
            failed > 0);
      loadOrphans();
      return;
    }
    flash(ok, "Deleting " + (i + 1) + " of " + rows.length + "…");
    liveSession().then(function (sess) {
      if (!sess) throw new Error("signed out");
      /* Through the storage API, not through SQL — this is the call that takes
         the bytes as well as the record of them. */
      return fetch(storageBase() + "/object/applicant-docs/" + rows[i].path.split("/").map(encodeURIComponent).join("/"), {
        method: "DELETE",
        headers: { apikey: ANON, Authorization: "Bearer " + sess.access_token }
      });
    }).then(function (r) {
      if (r.ok) { done++; } else { failed++; }
    })["catch"](function () { failed++; })
      .then(function () { setTimeout(function () { step(i + 1); }, 200); });
  })(0);
}

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
              /* 060. This is the third button sql/010 never allowed: staff had
                 select and update and nothing else, so a message from somebody
                 asking to be forgotten could not be honoured from in here. */
              (can("applications.edit")
                ? '<button class="btn btn--ghost" data-msg-del type="button" style="padding:.45rem .8rem;font-size:.85rem">Delete</button>'
                : "") +
              '<span class="row__ok" data-msg-ok>Saved</span>' +
            "</div>" +
          "</div>"
        );
      }).join("") +
    "</div>";

  box.querySelectorAll("[data-msg-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest("[data-msg]");
      var id = row.getAttribute("data-msg");
      /* An ordinary confirm. A message is not a person: the panel on the
         queue asks for a name to be typed because what it removes cannot be
         reconstructed, and this can be asked for again. */
      if (!window.confirm(
            "Delete this message?\\n\\nIt goes for good, along with what they wrote. " +
            "Reply first if you still owe them one.")) {
        return;
      }
      b.disabled = true;
      api("contact_messages?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      }).then(loadInbox)
        .catch(function (e) {
          b.disabled = false;
          flash(row.querySelector("[data-msg-ok]"), why(e), true);
        });
    });
  });

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

/* ── downloading a stack of CVs ────────────────────────────────────────────
   The ask was plain: "this is all the applicants we have today, so it is not a
   hassle to download one by one." So it follows whatever filter is on screen —
   set the date filter to Applied today and this is today's stack.

   No zip library, deliberately. This project carries no dependencies and the
   one thing a zip would buy is a single file; against that it would be a third
   party in the path of every CV the business handles. The files come down one
   at a time instead.

   Each one has to be fetched rather than linked. A signed URL points at
   Supabase, which is a different origin, and a download attribute is ignored
   across origins — the browser would navigate to the PDF instead of saving it,
   and the second one would replace the first. Fetching gives a blob on this
   origin, which saves properly and keeps the name we choose. */

/* A name that says whose CV it is at a glance in a downloads folder, and that
   every filesystem will accept. */
function cvName(app, doc, n) {
  var who = String(app.name || app.email || "applicant")
    .normalize("NFKD").replace(/[^\\w\\s-]/g, "").trim().replace(/\\s+/g, "-").slice(0, 40);
  var orig = String(doc.filename || "cv");
  var dot = orig.lastIndexOf(".");
  var ext = dot > 0 ? orig.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  var when_ = String(app.created_at || "").slice(0, 10);
  return (when_ ? when_ + "_" : "") + (who || "applicant") +
         (n > 1 ? "_" + n : "") + (ext ? "." + ext : "");
}

var CVS_RUNNING = false;

function downloadCvs() {
  if (CVS_RUNNING) return;
  var btn = document.getElementById("cvs");
  var msg = document.getElementById("cvs-msg");

  /* Flattened here rather than in the loop, so the count in the button and the
     count that is actually fetched can never be two different numbers. */
  var jobs = [];
  shownRows().forEach(function (a) {
    (a.docs || []).forEach(function (d, i) {
      jobs.push({ app: a, doc: d, name: cvName(a, d, i + 1) });
    });
  });

  if (!jobs.length) {
    msg.textContent = "No CVs attached in this filter";
    setTimeout(function () { msg.textContent = ""; }, 3000);
    return;
  }
  if (jobs.length > 5 && !window.confirm(
        "Download " + jobs.length + " CVs?\\n\\n" +
        "Your browser will ask once whether to allow multiple downloads. Say yes.")) {
    return;
  }

  CVS_RUNNING = true;
  btn.disabled = true;
  var done = 0, failed = 0;

  /* One at a time. A burst of signed-URL requests is a burst against storage
     for no benefit, and the browser saves them in order this way. */
  (function step(i) {
    if (i >= jobs.length) {
      CVS_RUNNING = false;
      btn.disabled = false;
      msg.textContent = failed
        ? done + " saved, " + failed + " could not be fetched"
        : done + (done === 1 ? " CV saved" : " CVs saved");
      setTimeout(function () { msg.textContent = ""; }, 6000);
      return;
    }
    msg.textContent = "Downloading " + (i + 1) + " of " + jobs.length + "…";

    signDoc(jobs[i].doc.path)
      .then(function (url) { return fetch(url); })
      .then(function (r) {
        if (!r.ok) throw new Error("could not fetch");
        return r.blob();
      })
      .then(function (blob) {
        var href = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = href;
        a.download = jobs[i].name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        /* Revoked on a delay, not immediately: revoking in the same tick can
           beat the browser to the save and produce an empty file. */
        setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
        done++;
      })
      .catch(function () { failed++; })
      .then(function () { setTimeout(function () { step(i + 1); }, 350); });
  })(0);
}

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

/* The ranges the date filter offers, and the only place their meaning is
   written down. Each one answers "how many days back does this go", counted in
   whole local days so "today" means today wherever the person reading it is
   sitting rather than wherever the server is. */
var DATE_RANGES = [
  ["",    "Any time"],
  ["0",   "Applied today"],
  ["1",   "Today and yesterday"],
  ["7",   "Last 7 days"],
  ["30",  "Last 30 days"],
  ["90",  "Last 90 days"]
];

/* Whole days between then and now, by local calendar date rather than by
   elapsed hours: an application at 11pm last night is "yesterday", not "0.4
   days ago". */
function daysAgoLocal(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d)) return null;
  var then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}

function shownRows() {
  var q  = (document.getElementById("q").value || "").toLowerCase().trim();
  var st = document.getElementById("filter").value;
  var sk = document.getElementById("fskill").value;
  var lv = document.getElementById("flevel").value;
  var dt = document.getElementById("fdate").value;

  var shown = ALL.filter(function (a) {
    if (dt !== "") {
      var ago = daysAgoLocal(a.created_at);
      if (ago === null || ago < 0 || ago > Number(dt)) return false;
    }
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

/* Both summaries, together, because they read the same ALL and going stale
   separately is how one of them ends up disagreeing with the other. drawStats
   is behind a permission at its only other call site, and asks for its own
   element and returns quietly when it is not on the page, so this is safe on
   an account that cannot see it. */
function repaintSummaries() {
  drawKpis();
  if (can("analytics.view")) drawStats();
}

function paint() {
  repaintSummaries();
  var shown = shownRows();
  document.getElementById("count").textContent =
    shown.length + " of " + ALL.length;
  /* The button says what it will actually fetch, because "Download CVs" over a
     filter holding none of them is a button that does nothing and does not say
     why. Counted the same way the download counts them, so the two can never
     disagree. */
  var cvBtn = document.getElementById("cvs");
  if (cvBtn) {
    var n = 0;
    shown.forEach(function (a) { n += (a.docs || []).length; });
    cvBtn.textContent = n ? "Download " + n + " CV" + (n === 1 ? "" : "s") : "No CVs here";
    cvBtn.disabled = !n || CVS_RUNNING;
  }
  var rows = document.getElementById("rows");
  rows.innerHTML =
    shown.length ? shown.map(rowHtml).join("") : '<p class="msg">Nothing matches that.</p>';
  /* Rewired every paint, because the rows are replaced wholesale and the
     listeners go with them. Everything else on a row is delegated from the
     container; the assessment panel has two controls of its own. */
  wireSit(rows);
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
      /* contacted_by is no longer sent. sql/046 stamps it from the verified
         token whenever last_contacted_at moves, the same way 008 already
         stamps scored_by on this very table — the comment forty lines above
         explains why, and this field was the one that had not been given the
         same treatment. */
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
        /* Mirrored from ME rather than from t, because t no longer carries it
           — the trigger writes it now. Safe to assume: the trigger takes the
           address out of the same token this session is signed in with, so
           this is what it will have written. It is a label until the next
           load, and the next load reads the real one. */
        if (t.last_contacted_at) rec.contacted_by = ME;
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
    /* The tiles and the Breakdown are counted off ALL, which the lines above
       have just changed. Neither was redrawn, so moving somebody from applied
       to assessment left "2 waiting over 3 days" and a pipeline bar reading
       New 2 sitting over a queue that no longer matched them, until a reload.

       Summaries only, deliberately: paint() replaces every row wholesale, and
       doing that here would throw away the focus and the scroll position of
       whoever is part-way through editing the row underneath. */
    repaintSummaries();
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
    /* drawCalendar() reads the date, the stage and the scores. Watching only
       the date left it stale for the two problems it exists to raise: "at
       interview with no date set" moves when the stage does, and
       "interviewed, not scored" clears when a score arrives. */
    if (Object.keys(t).some(function (k) {
      return k === "interview_at" || k === "pipeline" || k.indexOf("score_") === 0;
    })) drawCalendar();
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

function render(email, apps, notes, socials, docs, disc, sits) {
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
  var sitById = {};
  (sits || []).forEach(function (x) { sitById[x.application_id] = x; });
  ALL = apps.map(function (a) {
    a.notes = byId[a.id] || [];
    a.socials = socById[a.id] || [];
    a.docs = docById[a.id] || [];
    a.disc = discById[a.id] || null;
    a.sit = sitById[a.id] || null;
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
      '<button class="rnav" data-tab="place" type="button">' + ICON.place +
        'Placements<span class="rnav__n" id="tab-place"></span></button>' +
      '<span class="rail__k">The team</span>' +
      '<button class="rnav" data-tab="team" type="button">' + ICON.team +
        'Team<span class="rnav__n" id="tab-leave"></span></button>' +
      '<button class="rnav" data-tab="hours" type="button">' + ICON.hours +
        'Timesheets<span class="rnav__n" id="tab-hours"></span></button>' +
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
      /* When they applied. The reason this exists is the CV download beside
         it: "everyone who applied today" is the question somebody actually
         asks before sitting down to read a stack of them, and without a date
         filter the only way to answer it was to read the queue by eye. */
      '<select id="fdate" aria-label="Filter by when they applied">' +
        DATE_RANGES.map(function (d) {
          return '<option value="' + d[0] + '">' + d[1] + "</option>";
        }).join("") +
      "</select>" +
      '<span class="adm__count" id="count"></span>' +
      '<button class="btn btn--ghost" id="csv" type="button" style="padding:.5rem .8rem;font-size:.85rem">Export CSV</button>' +
      '<button class="btn btn--ghost" id="cvs" type="button" style="padding:.5rem .8rem;font-size:.85rem">Download CVs</button>' +
      '<span class="adm__count" id="cvs-msg" aria-live="polite"></span>' +
    "</div>" +
    '<div class="adm__canvas">' +
    '<div data-pane="apps">' +
    '<div class="kpis" id="kpis"></div>' +
    (can("analytics.view") ? '<div id="stats-card"></div>' : "") +
    '<div class="rows" id="rows"></div>' +
    "</div>" +
    '<div data-pane="seats" hidden><div class="card" id="seats-card"></div></div>' +
    '<div data-pane="inbox" hidden><div class="card" id="inbox-card"></div>' +
      '<div class="card" id="orphan-card"></div></div>' +
    '<div data-pane="clients" hidden><div class="card" id="clients-card"></div></div>' +
    '<div data-pane="cal" hidden><div class="card" id="cal-card"></div></div>' +
    '<div data-pane="team" hidden><div class="card" id="leave-card"></div>' +
      '<div class="card" id="notice-card"></div></div>' +
    '<div data-pane="hours" hidden><div class="card" id="ts-card"></div></div>' +
    '<div data-pane="place" hidden><div class="card" id="place-card"></div>' +
      '<div class="card" id="iv-card"></div>' +
      '<div class="card" id="pay-card"></div></div>' +
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
  loadTimesheets();
  loadPlacements();
  loadNotices();
  loadInbox();
  loadOrphans();
  loadClients();
  /* Every other pane is drawn here; this one was drawn from inside the
     client-logo upload handler, two spaces out of line with the callback it
     had landed in. So /admin opened with Interviews blank — not an empty
     state, no card, nothing — and it stayed blank until somebody uploaded a
     logo or saved an interview date. The tab exists to raise three things
     nobody else will (interviewed and never scored, at interview with no
     date, two bookings inside an hour) and its badge counts them, so the
     silence was the failure. */
  drawCalendar();
  document.getElementById("q").addEventListener("input", paint);
  document.getElementById("filter").addEventListener("change", paint);
  document.getElementById("fskill").addEventListener("change", paint);
  document.getElementById("csv").addEventListener("click", exportCsv);
  document.getElementById("flevel").addEventListener("change", paint);
  document.getElementById("fdate").addEventListener("change", paint);
  document.getElementById("cvs").addEventListener("click", downloadCvs);
  /* Selects and checkboxes commit immediately. There is no half-chosen state
     in a dropdown, so there is nothing to wait for. */
  document.getElementById("rows").addEventListener("change", function (e) {
    var row = e.target.closest(".row");
    if (!row) return;
    if (e.target.matches("[data-status], [data-pipe], [data-replied], [data-score], [data-interview]")) {
      save(row);
    }
  });


  /* The name box, delegated like everything else here: the panel it lives in
     does not exist until somebody opens it. */
  document.getElementById("rows").addEventListener("input", function (e) {
    if (!e.target.matches("[data-forget-name]")) return;
    var box = e.target.closest("[data-forget]");
    var go = box.querySelector("[data-forget-go]");
    var want = box.getAttribute("data-forget-want") || "\u0000";
    go.disabled = e.target.value.trim().toLowerCase() !== want;
  });

  document.getElementById("rows").addEventListener("click", function (e) {
    var open = e.target.closest("[data-forget-open]");
    if (open) {
      var r1 = open.closest(".row");
      openForget(r1, byRow(r1));
      return;
    }
    var go = e.target.closest("[data-forget-go]");
    if (go && !go.disabled) {
      var r2 = go.closest(".row");
      doForget(r2, byRow(r2), go);
      return;
    }
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
  noteAuthError();

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
          .catch(function () { return []; }),
        /* Caught for the same reason as the two above: until 045 and 049 are
           pasted this table has no such columns, and an admin page that will
           not load because the assessment is not switched on yet is worse than
           one without the assessment panel. */
        api("application_assessment?select=application_id,track,submitted_at,verdict," +
            "score_english,score_detail,score_sales,score_scenarios,score_typing," +
            "typing_wpm,typing_accuracy,typing_proof,connection_proof," +
            "typing_verified_wpm,typing_verified_accuracy,typing_verified_by," +
            "written_reply,written_score,scenario_answers")
          .catch(function () { return []; })
      ];
      return Promise.all(jobs).then(function (r) {
        render(claims.email, r[0] || [], r[1] || [], r[2] || [], r[3] || [], r[4] || [], r[5] || []);
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

/* Bare, like the admin page. The shell — rail, header bar, columns — is
   built in render() once we know who is signed in, because a rail carrying
   somebody's name cannot be static HTML. Signed out, render() falls back to a
   centred card and this stays out of the way. */
const HUB_BODY = [
  '  <div class="adm__page">',
  '    <p id="hub-lead" hidden></p>',
  '    <div id="hub-root"></div>',
  "  </div>"
].join(nl);

const HUB_SCRIPT = `
var root = document.getElementById("hub-root");
var lead = document.getElementById("hub-lead");
var APP = null;
var ME = "";

/* Every week this person has, keyed by its Monday, and which one the card is
   showing. Kept out here because the card repaints itself after each save
   rather than reloading the whole portal — a page that fetches everything
   again to show one changed number is how a saved thing comes back looking
   like it did not save. */
var SHEETS = {};
var VIEW = "";

/* True when the timesheet tables are not there yet — 030 written but not
   pasted. The rest of the portal does not care, and this is what stops the
   card pretending it is merely empty. */
var TS_OFF = false;

function view(html) { root.innerHTML = html; }

/* How somebody would rather be paid. The choice is stored; nothing else is.
   No account number, no bank detail, no wallet credential ever reaches this
   database — those are set up on the provider's own site with a person. */
var PAY = [
  ["wise_bank",   "Wise, into your bank",        "Pesos into a Philippine bank account. Usually lands in under a minute."],
  ["wise_wallet", "Wise, into GCash or Maya",    "Pesos into your wallet by mobile number. Also GrabPay and ShopeePay."],
  ["payoneer",    "Payoneer",                    "If you already have an account and would rather keep using it."]
];

/* No signedOut() of its own. The shared one carries Google, email and
   password, create-an-account and reset; this page used to shadow it with the
   Google button alone, so an assistant who set a password on /status could not
   get into her own portal. Only the closing line changes. */
SIGNIN_HINT = "Use the address on your application &mdash; that is how we find you. " +
  "If you already made a password on your application page, it is the same one here.";

/* The way out has to be on the page that closed the door.

   Both messages this draws end by telling somebody to sign out: "we cannot
   find an application for <address> — if you applied with a different address,
   sign out and use that one." There was no sign-out on it. No header either,
   and no brand mark: /hub draws its chrome in render(), and shut() returns
   before render() ever runs, so the locked-out state was a bare white page
   with one link on it.

   Somebody signed in on the wrong address — which is precisely who this
   message is addressed to — could read the instruction and had nothing to
   follow it with. Walked on 2 Sep as an account with no application, which is
   the state that produces it. */
function shut(title, body) {
  view(
    /* The page has to say whose it is.

       /hub passes app:true to shell(), which drops the site header on purpose:
       an assistant who is signed in gets the sidebar this portal draws for
       itself, and two sets of navigation would be worse than one. But the
       sidebar is drawn in render(), and shut() runs instead of render() — so
       the locked-out state inherited the missing header and grew nothing in
       its place. Bare white, one notice, no mark of what site it belonged to.

       Not the sidebar: that is a hired assistant's navigation and every link
       in it goes somewhere this person cannot reach. A wordmark that goes
       home is the whole of what is missing. */
    '<a class="brand" href="/" aria-label="SecureJobVA home" ' +
      'style="display:inline-flex;margin-bottom:1.4rem">' +
      '<span class="brand__word">SecureJob<b class="brand__va">VA</b></span>' +
    "</a>" +
    '<div class="card">' +
      '<div class="note"><b>' + esc(title) + "</b> " + body + "</div>" +
      '<p style="margin-top:1.2rem;display:flex;gap:.6rem;flex-wrap:wrap">' +
        '<a class="btn btn--ghost" href="/status">See where your application is</a>' +
        '<button class="btn btn--ghost" id="shut-out" type="button">Sign out</button>' +
      "</p>" +
    "</div>"
  );
  /* After view(), because the button does not exist until the markup is in the
     document — the same order wireEdit and the rest use. */
  var out = document.getElementById("shut-out");
  if (out) out.addEventListener("click", signOut);
}

function tile(href, label, path, sub) {
  return '<a class="tl" href="' + href + '">' +
    '<span class="tl__art"><svg viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg></span>" +
    '<span class="tl__l">' + esc(label) +
      (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></a>";
}

/* ── who they work for ──
   The first thing on the page once somebody is placed, because it is the
   answer to the question they open the portal asking.

   No money on this card, and none anywhere else in /hub. 032 does let an
   assistant read their own rate, so this is a choice rather than a limit: the
   admin form promises in as many words that their portal shows hours and no
   money at all, and a promise made on one screen has to be true on the other. */
var PLACE = null;
/* True when 032 is not pasted, so the page cannot tell whether somebody has a
   client. Different from having none, and it must not be shown as having none. */
var PLACE_OFF = false;

function trialEnds(p) {
  if (!p.started_on || !p.trial_weeks) return null;
  return isoDay(addDays(fromIso(p.started_on), p.trial_weeks * 7 - 1));
}

/* Small on purpose. Only the four things she can actually change and would
   think to look for — the rest of her application is edited on /status, where
   that form already lives, and duplicating it here would be two forms writing
   the same columns and drifting apart.

   Every field here is in 006's column grant. A box she can type in and not
   save is worse than no box. */
var SET_FIELDS = [
  ["phone",        "WhatsApp or phone",  "tel"],
  ["region",       "State or region",    "text"],
  ["availability", "Hours you can work", "text"],
  ["cv",           "Link to your CV",    "url"]
];

/* The exact words shown beside the box. Stored with the answer, because 004
   keeps three columns for this on purpose: the boolean says they agreed, the
   timestamp says when, and this says which wording they were agreeing to.
   Change the sentence and the record of who agreed to what still holds. */
var CONSENT_TEXT = "SecureJobVA may post about my work, and use my first name and photo, " +
  "on its own social accounts and website.";

function settingsCard(a) {
  var rows = SET_FIELDS.map(function (f) {
    return '<div class="fld"><label for="set-' + f[0] + '">' + esc(f[1]) + "</label>" +
      '<input id="set-' + f[0] + '" type="' + f[2] + '" value="' +
      esc(a[f[0]] === null || a[f[0]] === undefined ? "" : a[f[0]]) + '"></div>';
  }).join("");

  /* She gets better at things. A level set the day she applied and never
     changeable is a level that goes stale and stops meaning anything. */
  var skills = SKILLS.map(function (sk) {
    return '<div class="fld"><label for="set-' + sk[0] + '">' + esc(sk[1]) + "</label>" +
      '<select id="set-' + sk[0] + '">' +
      LEVELS.map(function (lv) {
        return '<option value="' + lv + '"' +
          ((a[sk[0]] || "beginner") === lv ? " selected" : "") + ">" +
          esc(LEVEL_LABEL[lv]) + "</option>";
      }).join("") + "</select></div>";
  }).join("");

  return '<div class="card">' +
      "<h2>Your details</h2>" +
      '<p class="msg" style="margin-top:.35rem">Keep these current &mdash; they are how we reach ' +
        "you and how we know what hours you can work.</p>" +
      '<div class="edit__grid">' + rows + "</div>" +
      '<label class="chk" style="margin-top:.4rem"><input type="checkbox" id="set-kit"' +
        (a.has_equipment ? " checked" : "") + "> I have my own computer and internet</label>" +
      '<div class="fld" style="margin-top:.9rem"><label for="set-note">Anything we should know' +
        '</label><textarea id="set-note" rows="3">' +
        esc(a.note === null || a.note === undefined ? "" : a.note) + "</textarea></div>" +
      '<p class="err" id="set-err" aria-live="polite"></p>' +
      '<div class="edit__foot"><span></span><span class="edit__act">' +
        '<span class="row__ok" id="set-ok"></span>' +
        '<button class="btn btn--solid" id="set-go" type="button">Save</button>' +
      "</span></div>" +
    "</div>" +

    '<div class="card">' +
      "<h2>Your skills</h2>" +
      '<p class="msg" style="margin-top:.35rem">Say where you are now, not where you were when ' +
        "you applied. This is what we match you on.</p>" +
      '<div class="edit__grid">' + skills + "</div>" +
      '<div class="edit__foot"><span></span><span class="edit__act">' +
        '<span class="row__ok" id="skill-ok"></span>' +
        '<button class="btn btn--solid" id="skill-go" type="button">Save skills</button>' +
      "</span></div>" +
    "</div>" +

    '<div class="card">' +
      "<h2>Posting about your work</h2>" +
      '<p class="msg" style="margin-top:.35rem">This is yours to decide and yours to change, ' +
        "at any time. Turning it off does not affect your work or your pay in any way.</p>" +
      '<label class="chk" style="margin-top:.6rem"><input type="checkbox" id="set-consent"' +
        (a.posting_consent ? " checked" : "") + "> " + esc(CONSENT_TEXT) + "</label>" +
      (a.posting_consent && a.posting_consent_at
        ? '<p class="msg">You agreed to this on ' + esc(when(a.posting_consent_at)) + ".</p>"
        : "") +
      '<div class="edit__foot"><span></span><span class="edit__act">' +
        '<span class="row__ok" id="consent-ok"></span>' +
        '<button class="btn btn--ghost" id="consent-go" type="button">Save this choice</button>' +
      "</span></div>" +
    "</div>" +

    '<div class="card">' +
      "<h2>Your account</h2>" +
      '<ul class="meta">' +
        "<li><b>Signed in as</b><span>" + esc(ME) + "</span></li>" +
        "<li><b>Name</b><span>" + (a.name ? esc(a.name) : "&mdash;") + "</span></li>" +
      "</ul>" +
      '<p class="msg">Your name and email are how your application is found, so they are ' +
        "changed by asking us rather than here. Write to " +
        '<a href="mailto:support@securejobva.com">support@securejobva.com</a> and a person ' +
        "will do it.</p>" +
      '<p class="msg">The whole of your application &mdash; skills, equipment, the rest &mdash; ' +
        'is on <a href="/status">your application page</a>.</p>' +
    "</div>" +

    '<div class="card">' +
      "<h2>Appearance</h2>" +
      '<p class="msg" style="margin-top:.35rem">This portal follows your device by default. ' +
        "Pick one if you would rather it stayed put.</p>" +
      '<div class="row__ctl" style="margin-top:.8rem">' +
        '<button class="btn btn--ghost" data-theme-set="light" type="button">Light</button>' +
        '<button class="btn btn--ghost" data-theme-set="dark" type="button">Dark</button>' +
        '<button class="btn btn--ghost" data-theme-set="" type="button">Follow my device</button>' +
        '<span class="row__ok" id="theme-ok"></span>' +
      "</div>" +
    "</div>";
}

function wireSettings(a) {
  var go = document.getElementById("set-go");
  if (go) {
    go.addEventListener("click", function () {
      var err = document.getElementById("set-err");
      var ok = document.getElementById("set-ok");
      var body = {};
      err.textContent = "";
      for (var i = 0; i < SET_FIELDS.length; i++) {
        var el = document.getElementById("set-" + SET_FIELDS[i][0]);
        body[SET_FIELDS[i][0]] = el.value.trim() || null;
      }
      body.has_equipment = document.getElementById("set-kit").checked;
      body.note = document.getElementById("set-note").value.trim() || null;
      go.disabled = true;
      flash(ok, "Saving\\u2026");
      api("applications?id=eq." + encodeURIComponent(a.id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: body
      }).then(function () {
        go.disabled = false;
        for (var k in body) a[k] = body[k];
        flash(ok, "Saved");
      }).catch(function (e) {
        go.disabled = false;
        flash(ok, why(e), true);
      });
    });
  }

  var skillGo = document.getElementById("skill-go");
  if (skillGo) {
    skillGo.addEventListener("click", function () {
      var ok = document.getElementById("skill-ok");
      var body = {};
      for (var i = 0; i < SKILLS.length; i++) {
        body[SKILLS[i][0]] = document.getElementById("set-" + SKILLS[i][0]).value;
      }
      skillGo.disabled = true;
      flash(ok, "Saving\\u2026");
      api("applications?id=eq." + encodeURIComponent(a.id), {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: body
      }).then(function () {
        skillGo.disabled = false;
        for (var k in body) a[k] = body[k];
        flash(ok, "Saved");
      }).catch(function (e) { skillGo.disabled = false; flash(ok, why(e), true); });
    });
  }

  /* All three columns together or none. The boolean on its own is a claim
     nobody can check later — 004 keeps the timestamp and the wording precisely
     so that "they agreed" can be answered with "to this, on that day". */
  var consentGo = document.getElementById("consent-go");
  if (consentGo) {
    consentGo.addEventListener("click", function () {
      var ok = document.getElementById("consent-ok");
      var on = document.getElementById("set-consent").checked;
      consentGo.disabled = true;
      flash(ok, "Saving\\u2026");
      api("applications?id=eq." + encodeURIComponent(a.id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: {
          posting_consent: on,
          posting_consent_at: on ? new Date().toISOString() : null,
          posting_consent_text: on ? CONSENT_TEXT : null
        }
      }).then(function () {
        consentGo.disabled = false;
        a.posting_consent = on;
        flash(ok, on ? "Saved — thank you" : "Saved — we will not post about you");
      }).catch(function (e) { consentGo.disabled = false; flash(ok, why(e), true); });
    });
  }

  /* Same store the rest of the site's toggle uses, so a choice made here is
     the choice everywhere. An empty value means follow the device, which is
     what removing the attribute does. */
  document.querySelectorAll("[data-theme-set]").forEach(function (b) {
    b.addEventListener("click", function () {
      var want = b.getAttribute("data-theme-set");
      var root = document.documentElement;
      if (want) { root.setAttribute("data-theme", want); }
      else { root.removeAttribute("data-theme"); }
      try {
        if (want) localStorage.setItem("sjva-theme", want);
        else localStorage.removeItem("sjva-theme");
      } catch (e) {}
      flash(document.getElementById("theme-ok"), "Saved");
    });
  });
}

/* What she needs to know before deciding what to do, on one screen. Landing
   somebody on a data-entry form asks them to work before telling them anything;
   this answers the four questions first — how many hours am I on, who am I
   with, when does the trial end, and is anything waiting on me. */
function overviewCard(leaves, notices) {
  var week = SHEETS[VIEW];
  var hours = totalOf(week);
  var status = week ? week.status : "draft";
  var pending = (leaves || []).filter(function (l) { return l.status === "pending"; });
  var live = (notices || []).filter(function (n) { return n.published_at; });

  var tile = function (n, label, kind) {
    return '<div class="tile' + (kind ? " tile--" + kind : "") + '">' +
      '<span class="tile__n">' + n + '</span><span class="tile__l">' + label + "</span></div>";
  };

  var says;
  if (!PLACE) {
    says = "You are on the team. We are matching you with a client now, and we will email you " +
      "the moment we have somebody.";
  } else if (status === "approved") {
    says = "This week is agreed. Nothing else is needed from you for it.";
  } else if (status === "submitted") {
    says = "This week is with " + esc((PLACE.clients && PLACE.clients.name) || "your client") +
      ". They will approve it or send it back, and we will email you either way.";
  } else if (status === "returned") {
    says = "This week came back to you with a note. Open Hours and timesheet to see it.";
  } else if (hours > 0) {
    says = "You have " + esc(showHours(hours)) + " hours down and have not sent them yet.";
  } else {
    says = "Nothing recorded for this week yet.";
  }

  return '<div class="card">' +
    "<h2>This week</h2>" +
    '<p class="msg" style="margin-top:.35rem">' + says + "</p>" +
    '<div class="tiles">' +
      tile(esc(showHours(hours)) + '<span style="font-size:.9rem;font-weight:400"> / ' +
        WEEK_TARGET + "</span>", "hours this week") +
      (PLACE
        ? tile('<span style="font-size:1.05rem">' +
            esc((PLACE.clients && PLACE.clients.name) || "your client") + "</span>", "your client")
        : tile('<span style="font-size:1.05rem">&mdash;</span>', "no client yet")) +
      (PLACE && PLACE.status === "trial" && trialEnds(PLACE)
        ? tile('<span style="font-size:1.05rem">' + esc(when(trialEnds(PLACE))) + "</span>",
            "trial ends")
        : tile('<span style="font-size:1.05rem">' +
            esc(TS_LABEL[status] || status) + "</span>", "this week")) +
      tile(pending.length, "leave waiting", pending.length ? "warn" : "") +
    "</div>" +
    (live.length
      ? '<div class="nts" style="margin-top:1.1rem">' + noticeRow(live[0]) + "</div>"
      : "") +
  "</div>";
}

function clientCard() {
  /* Nothing here used to render at all before somebody was matched, on the
     reasoning that an absence claims nothing. Walking it as the assistant
     showed that is wrong: she is hired, the portal is open, and the one
     question she has — am I getting a client? — went unanswered by a blank
     space. Silence is not neutral when somebody is waiting on you.

     PLACE_OFF is the other case: 032 not pasted. That one really does render
     nothing, because "we are finding you a client" would be a claim made by a
     page that cannot see whether it is true. */
  if (!PLACE) {
    if (PLACE_OFF) return "";
    return '<div class="card" id="client">' +
      "<h2>Finding you a client</h2>" +
      '<p class="msg" style="margin-top:.4rem">You are on the team and we are matching you ' +
        "with a business now. There is nothing for you to do while we do it &mdash; " +
        "we will email you the moment we have somebody, and this is where it will appear.</p>" +
      '<p class="msg">In the meantime your hours, your leave and the notice board below are ' +
        "all yours to use.</p>" +
    "</div>";
  }
  var name = (PLACE.clients && PLACE.clients.name) || "your client";
  var ends = trialEnds(PLACE);

  var says;
  if (PLACE.status === "matched") {
    says = "We have matched you with them. The next step is a meeting, and we will be in " +
      "touch to arrange it &mdash; nothing is settled until after that.";
  } else if (PLACE.status === "trial") {
    says = "You started on " + esc(when(PLACE.started_on)) + "." +
      (ends ? " Your trial runs until " + esc(when(ends)) +
        " &mdash; we will let you know as soon as they confirm." : "") +
      /* Said plainly because it is the question somebody on a trial actually
         has, and because a trial that does not say it is paid reads as one
         that is not. */
      " <b>The trial is paid</b>, by us, the same as any other week.";
  } else if (PLACE.status === "ongoing") {
    says = "You have been kept on. You started on " + esc(when(PLACE.started_on)) +
      " and you stay on the SecureJobVA team throughout &mdash; we pay you, as always.";
  } else {
    says = "This placement has ended. Anything you worked is still on your timesheet.";
  }

  return '<div class="card" id="client">' +
    '<div class="ts__hd"><h2>' + esc(name) + "</h2>" +
      '<span class="pill pill--pl_' + esc(PLACE.status) + '">' +
      esc(PLACE_LABEL[PLACE.status] || PLACE.status) + "</span></div>" +
    '<p class="msg" style="margin-top:.4rem">' + says + "</p>" +
    '<div class="tiles">' +
      '<div class="tile"><span class="tile__n">' + esc(PLACE.hours_per_week) +
        '</span><span class="tile__l">hours a week</span></div>' +
      /* "started" is a claim, and on a matched placement it is not true yet —
         the card says in the line above that nothing is settled, then a tile
         underneath said they had already begun. */
      (PLACE.started_on
        ? '<div class="tile"><span class="tile__n" style="font-size:1.1rem">' +
          esc(when(PLACE.started_on)) + '</span><span class="tile__l">' +
          (PLACE.status === "matched" ? "would start" : "started") + "</span></div>"
        : "") +
      (ends && PLACE.status === "trial"
        ? '<div class="tile"><span class="tile__n" style="font-size:1.1rem">' +
          esc(when(ends)) + '</span><span class="tile__l">trial ends</span></div>'
        : "") +
    "</div>" +
  "</div>";
}

/* ── the timesheet ──
   A week is named by its Monday and the database will not take a guess at it,
   so the Monday is worked out here from local date parts. toISOString() would
   be tempting and wrong: it is UTC, and for the first eight hours of every
   Monday in Manila it would file the day against the week that just ended. */
function isoDay(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

function fromIso(s) {
  var p = String(s).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function addDays(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function mondayOf(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

var DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* What a full week is. An employer sets the hours and 40 is the floor rather
   than the ceiling, so this is shown as something to measure against and never
   enforced — a week is not refused for being over it or under it. Printing the
   total on its own left "18.5" meaning nothing without knowing what was
   expected of it. */
var WEEK_TARGET = 40;
var TS_LABEL = { draft: "not sent yet", submitted: "waiting on us",
                 approved: "approved", returned: "sent back" };
var PLACE_LABEL = { matched: "matched", trial: "on trial",
                    ongoing: "kept on", ended: "ended" };

/* Two decimals, then the trailing zeros taken off: 38 rather than 38.00, and
   18.5 rather than 18.50, without turning 7.25 into 7.3. */
function showHours(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\\.$/, "");
}

function dayIn(sheet, iso) {
  var ds = (sheet && sheet.timesheet_days) || [];
  for (var i = 0; i < ds.length; i++) if (ds[i].worked_on === iso) return ds[i];
  return null;
}

function totalOf(sheet) {
  var ds = (sheet && sheet.timesheet_days) || [], t = 0;
  for (var i = 0; i < ds.length; i++) t += Number(ds[i].hours || 0);
  return t;
}

/* Hours typed in and not yet on their way anywhere. Nothing at all when there
   is nothing to say — a tile reading "0 h not sent" is noise pretending to be
   information, the same reason badge() prints nothing for zero. */
function unsentLabel() {
  var t = 0;
  for (var k in SHEETS) {
    var s = SHEETS[k];
    if (s.status === "draft" || s.status === "returned") t += totalOf(s);
  }
  return t > 0 ? showHours(t) + " h not sent" : "";
}

function weekLabel(iso) {
  var a = fromIso(iso), b = addDays(a, 6);
  var f = { weekday: "short", month: "short", day: "numeric" };
  return a.toLocaleDateString(undefined, f) + " to " + b.toLocaleDateString(undefined, f);
}

function dayRow(sheet, iso, i, open) {
  var d = dayIn(sheet, iso);
  var wknd = i > 4;
  return '<div class="day' + (wknd ? " day--wknd" : "") + '" data-day="' + esc(iso) + '">' +
    '<span class="day__d"><span class="day__n">' + DAY_NAME[i] + "</span>" +
      '<span class="day__t">' +
        esc(fromIso(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })) +
      "</span></span>" +
    '<input class="day__note" data-note type="text" maxlength="500" value="' +
      esc(d && d.note ? d.note : "") + '" placeholder="' +
      (wknd ? "&mdash;" : "What you worked on (optional)") + '"' +
      (open ? "" : " disabled") + ">" +
    '<input class="hrs" data-hrs type="number" min="0" max="24" step="0.25" value="' +
      esc(d ? showHours(Number(d.hours)) : "0") + '"' + (open ? "" : " disabled") +
      ' aria-label="Hours on ' + DAY_NAME[i] + '">' +
  "</div>";
}

/* The card shows one week at a time, and which week is a thing you can move.
   Showing only the current week would mean that from Tuesday onwards there is
   no way to reach the week you are actually supposed to be sending, and no way
   at all to fix one that came back. */
function hoursCard() {
  if (TS_OFF) {
    return "<h2>Hours and timesheet</h2>" +
      '<div class="note"><b>Not switched on yet.</b> Your hours will be entered here. ' +
      "Nothing is missing and there is nothing for you to do &mdash; everything else on this " +
      "page works as normal.</div>";
  }
  var sheet = SHEETS[VIEW] || null;
  var status = sheet ? sheet.status : "draft";
  var open = status === "draft" || status === "returned";
  var mon = fromIso(VIEW);
  var here = isoDay(mondayOf(new Date()));
  var total = totalOf(sheet);

  var rows = "";
  for (var i = 0; i < 7; i++) rows += dayRow(sheet, isoDay(addDays(mon, i)), i, open);

  var back = isoDay(addDays(mon, -7));
  var fwd = isoDay(addDays(mon, 7));
  var floor = isoDay(addDays(mondayOf(new Date()), -8 * 7));

  var foot;
  if (status === "submitted") {
    foot = '<span class="hint">Sent ' + esc(when(sheet.submitted_at)) +
           ". Nobody has looked at it yet.</span>";
  } else if (status === "approved") {
    foot = '<span class="hint">Approved by ' + esc(sheet.decided_by || "somebody") +
           " on " + esc(when(sheet.decided_at)) + ". This is the number pay is run from.</span>";
  } else {
    foot = '<span class="hint">' +
      (status === "returned"
        ? "Change what needs changing and send it back to us."
        : "Nothing is sent until you press the button, and you can change any of it until you do.") +
      "</span>" +
      '<span class="edit__act"><span class="row__ok" id="ts-ok"></span>' +
      '<button class="btn btn--solid" id="ts-go" type="button"' +
        (total > 0 ? "" : " disabled") + ">" +
        (status === "returned" ? "Send it again" : "Send this week") + "</button></span>";
  }

  return "<h2>Hours and timesheet</h2>" +
    '<div class="ts__hd">' +
      '<span class="ts__wk">' + esc(weekLabel(VIEW)) + "</span>" +
      '<span class="pill pill--ts_' + esc(status) + '">' + esc(TS_LABEL[status] || status) + "</span>" +
    "</div>" +
    (status === "returned" && sheet.note
      ? '<div class="note note--warn" style="margin-top:.8rem"><b>Sent back:</b> ' + esc(sheet.note) + "</div>"
      : "") +
    '<div class="ts__nav" style="display:flex;gap:.4rem;margin-top:.8rem">' +
      '<button class="btn btn--ghost" data-week="' + esc(back) + '" type="button" ' +
        'style="padding:.35rem .7rem;font-size:.85rem"' + (back < floor ? " disabled" : "") +
        ">&larr; Week before</button>" +
      '<button class="btn btn--ghost" data-week="' + esc(fwd) + '" type="button" ' +
        'style="padding:.35rem .7rem;font-size:.85rem"' + (VIEW >= here ? " disabled" : "") +
        ">Week after &rarr;</button>" +
    "</div>" +
    '<div class="sheet">' + rows +
      '<div class="sum"><span class="sum__l">Total this week</span>' +
      '<span class="sum__v">' + esc(showHours(total)) +
        " <small>of " + WEEK_TARGET + " hours</small></span></div>" +
    "</div>" +
    '<div class="edit__foot" style="margin-top:1rem">' + foot + "</div>" +
    pastWeeks();
}

function pastWeeks() {
  var out = [];
  for (var k in SHEETS) if (k !== VIEW) out.push(SHEETS[k]);
  out.sort(function (a, b) { return a.week_starts_on < b.week_starts_on ? 1 : -1; });
  if (!out.length) return "";

  return '<div class="wks">' + out.map(function (s) {
    var msg = s.status === "approved"
      ? "approved by " + (s.decided_by || "somebody") + " on " + when(s.decided_at)
      : s.status === "returned"
        ? (s.note || "sent back")
        : s.status === "submitted"
          ? "sent " + when(s.submitted_at) + " \\u00b7 nobody has looked yet"
          : "not sent yet";
    return '<div class="wk"><button class="btn btn--ghost wk__d" data-week="' +
      esc(s.week_starts_on) + '" type="button" style="padding:.2rem .5rem;font-size:.85rem">' +
      esc(weekLabel(s.week_starts_on)) + "</button>" +
      '<span class="pill pill--ts_' + esc(s.status) + '">' +
        esc(TS_LABEL[s.status] || s.status) + "</span>" +
      '<span class="wk__h">' + esc(showHours(totalOf(s))) + " h</span>" +
      '<span class="wk__m">' + esc(msg) + "</span></div>";
  }).join("") + "</div>";
}

function paintHours() {
  var card = document.getElementById("hours");
  if (!card) return;
  card.innerHTML = hoursCard();
}

/* What a day edit is allowed to redraw.

   Saving happens on the change event, which is on blur — so by the time the write
   comes back the person has almost always moved on and is typing in the next
   box. paintHours() replaces the card's innerHTML, which threw that away: the
   half-typed number vanished, the focus went with it, and nothing said so. The
   only sign was the total refusing to add up. Filling a week in quickly lost
   three days out of five, and every one of them looked like a slip of the
   hand rather than the page.

   A day edit can only move three things, so it moves exactly those three and
   leaves every input alone. Anything wider is redrawn by the next real paint —
   changing week, sending, reloading. */
function refreshTotals() {
  var sheet = SHEETS[VIEW];
  var total = totalOf(sheet);

  var sum = document.querySelector("#hours .sum__v");
  if (sum) {
    sum.innerHTML = esc(showHours(total)) +
      " <small>of " + WEEK_TARGET + " hours</small>";
  }
  /* Send is refused on an empty week, and the first number typed is what makes
     it allowed. */
  var go = document.getElementById("ts-go");
  if (go) go.disabled = !(total > 0);

  var top = document.querySelector(".adm__topn b");
  if (top) top.textContent = showHours(total);
}

/* The week row is made the first time somebody actually types a number into
   it, not when the page opens. Otherwise every assistant who looks at this
   page and closes it leaves an empty week behind, and the admin queue fills up
   with nothing. */
/* One request for the week, however many days are typed at once.

   Filling five boxes in a burst calls this five times before any of them has
   come back. Each looked, saw no week yet, and posted one — and the unique key
   on (application_id, week_starts_on) refuses the four that lose, so four days
   never saved at all. Monday won the race and Friday arrived late enough to
   find the week already made; the three in the middle were dropped, and the
   running total was the only thing that ever said so.

   The same shape as RENEWING on the token refresh: work that must happen once
   has to be held, not merely checked for. Keyed by week, because the person
   can change week while the request is still out. */
var MAKING = null;
var MAKING_WEEK = "";

function ensureSheet() {
  var have = SHEETS[VIEW];
  if (have && have.id) return Promise.resolve(have);
  if (MAKING && MAKING_WEEK === VIEW) return MAKING;

  var week = VIEW;
  MAKING_WEEK = week;
  MAKING = api("timesheets", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { application_id: APP.id, week_starts_on: week }
  }).then(function (rows) {
    var s = (rows || [])[0];
    if (!s) throw new Error("no row came back");
    s.timesheet_days = [];
    SHEETS[week] = s;
    MAKING = null;
    return s;
  }, function (e) {
    MAKING = null;
    throw e;
  });
  return MAKING;
}

function saveDay(iso, rowEl, ok) {
  var hrsEl = rowEl.querySelector("[data-hrs]");
  var noteEl = rowEl.querySelector("[data-note]");
  var hours = Number(hrsEl.value || 0);
  var note = String(noteEl.value || "").trim() || null;

  if (!(hours >= 0 && hours <= 24)) {
    flash(ok, "Hours have to be between 0 and 24", true);
    return;
  }

  flash(ok, "Saving\\u2026");
  ensureSheet().then(function (sheet) {
    var d = dayIn(sheet, iso);
    if (d) {
      return api("timesheet_days?id=eq." + encodeURIComponent(d.id), {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { hours: hours, note: note }
      }).then(function (rows) {
        var got = (rows || [])[0];
        if (got) { d.hours = got.hours; d.note = got.note; }
      });
    }
    return api("timesheet_days", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { timesheet_id: sheet.id, worked_on: iso, hours: hours, note: note }
    }).then(function (rows) {
      var got = (rows || [])[0];
      if (got) sheet.timesheet_days.push(got);
    });
  }).then(function () {
    refreshTotals();
    var el = document.getElementById("ts-ok");
    flash(el, "Saved");
  }).catch(function (e) {
    /* Put the box back to what the database actually holds. A number that
       failed to save must not sit there looking saved — that is precisely what
       made the week race so hard to see, because the screen went on agreeing
       with itself while three days were missing. Until the redraw was fixed
       this happened by accident; now it has to be done on purpose. */
    var sheet = SHEETS[VIEW];
    var d = sheet && dayIn(sheet, iso);
    hrsEl.value = d ? Number(d.hours) : 0;
    refreshTotals();
    flash(document.getElementById("ts-ok") || ok, why(e), true);
  });
}

function wireHours() {
  var card = document.getElementById("hours");
  if (!card) return;

  card.addEventListener("click", function (e) {
    var b = e.target.closest("[data-week]");
    if (!b || b.disabled) return;
    VIEW = b.getAttribute("data-week");
    paintHours();
  });

  /* change rather than input: a number box fires input on every keystroke, and
     saving "1" on the way to "18" writes a wrong number and then corrects it. */
  card.addEventListener("change", function (e) {
    var el = e.target.closest("[data-hrs], [data-note]");
    if (!el) return;
    var row = el.closest("[data-day]");
    if (row) saveDay(row.getAttribute("data-day"), row, document.getElementById("ts-ok"));
  });

  card.addEventListener("click", function (e) {
    if (!e.target.closest("#ts-go")) return;
    var sheet = SHEETS[VIEW];
    var ok = document.getElementById("ts-ok");
    if (!sheet || !sheet.id) { flash(ok, "Put some hours in first", true); return; }
    flash(ok, "Sending\\u2026");
    api("timesheets?id=eq." + encodeURIComponent(sheet.id), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { status: "submitted" }
    }).then(function (rows) {
      var got = (rows || [])[0];
      if (got) { got.timesheet_days = sheet.timesheet_days; SHEETS[VIEW] = got; }
      paintHours();
    }).catch(function (e) { flash(document.getElementById("ts-ok"), why(e), true); });
  });
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

  /* The rail replaces the tiles. They were doing a rail's job — six links to
     the same page — while a narrow column of cards ran down the middle of
     whatever screen somebody had. Same links, at the side, and the content
     gets the whole width. */
  /* Buttons, not links. An anchor scrolled the page to a card further down,
     which is not what a rail is for — you press a thing on the left and the
     right changes. Same behaviour as the staff desk. */
  var nav = function (pane, label, path, badge, on) {
    return '<button class="rnav' + (on ? " is-on" : "") + '" data-hub="' + pane +
      '" type="button"><svg viewBox="0 0 24 24">' + path + "</svg>" + esc(label) +
      (badge ? '<span class="rnav__n is-warn">' + esc(badge) + "</span>" : "") + "</button>";
  };
  var unsent = unsentLabel();

  view(
    '<div class="adm__wrap">' +
      '<nav class="rail">' +
        '<a class="rail__brand" href="/">SecureJob<b>VA</b></a>' +
        '<div class="rail__me"><span class="who__av">' +
          esc(first.charAt(0).toUpperCase()) + "</span><span><b>" +
          esc(a.name || "Your account") + "</b>" + esc(ME) + "</span></div>" +

        '<span class="rail__k">Your work</span>' +
        nav("home", "Overview",
          '<path d="M4 11.5 12 4l8 7.5"></path><path d="M6.5 10.5V20h11v-9.5"></path>', "", true) +
        nav("hours", "Hours and timesheet",
          '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5.2l3.3 2"></path>', unsent) +
        nav("client", "Your client",
          '<path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.6"></circle>') +

        '<span class="rail__k">Your account</span>' +
        nav("leave", "Ask for leave",
          '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M8 3v4M16 3v4M3.5 10h17"></path>') +
        nav("pay", "Getting paid",
          '<rect x="3" y="6" width="18" height="12.5" rx="2"></rect><path d="M3 10.5h18M6.5 15h4"></path>') +
        nav("notices", "Notice board", '<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"></path>') +
        nav("settings", "Settings",
          '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"></path>') +

        '<span class="rail__k">Elsewhere</span>' +
        '<a class="rnav" href="/status"><svg viewBox="0 0 24 24">' +
          '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"></path>' +
          "</svg>Your application</a>" +

        '<div class="rail__foot">' +
          '<a class="rlink" href="/contact?about=tech">Something broken</a>' +
          '<a class="rlink" href="/contact?about=work">Your work or your pay</a>' +
          '<div class="rail__acts">' +
            '<button class="rbtn" id="out" type="button">Sign out</button></div>' +
        "</div>" +
      "</nav>" +

      '<div class="adm__main">' +
        '<div class="adm__top">' +
          '<span><span class="k">Your portal</span>' +
            '<div class="hub__hi"><h2>Hello, ' + esc(first) + ".</h2>" +
            "<p>You are on the team. This is yours.</p></div></span>" +
          '<span class="adm__topn"><span class="k">this week</span><b>' +
            esc(showHours(totalOf(SHEETS[VIEW]))) + "</b></span>" +
        "</div>" +

        '<div class="hub__body">' +
          /* 057. Above the overview and only while there is one to arrange.
             An interview she has not answered is the most urgent thing on this
             page by some distance — it is the conversation that decides the
             seat, and it is sitting on her. */
          '<div data-hpane="home">' + interviewCard(PLACE) + overviewCard(leaves, notices) + "</div>" +
          '<div data-hpane="hours" hidden><div class="card" id="hours">' + hoursCard() + "</div></div>" +
          '<div data-hpane="client" hidden>' + clientCard() + "</div>" +
          '<div data-hpane="leave" hidden>' +
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

        "</div>" +

        '<div data-hpane="pay" hidden>' +

    '<div class="card" id="pay">' +
      "<h2>Getting paid</h2>" +
      '<p class="msg" style="margin-top:0">We send through Wise, which reaches a Philippine bank account or a GCash, Maya, GrabPay or ShopeePay wallet. Tell us which you would rather, and we will set it up with you.</p>' +
      '<div class="pays">' + pay + "</div>" +
      '<p class="msg"><b>We never ask for your account details on this page.</b> Nothing about where your money goes is stored here &mdash; that is agreed with a person and set up on the provider\\'s own site.</p>' +
      '<span class="row__ok" id="pay-ok"></span>' +
    "</div>" +
        "</div>" +

        '<div data-hpane="notices" hidden>' +
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
    "</div>" +
        "</div>" +

        /* 056. Under her own settings, which is where somebody looks for it.
           An assistant on American hours from Manila is the person this exists
           for: the browser's guess is right about where she is and wrong about
           the clock she works to. */
        '<div data-hpane="settings" hidden>' + settingsCard(a) + tzCard() + "</div>" +
      "</div>" +
    "</div>" +
  "</div>"
  );

  document.getElementById("out").addEventListener("click", signOut);
  wireHubTabs();
  wireInterviewHub();
  wireTz();
  wireSettings(a);
  wireLeave();
  wirePay();
  wireHours();
}

/* Press a thing on the left, the right changes. An anchor scrolled the page to
   a card further down, which is not what a rail is for. */
/* ── the interview: her half ───────────────────────────────────────────────

   sql/057. The client offers times; she picks one. This is the whole of her
   side of it, and the reason 056 was worth building: the times arrive as
   instants and she reads them on her own clock, with Central underneath.

   Two of the three times a Houston client offers will land in her night. They
   are shown anyway. Hiding a 3:00 AM would be the page deciding for her what
   she can work, and she is the one who knows. Naming it in her own clock is
   what lets her decide rather than discover. */
var H_SLOTS = [];

function interviewCard(pl) {
  if (!pl) return "";
  var mine = H_SLOTS.filter(function (s) { return s.placement_id === pl.id; });
  var st = slotState(mine);
  if (st.state === "not_started") return "";

  var firm = (pl.clients && pl.clients.name) || "the client";

  if (st.confirmed) {
    var c = st.confirmed;
    return '<div class="card" id="iv-card"><h2>Your interview with ' + esc(firm) + "</h2>" +
      '<p class="msg" style="margin-top:0">This is set. Put it in your calendar now &mdash; ' +
        "it is the conversation that decides the seat.</p>" +
      '<div class="iv__meet">' +
        '<span class="iv__k">When</span><span class="iv__v">' + esc(slotLabel(c.starts_at)) + "</span>" +
        (slotAlso(c.starts_at, c.minutes)
          ? '<span class="iv__k">Also</span><span class="iv__v">' +
            esc(slotAlso(c.starts_at, c.minutes)) + "</span>"
          : "") +
        '<span class="iv__k">Where</span><span class="iv__v">' +
          (c.meeting_url
            ? '<a href="' + esc(c.meeting_url) + '" rel="noopener noreferrer" target="_blank">' +
              esc(c.meeting_url) + "</a>"
            : "They will write to you at the address on your application.") +
        "</span>" +
      "</div>" +
      '<p class="hint" style="margin-top:.9rem">If something goes wrong on the day, write to ' +
        '<a href="/contact?about=work">us</a> rather than leaving them waiting.</p>' +
    "</div>";
  }

  if (st.state === "declined") {
    return '<div class="card" id="iv-card"><h2>Your interview with ' + esc(firm) + "</h2>" +
      '<div class="note" style="margin-top:0"><b>You said none of those times worked.</b> ' +
      "They have been told, and they will offer some others. Nothing else is needed from you " +
      "right now.</div></div>";
  }

  if (st.picked) {
    return '<div class="card" id="iv-card"><h2>Your interview with ' + esc(firm) + "</h2>" +
      '<p class="msg" style="margin-top:0">You picked this one. They confirm it next, and you ' +
        "will see the joining details here once they do.</p>" +
      '<div class="iv__slots">' + hubSlot(st.picked, true) + "</div>" +
      '<div class="edit__foot"><span class="hint">Changed your mind? Pick another time and this ' +
        "one goes back.</span></div>" +
      '<div class="iv__slots">' +
        st.slots.filter(function (s) { return s.id !== st.picked.id; })
          .map(function (s) { return hubSlot(s, false); }).join("") +
      "</div>" +
      '<span class="row__ok" id="iv-ok"></span>' +
    "</div>";
  }

  return '<div class="card" id="iv-card"><h2>Your interview with ' + esc(firm) + "</h2>" +
    '<p class="msg" style="margin-top:0">They have offered ' + esc(String(st.slots.length)) +
      (st.slots.length === 1 ? " time" : " times") + ". Pick the one that works and they will " +
      "confirm it. Times are shown on your clock, with theirs underneath.</p>" +
    '<div class="iv__slots">' +
      st.slots.map(function (s) { return hubSlot(s, false); }).join("") +
    "</div>" +
    '<div class="edit__foot">' +
      '<span class="hint">None of them any good? Say so and they will offer others &mdash; that ' +
        "is a normal thing to do, not a problem.</span>" +
      '<span class="edit__act"><span class="row__ok" id="iv-ok"></span>' +
      '<button class="btn btn--ghost" id="iv-none" data-iv-place="' + esc(pl.id) + '" type="button">' +
      "None of these work</button></span>" +
    "</div>" +
  "</div>";
}

function hubSlot(s, picked) {
  var also = slotAlso(s.starts_at, s.minutes);
  return '<div class="iv__slot iv__slot--pick' + (picked ? " iv__slot--picked" : "") +
      '" data-iv-pick="' + esc(s.id) + '" role="button" tabindex="0">' +
    '<span class="iv__mk"></span>' +
    "<span>" +
      '<span class="iv__d">' + esc(slotLabel(s.starts_at)) + "</span>" +
      (also ? '<span class="iv__z">' + esc(also) + "</span>" : "") +
    "</span>" +
    '<span class="iv__tag' + (picked ? " iv__tag--go" : "") + '">' +
      (picked ? "Your pick" : "Choose") + "</span>" +
  "</div>";
}

function wireInterviewHub() {
  var card = document.getElementById("iv-card");
  if (!card) return;

  function ok() { return document.getElementById("iv-ok"); }

  function pick(el) {
    var id = el.getAttribute("data-iv-pick");
    if (!id) return;
    el.style.pointerEvents = "none";
    ivhFlash(ok(), "Saving…");
    api("rpc/choose_interview", { method: "POST", body: { slot: id } })
      .then(function () { location.reload(); })
      .catch(function (e) {
        el.style.pointerEvents = "";
        ivhFlash(ok(), ivhWhy(e), true);
      });
  }

  card.addEventListener("click", function (e) {
    var slot = e.target.closest("[data-iv-pick]");
    if (slot) { pick(slot); return; }

    var none = e.target.closest("#iv-none");
    if (none) {
      if (!window.confirm(
            "Tell them none of these times work?\\n\\nThey will be asked to offer others. " +
            "This is a normal thing to do.")) {
        return;
      }
      none.disabled = true;
      ivhFlash(ok(), "Saving…");
      api("rpc/decline_interviews", { method: "POST", body: { placement: none.getAttribute("data-iv-place") } })
        .then(function () { location.reload(); })
        .catch(function (e) {
          none.disabled = false;
          ivhFlash(ok(), ivhWhy(e), true);
        });
    }
  });

  /* A row that behaves like a button has to answer the keyboard like one.
     Choosing an interview time with the keyboard is not an edge case — it is
     how somebody who does not use a mouse uses this page at all. */
  card.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var slot = e.target.closest("[data-iv-pick]");
    if (!slot) return;
    e.preventDefault();
    pick(slot);
  });
}

function ivhFlash(el, text, bad) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-bad", !!bad);
  el.classList.add("is-on");
  clearTimeout(el._t);
  if (!bad) el._t = setTimeout(function () { el.classList.remove("is-on"); }, 1600);
}

function ivhWhy(e) {
  var t = String((e && e.message) || e || "");
  if (t === "signed out") return "Signed out — reload and sign in again";
  try {
    var j = JSON.parse(t);
    return (j.message || t).replace(/^ERROR:\\s*/i, "").slice(0, 180);
  } catch (x) {}
  return t.slice(0, 180) || "That did not save";
}

function wireHubTabs() {
  var rail = document.querySelector(".rail");
  if (!rail) return;
  rail.addEventListener("click", function (e) {
    var b = e.target.closest("[data-hub]");
    if (!b) return;
    var want = b.getAttribute("data-hub");
    rail.querySelectorAll("[data-hub]").forEach(function (x) {
      x.classList.toggle("is-on", x === b);
    });
    document.querySelectorAll("[data-hpane]").forEach(function (pane) {
      if (pane.getAttribute("data-hpane") === want) pane.removeAttribute("hidden");
      else pane.setAttribute("hidden", "");
    });
  });
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
  /* Everything the settings pane shows. The check that a portal page only
     reads columns it is granted covers this list, so a typo here fails the
     build rather than the page. */
  return api("applications?select=id,name,email,user_id,status,payout_method,phone,cv,note," +
             "region,availability,has_equipment,posting_consent,posting_consent_at," +
             "skill_english,skill_customer,skill_data_entry,skill_social,skill_bookkeeping" +
             "&order=created_at.desc")
    .then(function (rows) {
      var a = onlyMine(rows || [])[0];
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
        api("leave_requests?select=id,application_id,starts_on,ends_on,reason,status&order=starts_on.desc"),
        api("notices?select=id,title,body,pinned,published_at&order=pinned.desc,published_at.desc"),
        /* The days come back nested under their week in one request. Fetching
           them separately would mean the totals on screen are assembled from
           two answers taken at different moments.

           Caught rather than thrown, because this is the only one of the three
           whose table might not exist. A migration is pasted by hand some time
           after the code that needs it ships, and in that window this request
           404s — which, inside Promise.all, would take leave and the notice
           board down with it. The portal keeps working and the card says why. */
        api("timesheets?select=id,application_id,week_starts_on,status,note,submitted_at,decided_at,decided_by," +
            "timesheet_days(id,worked_on,hours,note)&order=week_starts_on.desc&limit=12")
          .catch(function (e) {
            if (String(e.message) === "signed out") throw e;
            TS_OFF = true;
            return [];
          }),
        /* Caught for the same reason as the timesheets above: 032 is pasted by
           hand some time after this ships. A missing client card claims
           nothing, so unlike the timesheet there is no message to show — an
           assistant who has not been placed sees exactly the same page. */
        api("placements?select=id,application_id,status,started_on,ended_on,hours_per_week,trial_weeks," +
            "clients(name)&order=started_on.desc.nullslast&limit=5")
          .catch(function (e) {
            if (String(e.message) === "signed out") throw e;
            PLACE_OFF = true;
            return [];
          }),
        /* 057. Every time a client has offered her. The policy returns only
           the placements she is on, so there is no filter here to get wrong. */
        api("interview_slots?select=id,placement_id,starts_at,minutes,chosen_at," +
            "confirmed_at,declined_at,meeting_url&order=starts_at.asc")
          .catch(function (e) {
            if (String(e.message) === "signed out") throw e;
            return [];
          })
      ]).then(function (r) {
        /* Cut down to this application before a single row of it is drawn.
           The gate above already turns away an account with no application of
           its own; this is for the account that has one and holds a role as
           well, which the policies hand everybody else's weeks to. Notices are
           left whole — a published notice is addressed to everyone. */
        var myPlace = forApplication(a.id, r[3]);
        var onMine = {};
        myPlace.forEach(function (p) { onMine[p.id] = true; });

        /* The live one, if there is one. A placement that has ended is history
           and does not belong at the top of somebody's portal. */
        PLACE = null;
        myPlace.forEach(function (p) {
          if (!PLACE && p.status !== "ended") PLACE = p;
        });
        SHEETS = {};
        forApplication(a.id, r[2]).forEach(function (s) { SHEETS[s.week_starts_on] = s; });
        /* Opens on the week in progress. Anything older is a click away in the
           list underneath, which is where a week you have to fix will be. */
        H_SLOTS = (r[4] || []).filter(function (s) { return onMine[s.placement_id]; });
        VIEW = isoDay(mondayOf(new Date()));
        render(a, forApplication(a.id, r[0]), r[1] || []);
      });
    });
}

function start() {
  captureRedirect();
  if (CAME_FROM_RESET) { passwordForm(""); return; }
  var err = authError();
  if (!session()) { signedOut(err); return; }
  noteAuthError();

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) {
    clearSession();
    signedOut("That sign-in did not carry an email address.");
    return;
  }
  ME = claims.email;

  view('<div class="card"><span class="spin"></span>Opening your portal&hellip;</div>');

  /* Before load(), so the chosen zone is known by the time the first date is
     drawn. It never rejects, so it cannot be what stops the portal opening. */
  loadMyTz().then(load).catch(function (e) {
    if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
    view('<div class="card"><p class="msg msg--bad">We could not open your portal just now. ' +
         "Refresh, or try again in a minute.</p></div>");
  });
}

start();
`.trim();

/* 057. The interview card is drawn by two different scripts from the same
   markup, so its rules belong to neither page and are given to both. This sat
   inside SEATS_CSS for exactly one build, and /hub rendered the times, the
   durations and the word Choose as one run of unstyled text — every harness
   passed, because every harness reads markup and the markup was right. */
const INTERVIEW_CSS = `
.iv__slots{display:grid;gap:.45rem;margin-top:1rem}
.iv__slot{display:grid;grid-template-columns:auto 1fr auto auto;gap:.2rem .8rem;align-items:center;
  padding:.7rem .85rem;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
.iv__slot--picked{border-color:var(--accent);background:var(--accent-soft)}
.iv__slot--pick{cursor:pointer}
.iv__slot--pick:hover{border-color:var(--accent)}
.iv__mk{width:1.05rem;height:1.05rem;border-radius:50%;border:2px solid var(--line)}
.iv__slot--picked .iv__mk{border-color:var(--accent);background:var(--accent);
  box-shadow:inset 0 0 0 3px var(--surface)}
.iv__d{display:block;font-weight:700;font-size:.92rem;font-variant-numeric:tabular-nums}
.iv__z{display:block;font-size:.79rem;color:var(--muted);font-variant-numeric:tabular-nums;margin-top:.1rem}
.iv__tag{font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:.09em;
  text-transform:uppercase;padding:.2rem .45rem;border-radius:5px;white-space:nowrap;
  border:1px solid var(--line);color:var(--muted)}
.iv__tag--go{background:#0B7A63;border-color:#0B7A63;color:#fff}
.iv__add{display:grid;gap:.5rem;margin-top:1.1rem}
@media(min-width:38rem){.iv__add{grid-template-columns:1fr 1fr 1fr auto;align-items:end}}
.iv__meet{margin-top:1rem;display:grid;gap:.2rem .9rem;grid-template-columns:auto 1fr;
  padding:.95rem 1.05rem;border:1px solid #0B7A63;border-radius:9px;background:var(--surface-2)}
.iv__k{font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);align-self:center}
.iv__v{font-weight:700;font-size:.93rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
@media(max-width:32rem){
  .iv__slot{grid-template-columns:auto 1fr}
  .iv__tag{grid-column:2}
}
`;

writeFileSync("hub.html", shell({
  app: true,
  title: "Your portal — SecureJobVA",
  links: [
    '        <a href="/status">Your application</a>',
    '        <a href="/careers">Careers</a>'
  ].join(nl),
  body: HUB_BODY,
  script: HUB_SCRIPT,
  css: INTERVIEW_CSS
}));

console.log("hub.html written");

/* ────────────────────────── seats.html ────────────────────────── */

/* Only /seats renders a bill, so only /seats carries the rules for one. */
const SEATS_CSS = `
/* The bill. Built to be read across a whole business rather than one seat:
   a client may have several assistants, so a week is a heading and each
   assistant is a line under it. Tabular figures, because a column of money
   that does not line up is a column somebody has to check twice. */
.bill{margin:1.3rem 0 0}
.bill__wk{margin-top:1.1rem;border-top:1px solid var(--line);padding-top:.75rem}
.bill__wk:first-child{border-top:0;padding-top:0;margin-top:0}
.bill__wkh{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;flex-wrap:wrap}
.bill__wkn{font-weight:700;font-size:.95rem}
.bill__wkt{font-variant-numeric:tabular-nums;font-weight:700;font-size:.95rem}
.bill__ln{display:grid;grid-template-columns:1fr auto auto;gap:.4rem 1rem;align-items:baseline;
  padding:.4rem 0;font-size:.9rem;color:var(--ink-2);border-bottom:1px solid var(--line-soft)}
.bill__ln:last-child{border-bottom:0}
.bill__who{min-width:0;overflow-wrap:anywhere}
.bill__h,.bill__amt{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;font-size:.85rem;white-space:nowrap}
.bill__amt{font-weight:600;color:var(--ink)}
.bill__free{color:var(--muted);font-weight:500}
.bill__tot{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;flex-wrap:wrap;
  margin-top:1.2rem;padding-top:.95rem;border-top:2px solid var(--ink)}
.bill__totl{font-weight:700;font-size:1.02rem}
.bill__totv{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
  font-weight:700;font-size:1.35rem;color:var(--ink)}
.bill__pay{margin-top:1.3rem;padding:1.1rem 1.2rem;border:1px dashed var(--line);border-radius:9px;
  background:var(--surface-2)}
.bill__payh{font-weight:700;margin:0 0 .35rem}
.bill__payp{margin:0;font-size:.9rem;color:var(--muted);line-height:1.55}

/* 055. The two lines above the total, and the receipts under it. Quieter than
   the figure they explain — the number somebody came for is the one left to
   pay, and the working out should not compete with it. */
.bill__tot--sub{border-top:0;padding-top:.35rem;padding-bottom:0;font-weight:500}
.bill__tot--sub .bill__totl{color:var(--muted);font-weight:500}
.bill__tot--sub .bill__totv{font-size:1rem;font-weight:600;color:var(--ink-2)}
/* #0B7A63 is what approved already wears on the timesheet pills and the hired
   pill, so paid money reads as the same kind of good news rather than as a
   sixth colour nobody has seen before. */
.bill__totv--paid{color:#0B7A63}
:root[data-theme="dark"] .bill__totv--paid{color:#63D69B}
.bill__paid{font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.09em;
  text-transform:uppercase;padding:.16rem .4rem;border-radius:4px;margin-left:.55rem;
  background:#0B7A63;color:#fff}
.pays{margin-top:1.3rem;border-top:1px solid var(--line);padding-top:1rem}
.pays__h{margin:0 0 .5rem;font-weight:700;font-size:.92rem}
.pays__r{display:grid;grid-template-columns:6.5rem 1fr auto;gap:.3rem .8rem;align-items:baseline;
  padding:.4rem 0;border-bottom:1px solid var(--line-soft);font-size:.88rem}
.pays__r:last-child{border-bottom:0}
.pays__d{color:var(--muted);font-variant-numeric:tabular-nums}
.pays__m{color:var(--ink-2);overflow-wrap:anywhere}
.pays__a{font-weight:700;font-variant-numeric:tabular-nums}
@media(max-width:30rem){
  .pays__r{grid-template-columns:1fr auto}
  .pays__m{grid-column:1/-1;font-size:.84rem}
}
`;

writeFileSync("seats.html", shell({
  title: "Your seats — SecureJobVA",
  links: [
    '        <a href="/">Hiring a VA?</a>',
    '        <a href="/contact">Contact</a>'
  ].join(nl),
  body: "  <section class=\"pt\">" + nl + "    <div class=\"wrap\" style=\"max-width:52rem\">" + nl + "      <div class=\"pt__head\">" + nl + "        <span class=\"eyebrow\">Your account</span>" + nl + "        <h1>The seats you have asked us for.</h1>" + nl + "        <p id=\"pt-lead\">Sign in with the address you used when you booked the call.</p>" + nl + "      </div>" + nl + "      <div id=\"pt-root\"></div>" + nl + "    </div>" + nl + "  </section>",
  script: SEATS_SCRIPT,
  css: SEATS_CSS + INTERVIEW_CSS
}));

console.log("seats.html written");

/* ────────────────────────── pay.html ──────────────────────────

   A page at /pay, rather than a section of /seats, for one reason: it is the
   link that goes in an email every week. "Your week is ready, pay here" needs
   somewhere to land, and #billing on another page is not an address anybody
   will type or a provider will accept as a return URL.

   What it costs is a second sign-in path, and that is genuinely paid: the
   library below the fold is shared, but this page has its own start(). What it
   does NOT duplicate is the arithmetic — every figure here comes out of
   cBill() in CLIENT_MONEY, the same function /seats reads, so the two pages
   cannot quote the same business two different totals.

   There is no Pay button. A control that says Pay and does nothing is worse
   than no control: somebody presses it, believes the money moved, and stops
   chasing the invoice. The shape of that panel is also the payment provider's
   decision — a hosted page redirects away, an embedded form wants its own
   container — so the button arrives with the provider rather than before it. */

const PAY_BODY = [
  '  <section class="pt">',
  '    <div class="wrap" style="max-width:52rem">',
  '      <div class="pt__head">',
  '        <span class="eyebrow">Your account</span>',
  "        <h1>What you owe, and how to settle it.</h1>",
  '        <p id="pt-lead">Sign in with the address we hold for your business.</p>',
  "      </div>",
  '      <div id="pt-root"></div>',
  "    </div>",
  "  </section>"
].join(nl);

const PAY_SCRIPT = `
var root = document.getElementById("pt-root");
var lead = document.getElementById("pt-lead");

function view(html) { root.innerHTML = html; }

SIGNIN_HINT = 'Use the address we hold for your business &mdash; that is how we find your account. ' +
  'It is the same sign-in as your <a href="/seats">seats page</a>. ' +
  'No account yet? Create one with that address and it becomes how you sign in.';

/* The same globals /seats fills, so the shared arithmetic below reads exactly
   the same shape on both pages. */
/* 032 again, asked from the page rather than from a policy: the clients this
   address is the contact for. Everything on the client side is narrowed
   through it, because every one of those policies also answers yes to a role,
   and a role is not a client. */
var MY_CLIENTS = {};
var C_PLACE = [];
var C_RATE = {};
var C_WEEKS = [];
var C_NAMES = [];
var C_PAID = [];
var C_SETTLED = {};
var C_WEEK_LIMIT = 260;
var C_TRUNCATED = false;
var C_COMPANY = "";

${CLIENT_MONEY}

/* ── the amount ──
   The one number somebody came here for, and the only place on the site it is
   rendered large. Everything under it is the working. */
function dueCard(bill) {
  var owed = cOwedCents(bill.grand);
  var paid = cPaidCents();

  return '<div class="card">' +
    "<h2>Due now</h2>" +
    '<p class="msg" style="margin-top:0">Hours you have approved that we have not been paid for.</p>' +
    '<div class="due">' +
      "<div>" +
        '<div class="due__amt">' + esc(cCents(owed < 0 ? 0 : owed)) + "</div>" +
        '<div class="due__sub">' +
          (bill.weeks.length
            ? esc(String(bill.people)) + (bill.people === 1 ? " assistant" : " assistants") +
              " &middot; " + esc(String(bill.weeks.length)) +
              (bill.weeks.length === 1 ? " week approved" : " weeks approved")
            : "Nothing approved yet") +
        "</div>" +
      "</div>" +
      '<div class="due__meta">' +
        (bill.oldest
          ? "<div>" +
              '<span class="due__k">Oldest week</span>' +
              '<span class="due__v">' + esc(cWeekLabel(bill.oldest).split(" to ")[0]) + "</span>" +
            "</div>"
          : "") +
        "<div>" +
          '<span class="due__k">Hours</span>' +
          '<span class="due__v">' + esc(cNum(bill.hours)) + "</span>" +
        "</div>" +
        (bill.freeHours
          ? "<div>" +
              '<span class="due__k">Covered by us</span>' +
              '<span class="due__v">' + esc(cNum(bill.freeHours)) + " h</span>" +
            "</div>"
          : "") +
        (paid
          ? "<div>" +
              '<span class="due__k">Paid so far</span>' +
              '<span class="due__v">' + esc(cCents(paid)) + "</span>" +
            "</div>"
          : "") +
      "</div>" +
    "</div>" +
    (bill.missingRate
      ? '<div class="note note--warn"><b>' + esc(cNum(bill.unpriced)) +
        " hours are not priced yet.</b> They are approved and recorded, and they are not in the " +
        "figure above. We are finishing your rate &mdash; write to " +
        '<a href="mailto:support@securejobva.com">support@securejobva.com</a> if it is not sorted within a day.</div>'
      : "") +
    (owed < 0
      ? '<div class="note"><b>You are ' + esc(cCents(-owed)) + " ahead.</b> " +
        "That sits against the weeks still to come, so there is nothing to pay right now.</div>"
      : "") +
  "</div>";
}

/* ── how to pay ──
   Two of these three do not work yet and say so in as many words. Listing them
   greyed out rather than leaving them off is the honest version: a client
   asking "can I put this on a card" gets an answer here instead of an email. */
function payCard() {
  return '<div class="card">' +
    "<h2>How to pay</h2>" +
    '<p class="msg" style="margin-top:0">Weekly, against the hours you have already approved.</p>' +
    '<div class="pm">' +
      '<div class="pm__row">' +
        '<span class="pm__mk">&#127974;</span>' +
        "<span>" +
          '<span class="pm__t">Bank transfer</span>' +
          '<span class="pm__d">The way you agreed on your call. We send the details with each ' +
            "week&rsquo;s summary, and a transfer shows up here once we have seen it land.</span>" +
        "</span>" +
        '<span class="tag tag--now">How it works today</span>' +
      "</div>" +
      '<div class="pm__row pm__row--off">' +
        '<span class="pm__mk">&#128179;</span>' +
        "<span>" +
          '<span class="pm__t">Card</span>' +
          '<span class="pm__d">Pay the figure above in one press, or leave a card on file and ' +
            "let each approved week charge itself.</span>" +
        "</span>" +
        '<span class="tag">Not switched on</span>' +
      "</div>" +
      '<div class="pm__row pm__row--off">' +
        '<span class="pm__mk">&#127974;</span>' +
        "<span>" +
          '<span class="pm__t">Direct debit</span>' +
          '<span class="pm__d">Lower fees than a card on a weekly bill this size, and worth ' +
            "having for a client who stays.</span>" +
        "</span>" +
        '<span class="tag">Not switched on</span>' +
      "</div>" +
    "</div>" +
    '<div class="gap">' +
      '<p class="gap__h">Why there is no Pay button here</p>' +
      '<p class="gap__p">A button that says <b>Pay</b> and does nothing is worse than no button: ' +
        "somebody presses it, believes the money moved, and stops chasing the invoice. The shape " +
        "of this panel is the payment provider&rsquo;s decision too &mdash; a hosted page redirects " +
        "away, an embedded form wants its own container &mdash; so the button arrives with the " +
        "provider rather than before it. Everything around it is ready for the day it does.</p>" +
    "</div>" +
  "</div>";
}

/* ── the breakdown ──
   The same rows /seats itemises, drawn the same way. A client who reads both
   pages must not have to work out whether they are looking at the same money. */
function weeksCard(bill) {
  if (!bill.weeks.length) {
    return '<div class="card"><h2>What you are paying for</h2>' +
      '<div class="note"><b>Nothing approved yet.</b> A week appears here once you have ' +
      "approved it on your seats page. Until then there is nothing to pay.</div></div>";
  }

  var rows = bill.weeks.map(function (wk) {
    var body = wk.lines.map(function (l) {
      return '<div class="bill__ln">' +
        '<span class="bill__who">' + esc(l.who) + "</span>" +
        '<span class="bill__h">' + esc(cNum(l.hours)) + " h" +
          (l.free ? "" : " &times; " + esc(cMoney(l.rate))) + "</span>" +
        '<span class="bill__amt' + (l.free ? " bill__free" : "") + '">' +
          (l.free ? "free &mdash; trial" : esc(cMoney(l.hours * l.rate))) + "</span>" +
      "</div>";
    }).join("");
    return '<div class="bill__wk">' +
      '<div class="bill__wkh"><span class="bill__wkn">Week of ' + esc(cWeekLabel(wk.week)) + "</span>" +
      (wk.settled && wk.total ? '<span class="bill__paid">paid</span>' : "") +
      '<span class="bill__wkt">' + esc(cMoney(wk.total)) + "</span></div>" +
      body +
    "</div>";
  }).join("");

  var paid = cPaidCents();

  return '<div class="card">' +
    "<h2>What you are paying for</h2>" +
    '<p class="msg" style="margin-top:0">Every assistant, week by week. Trial weeks are ours to cover.</p>' +
    '<div class="bill">' + rows + "</div>" +
    (paid
      ? '<div class="bill__tot bill__tot--sub"><span class="bill__totl">Total approved</span>' +
        '<span class="bill__totv">' + esc(cMoney(bill.grand)) + "</span></div>" +
        '<div class="bill__tot bill__tot--sub"><span class="bill__totl">Paid</span>' +
        '<span class="bill__totv bill__totv--paid">&minus;&nbsp;' + esc(cCents(paid)) + "</span></div>"
      : "") +
    '<div class="bill__tot"><span class="bill__totl">' +
      (paid ? "Left to pay" : "Total approved, not yet paid") + "</span>" +
    '<span class="bill__totv">' + esc(cCents(cOwedCents(bill.grand))) + "</span></div>" +
    (C_TRUNCATED
      ? '<p class="msg">This covers the most recent ' + C_WEEK_LIMIT +
        " weeks on file. Write to support for anything older.</p>"
      : "") +
  "</div>";
}

/* ── the receipts ──
   Empty is a real answer here and is worded as one. Before sql/055 this panel
   could not exist at all: there was nowhere to write a payment down, so a
   client who had paid saw the same page as one who had not. */
function receiptsCard() {
  return '<div class="card">' +
    "<h2>Payments received</h2>" +
    '<p class="msg" style="margin-top:0">Every payment we have recorded against your account.</p>' +
    (C_PAID.length
      ? '<div class="pays" style="border-top:0;padding-top:.4rem">' +
          C_PAID.map(function (p) {
            return '<div class="pays__r">' +
              '<span class="pays__d">' + esc(when(p.paid_on)) + "</span>" +
              '<span class="pays__m">' + esc(C_PAY_METHOD[p.method] || p.method) +
                (p.reference ? " &middot; " + esc(p.reference) : "") + "</span>" +
              '<span class="pays__a">' + esc(cCents(p.amount_cents)) + "</span>" +
            "</div>";
          }).join("") +
        "</div>"
      : '<div class="note"><b>Nothing recorded yet.</b> A transfer appears here once we have ' +
        "seen it land &mdash; usually the same day, occasionally the next. If you have paid and " +
        "it is still not here after two working days, write to " +
        '<a href="mailto:support@securejobva.com">support@securejobva.com</a> and we will find it.</div>') +
  "</div>";
}

function render(email) {
  var initial = (email || "?").charAt(0).toUpperCase();
  lead.textContent = "Signed in as " + email + ".";

  var who =
    '<div class="who">' +
      '<div class="who__id"><span class="who__av">' + esc(initial) + "</span>" +
      '<span class="who__t"><span class="who__n">' + esc(C_COMPANY || "Your account") + "</span>" +
      '<span class="who__e">' + esc(email) + "</span></span></div>" +
      '<span style="display:flex;gap:.5rem">' +
        '<a class="btn btn--ghost" href="/seats" style="padding:.5rem .9rem;font-size:.88rem">Back to your seats</a>' +
        '<button class="btn btn--ghost" id="out" type="button" style="padding:.5rem .9rem;font-size:.88rem">Sign out</button>' +
      "</span>" +
    "</div>";

  /* No placement means no bill, and saying so plainly beats four empty cards.
     A business that has asked for a seat but has nobody working yet is an
     ordinary state, not a fault. */
  if (!C_PLACE.length) {
    view(who +
      '<div class="card">' +
        '<div class="note"><b>Nothing to pay yet.</b> This page fills in once somebody is ' +
        "working for you and you have approved their first week. Until then there is no bill " +
        "and nothing here to settle.</div>" +
        '<p style="margin-top:1.2rem"><a class="btn btn--solid" href="/seats">See where your seat has got to</a></p>' +
      "</div>");
    document.getElementById("out").addEventListener("click", signOut);
    return;
  }

  var bill = cBill();
  view(who + dueCard(bill) + payCard() + weeksCard(bill) + receiptsCard() +
    '<p class="msg" style="text-align:center">A figure here look wrong? Reply to the email we ' +
    'sent you, or write to <a href="mailto:support@securejobva.com">support@securejobva.com</a>.</p>');
  document.getElementById("out").addEventListener("click", signOut);
}

function start() {
  captureRedirect();
  if (CAME_FROM_RESET) { passwordForm(""); return; }
  var err = authError();
  if (!session()) { signedOut(err); return; }
  noteAuthError();

  var claims = readToken(session().access_token);
  if (!claims || !claims.email) {
    clearSession();
    signedOut("That sign-in did not carry an email address.");
    return;
  }

  view('<div class="card"><span class="spin"></span>Working out what you owe&hellip;</div>');

  Promise.all([
    api("placements?select=id,client_id,application_id,status,started_on,ended_on,hours_per_week," +
        "trial_weeks&order=started_on.desc.nullslast"),
    api("placement_billing?select=placement_id,rate"),
    api("timesheets?select=id,placement_id,week_starts_on,status,trial_week," +
        "timesheet_days(worked_on,hours)&order=week_starts_on.desc&limit=" + C_WEEK_LIMIT),
    api("application_public?select=application_id,name"),
    /* Both wrapped, because a database without 055 pasted should show this
       page with an empty receipts panel rather than an error. The figure above
       it is then the old one, which is exactly what it was before. */
    api("client_payments?select=id,client_id,amount_cents,paid_on,method,reference&order=paid_on.desc")
      .catch(function () { return []; }),
    api("client_payment_weeks?select=timesheet_id")
      .catch(function () { return []; }),
    /* Only for the name in the corner. A client matched by hand has no seat
       request at all, so this coming back empty is ordinary. */
    api("seat_requests?select=company,email&order=created_at.desc&limit=1")
      .catch(function () { return []; }),
    /* The same question loadClient asks, for the same reason. */
    api("client_private?select=client_id,contact_email").catch(function () { return []; })
  ]).then(function (r) {
    MY_CLIENTS = myClientIds(r[7]);
    C_PLACE = (r[0] || []).filter(function (p) { return MY_CLIENTS[p.client_id]; });
    var onMine = {};
    C_PLACE.forEach(function (p) { onMine[p.id] = true; });
    C_RATE = {};
    (r[1] || []).forEach(function (b) { C_RATE[b.placement_id] = Number(b.rate); });
    var rawWeeks = r[2] || [];
    C_WEEKS = rawWeeks.filter(function (w) { return onMine[w.placement_id]; });
    C_TRUNCATED = rawWeeks.length >= C_WEEK_LIMIT;
    C_NAMES = r[3] || [];
    C_PAID = (r[4] || []).filter(function (p) { return MY_CLIENTS[p.client_id]; });
    C_SETTLED = {};
    (r[5] || []).forEach(function (a) { C_SETTLED[a.timesheet_id] = true; });
    C_COMPANY = (onlyMine(r[6])[0] || {}).company || "";
    render(claims.email);
  }).catch(function (e) {
    if (String(e.message) === "signed out") { signedOut("Your session expired. Sign in again."); return; }
    view('<div class="card"><p class="msg msg--bad">We could not work out your bill just now. ' +
         "Refresh, or try again in a minute.</p>" +
         '<button class="btn btn--ghost" id="out-error" type="button" style="margin-top:1.1rem">Sign out</button></div>');
    document.getElementById("out-error").addEventListener("click", signOut);
  });
}

start();
`;

const PAY_CSS = `
.due{display:flex;flex-wrap:wrap;gap:1.4rem 2.4rem;align-items:flex-end;justify-content:space-between;
  margin-top:1.2rem;padding-bottom:1.2rem;border-bottom:1px solid var(--line)}
.due__amt{font-family:"Bricolage Grotesque","Karla",system-ui,sans-serif;font-weight:800;
  font-size:clamp(2.2rem,7vw,3.1rem);line-height:1;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.due__sub{margin-top:.5rem;color:var(--muted);font-size:.9rem}
.due__meta{display:flex;flex-wrap:wrap;gap:.35rem 1.7rem}
.due__k{display:block;font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:.11em;
  text-transform:uppercase;color:var(--muted);margin-bottom:.15rem}
.due__v{font-weight:700;font-size:.95rem;font-variant-numeric:tabular-nums}

.pm{margin-top:1.2rem;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.pm__row{display:grid;grid-template-columns:2.2rem 1fr auto;gap:.2rem .9rem;align-items:center;
  padding:.9rem 1rem;border-bottom:1px solid var(--line-soft)}
.pm__row:last-child{border-bottom:0}
.pm__row--off{opacity:.62}
.pm__mk{font-size:1.2rem;text-align:center}
.pm__t{display:block;font-weight:700;font-size:.95rem}
.pm__d{display:block;color:var(--muted);font-size:.87rem;line-height:1.5;margin-top:.15rem}
.tag{font-family:"IBM Plex Mono",monospace;font-size:.61rem;letter-spacing:.09em;text-transform:uppercase;
  padding:.24rem .5rem;border-radius:5px;white-space:nowrap;border:1px solid var(--line);color:var(--muted)}
.tag--now{background:#0B7A63;border-color:#0B7A63;color:#fff}
@media(max-width:33rem){
  .pm__row{grid-template-columns:2.2rem 1fr}
  .tag{grid-column:2;justify-self:start;margin-top:.4rem}
}

.gap{margin-top:1.3rem;padding:1.1rem 1.2rem;border:1px dashed var(--line);border-radius:9px;
  background:var(--surface-2)}
.gap__h{font-weight:700;margin:0 0 .35rem}
.gap__p{margin:0;font-size:.9rem;color:var(--muted);line-height:1.55}
`;

writeFileSync("pay.html", shell({
  title: "Pay — SecureJobVA",
  links: [
    '        <a href="/seats">Your seats</a>',
    '        <a href="/contact">Contact</a>'
  ].join(nl),
  body: PAY_BODY,
  script: PAY_SCRIPT,
  /* The bill markup is shared with /seats, so its rules come along. Everything
     above them is only ever rendered here. */
  css: SEATS_CSS + PAY_CSS
}));

console.log("pay.html written");
