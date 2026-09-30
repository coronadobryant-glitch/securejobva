/* Builds the four policy pages from the chrome the rest of the site uses, so
   they cannot drift away from it.

   A note on the gaps in the source document. It arrived with [CLARIFY] and
   [DESCRIBE] markers on employment status, fees and refund terms. Two of those
   three did not need anybody to decide anything: the Site already states its
   fees and its replacement promise in public, on the home and careers pages,
   and a policy page that disagreed with them would be the problem. So those
   sections are written from what is already promised, and cited.

   The third — whether a placed assistant is a contractor of the Client, of us,
   or an employee — is genuinely unresolved, and the Site's own copy used to
   pull both ways: careers.html asks for "the legal right to work as an
   independent contractor", while it said training was paid "on our payroll"
   and the home page promised clients "payroll, benefits" and "we manage the
   employment". Those are gone (30 Sep) — both pages now say the assistant is
   contracted and paid through us — which stops the copy contradicting itself
   without settling the question. That is a
   question for an accountant and an attorney, not for a build script, so it is
   marked on the page as under review rather than answered with a guess.

   Run: node tools/build-policy.mjs  (build.mjs then wraps these into dist/) */
import { readFileSync, writeFileSync } from "node:fs";

import { chrome } from "./lib-chrome.mjs";

/* Lifted by anchor rather than by line number: careers.html grows, and a
   line-number slice silently starts pointing at the wrong thing. */
const { fonts: FONTS, css: TOKENS_TO_NAV, themeScript: THEME_SCRIPT,
        svgDefs: SVG_DEFS, brandSvg: BRAND_SVG, nl } = chrome();

/* The generated pages carry their own layout rules, so these two slices of
   careers-specific CSS are no longer pulled in at all. */
const SECTIONS = "";
const FOOTER_CSS = "";

/* Moved on 30 Sep 2026: the privacy policy now names its service providers
   and says what browser storage holds, and the terms and refund policy no
   longer promise a card and deposit that nothing takes. */
const UPDATED = "30 September 2026";

const CSS = `
/* ---------- policy ---------- */
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
.doc{padding:clamp(2.5rem,5vw,4rem) 0 clamp(3rem,6vw,4.5rem)}
.doc__wrap{max-width:46rem}
.doc h1{font-size:var(--step-3);margin:.5rem 0 .4rem}
.doc__meta{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 2rem}
.doc h2{font-size:1.15rem;margin:2.2rem 0 .7rem;padding-top:1.4rem;border-top:1px solid var(--line)}
.doc h2:first-of-type{border-top:0;padding-top:0;margin-top:1.6rem}
.doc h3{font-size:1rem;margin:1.4rem 0 .5rem}
.doc p{margin:0 0 .9rem;color:var(--ink-2);line-height:1.7}
.doc ul{margin:0 0 1rem;padding-left:1.1rem;color:var(--ink-2);line-height:1.7}
.doc li{margin-bottom:.4rem}
.doc a{color:var(--accent)}
.doc b{color:var(--ink)}
.doc__toc{background:var(--surface-2);border-radius:10px;padding:1.1rem 1.3rem;margin-bottom:2rem}
.doc__toc ul{list-style:none;padding:0;margin:0;display:grid;gap:.4rem;font-size:.92rem}
.doc__toc a{text-decoration:none}
.doc__toc a:hover{text-decoration:underline}

/* Something we have not settled should look unsettled, not like fine print
   somebody has already agreed to. */
.doc__open{background:#FFF6E5;border-left:3px solid var(--signal);border-radius:0 8px 8px 0;padding:1rem 1.15rem;margin:0 0 1rem;font-size:.92rem;color:var(--ink-2);line-height:1.6}
:root[data-theme="dark"] .doc__open{background:#2A2110}
.doc__open b{display:block;margin-bottom:.3rem}

/* Which language governs. Quiet on purpose — it is a fact about the document,
   not a warning about it. */
.doc__gov{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:.8rem 1rem;margin:0 0 1.7rem;font-size:.88rem;color:var(--ink-2);line-height:1.6}
.doc__gov a{color:var(--accent)}

.cform{display:grid;gap:0}
.cform .fld{display:grid;gap:.35rem;margin-bottom:1rem}
.cform label{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2)}
.cform label em{font-style:normal;text-transform:none;letter-spacing:0;opacity:.75}
/* --muted, not --line, for the same reason as the two dialogs: --line on white
   is 1.23:1, and the edge of a text box needs 3:1 to be findable at all. */
.cform input,.cform select,.cform textarea{font-family:inherit;font-size:.98rem;padding:.7rem .85rem;border:1px solid var(--muted);border-radius:8px;background:var(--surface);color:var(--ink);width:100%}
.cform textarea{min-height:8rem;resize:vertical}
.cform input:focus-visible,.cform select:focus-visible,.cform textarea:focus-visible{outline:2.5px solid var(--accent);outline-offset:1px}
.cform .err{color:#B3261E;font-size:.85rem;margin:.15rem 0 0;min-height:1.1em}
:root[data-theme="dark"] .cform .err{color:#F2B8B5}
@media(min-width:560px){.cform__two{display:grid;grid-template-columns:1fr 1fr;gap:0 .9rem}}
/* The agree box. The markup is the .opt pattern from the two dialogs, but its
   rules never came with it — they sit after the hero marker in careers.html,
   outside what lib-chrome.mjs lifts — so the page showed a raw checkbox, a
   tick that was always visible, and the whole label forced into the
   uppercase mono of .cform label. These are those rules, scoped to the form. */
.cform label.opt{display:flex;align-items:flex-start;gap:.7rem;position:relative;cursor:pointer;font-family:inherit;font-size:.95rem;letter-spacing:0;text-transform:none;color:var(--ink);margin-bottom:.25rem}
.cform .opt input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.cform .opt__box{width:18px;height:18px;flex:none;margin-top:.15rem;border:1.5px solid var(--muted);border-radius:5px;background:var(--surface);display:grid;place-items:center;color:var(--accent-ink)}
.cform .opt__box svg{opacity:0;transition:opacity .12s ease}
.cform .opt input:checked ~ .opt__box{background:var(--accent);border-color:var(--accent)}
.cform .opt input:checked ~ .opt__box svg{opacity:1}
.cform .opt input:focus-visible ~ .opt__box{outline:2.5px solid var(--accent);outline-offset:2px}
.cform .opt__t{display:block;font-weight:600;line-height:1.35}
.cform .opt__d{display:block;font-size:.85rem;color:var(--ink-2);margin-top:.15rem}
.cform .opt__d a{color:var(--accent)}
.cform__ok{background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:1.15rem 1.3rem}
.contact__at{display:grid;gap:.8rem;margin:1.4rem 0 2.2rem}
.contact__row{display:flex;flex-wrap:wrap;gap:.5rem 1rem;padding-bottom:.7rem;border-bottom:1px solid var(--line)}
.contact__k{font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);min-width:9rem}
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
    CSS,
    "</style>",
    "",
    THEME_SCRIPT,
    "",
    SVG_DEFS,
    "",
    '<header class="nav">',
    '  <div class="wrap">',
    '    <div class="nav__in">',
    '      <a class="brand" href="/" aria-label="SecureJobVA home">',
    BRAND_SVG,
    '        <span class="brand__word">SecureJob<b class="brand__va">VA</b></span>',
    "      </a>",
    /* The links, the sign-in and the language switch all used to sit inside
       .nav__links, which the shared stylesheet hides below 900px — and these
       pages had no menu button to stand in for it. On a phone the header was
       the logo and nothing else: no Sign in, no Careers, and a Spanish reader
       who landed on /privacy had no way to /es/privacy at all. The home and
       careers pages already had the answer, so this is theirs: the language
       switch lives in .nav__tools, which never hides, beside a menu button
       that opens the same links in .mobnav. One language link, not two —
       build-es.mjs flips the first one it finds and would leave a second
       offering Spanish to a Spanish reader. */
    '      <nav class="nav__links">',
    '        <a href="/">Hiring a VA?</a>',
    '        <a href="/careers">Careers</a>',
    '        <a href="/contact">Contact</a>',
    '        <a class="nav__signin" href="/status">Sign in</a>',
    "      </nav>",
    '      <div class="nav__tools">',
    '        <button class="navtog" id="navtog" type="button" aria-expanded="false" aria-controls="mobnav" aria-label="Menu">',
    '          <svg class="i-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">',
    '            <path d="M4 7h16M4 12h16M4 17h16"></path>',
    "          </svg>",
    '          <svg class="i-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">',
    '            <path d="M6 6l12 12M18 6L6 18"></path>',
    "          </svg>",
    "        </button>",
    '        <a class="langtog" id="langtog" href="' + o.es + '" hreflang="es" ' +
      'lang="es" aria-label="Ver esta página en español">ES</a>',
    "      </div>",
    "    </div>",
    "  </div>",
    '  <div class="mobnav" id="mobnav" hidden>',
    '    <div class="wrap mobnav__in">',
    '      <a href="/">Hiring a VA?</a>',
    '      <a href="/careers">Careers</a>',
    '      <a href="/contact">Contact</a>',
    '      <a class="nav__signin" href="/status">Sign in</a>',
    "    </div>",
    "  </div>",
    "</header>",
    "",
    "<main>",
    '  <section class="doc">',
    '    <div class="wrap doc__wrap">',
    o.body,
    "    </div>",
    "  </section>",
    "</main>",
    "",
    FOOTER,
    NAV_SCRIPT,
    o.script || "",
    ""
  ].join(nl);
}

/* The menu button above, wired the way careers.html wires its own: open and
   shut on the button, shut on a link, on Escape, and when the window grows
   past the width where the links are back in the bar. */
const NAV_SCRIPT = [
  "<script>",
  "(function () {",
  '  var btn = document.getElementById("navtog");',
  '  var panel = document.getElementById("mobnav");',
  "  if (!btn || !panel) return;",
  "  function setOpen(open) {",
  '    btn.setAttribute("aria-expanded", open ? "true" : "false");',
  '    if (open) { panel.removeAttribute("hidden"); } else { panel.setAttribute("hidden", ""); }',
  "  }",
  '  btn.addEventListener("click", function () {',
  '    setOpen(btn.getAttribute("aria-expanded") !== "true");',
  "  });",
  '  panel.addEventListener("click", function (e) {',
  '    if (e.target.closest("a")) setOpen(false);',
  "  });",
  '  window.addEventListener("resize", function () {',
  "    if (window.innerWidth >= 900) setOpen(false);",
  "  });",
  '  document.addEventListener("keydown", function (e) {',
  '    if (e.key === "Escape") setOpen(false);',
  "  });",
  "})();",
  "</script>"
].join(nl);

/* One footer, defined here and injected into every page by build.mjs, so a new
   policy link is added once rather than five times. */
const FOOTER = [
  '<footer class="foot">',
  '  <div class="wrap">',
  '    <div class="foot__bot" style="margin-top:0;border-top:0;padding-top:0">',
  "      <span>&copy; " + new Date(Date.UTC(2026, 7, 26)).getUTCFullYear() +
    " Secure Job VA &middot; Houston, Texas</span>",
  '      <span>',
  '        <a href="/">Home</a> &middot;',
  '        <a href="/careers">Careers</a> &middot;',
  '        <a href="/privacy">Privacy</a> &middot;',
  '        <a href="/terms">Terms</a> &middot;',
  '        <a href="/refunds">Refunds</a> &middot;',
  '        <a href="/contact">Contact</a>',
  "      </span>",
  "    </div>",
  "  </div>",
  "</footer>"
].join(nl);

export { FOOTER };

const toc = (items) =>
  '      <nav class="doc__toc" aria-label="On this page"><ul>' +
  items.map((i) => '<li><a href="#' + i[0] + '">' + i[1] + "</a></li>").join("") +
  "</ul></nav>";

/* ────────────────────────────── privacy ────────────────────────────── */

const PRIVACY = [
  '      <span class="eyebrow">Site policies</span>',
  "      <h1>Privacy Policy</h1>",
  '      <p class="doc__meta">Last updated ' + UPDATED + "</p>",
  toc([
    ["p1", "1. Who we are"], ["p2", "2. What we collect"], ["p3", "3. How we use it"],
    ["p4", "4. How we share it"], ["p5", "5. Security"], ["p6", "6. Retention"],
    ["p7", "7. International transfers"], ["p8", "8. Your rights"], ["p9", "9. Cookies"],
    ["p10", "10. Children"], ["p11", "11. Changes"], ["p12", "12. Contact"]
  ]),

  '      <h2 id="p1">1. Who we are</h2>',
  "      <p>SecureJobVA (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), legally operating as Secure Job VA, runs securejobva.com (the &ldquo;Site&rdquo;), a platform connecting employers with virtual assistant applicants. This policy explains how we collect, use and protect information from visitors, applicants and clients.</p>",

  '      <h2 id="p2">2. What we collect</h2>',
  "      <ul>",
  "        <li><b>Account information</b> &mdash; name, email, phone number, and a password. Passwords are stored only as a one-way hash; nobody here can read yours, including us.</li>",
  "        <li><b>Applicant information</b> &mdash; work history, skills, availability, location, equipment and internet access, and anything you submit during the application.</li>",
  "        <li><b>Social media information</b> &mdash; if you choose to give us profile links or connect an account, we may access profile information and public activity within the scope that platform grants. We ask for the minimum needed to review an application, and connecting is optional.</li>",
  /* This said payments were "handled by third-party payment processors". There
     is no processor: clients pay by bank transfer or a similar method arranged
     with us, off the Site, and staff record each payment by hand when it
     arrives (pay.html lists what was recorded; it takes no payment itself). A
     privacy policy has to describe what actually happens to the data. */
  "        <li><b>Payment information</b> &mdash; the Site does not take payments. Clients pay by bank transfer or another method arranged with us, and when a payment arrives a member of our staff records its date, amount, method and any reference you gave it, so it appears on your statement. We do not ask for or store card or bank account numbers.</li>",
  "        <li><b>Usage data</b> &mdash; pages visited, device and browser type, and IP address, collected automatically.</li>",
  "      </ul>",

  '      <h2 id="p3">3. How we use it</h2>',
  "      <ul>",
  "        <li>To evaluate and process applications.</li>",
  "        <li>To contact applicants and clients about an application, an opportunity, or an account.</li>",
  "        <li>To run, maintain and improve the Site.</li>",
  "        <li>To meet legal obligations.</li>",
  "      </ul>",
  "      <p><b>We do not sell personal information to third parties.</b></p>",

  '      <h2 id="p4">4. How we share it</h2>',
  "      <ul>",
  "        <li>With prospective clients reviewing applicants, as part of hiring.</li>",
  "        <li>With the service providers below, who run parts of the Site for us.</li>",
  "        <li>Where required by law, subpoena or legal process.</li>",
  "      </ul>",
  /* Named, because "service providers" tells nobody where their data is.
     These are the ones the code actually calls: the database and sign-in
     (Supabase), the host and its functions (Vercel), outgoing mail (Resend),
     the support mailbox (Zoho, the domain's MX), and Google — for the fonts
     every page loads from fonts.googleapis.com, and for "Sign in with
     Google" on the portal pages. "Payment processing" is gone from the list
     because there is none; see section 2. */
  "      <p>The service providers we use, and what each one does:</p>",
  "      <ul>",
  "        <li><b>Supabase</b> &mdash; hosts our database, sign-in and file storage. Applications, accounts, uploaded CVs, timesheets and billing records are stored with Supabase.</li>",
  "        <li><b>Vercel</b> &mdash; hosts the Site and runs the small server functions that send our notification emails, so every page request passes through Vercel.</li>",
  "        <li><b>Resend</b> &mdash; delivers the emails the Site sends, such as application confirmations, updates and account invitations. It receives the address and the content of each email.</li>",
  "        <li><b>Zoho</b> &mdash; hosts our support@securejobva.com mailbox, so anything you email us is stored there.</li>",
  "        <li><b>Google</b> &mdash; serves the typefaces the Site uses, so your browser requests them from Google, which receives your IP address and browser details when a page loads. If you choose to sign in with Google, Google also confirms your identity and passes us your name and email address.</li>",
  "      </ul>",

  '      <h2 id="p5">5. Security</h2>',
  "      <p>We use reasonable administrative, technical and physical safeguards. In practice that means passwords stored as hashes rather than text, and role-based access controls that decide who can see applicant data at the database level rather than in the page &mdash; so a mistake in the interface does not become a disclosure.</p>",
  "      <p>No system is completely secure, and we cannot promise absolute security.</p>",

  '      <h2 id="p6">6. Retention</h2>',
  "      <p>We keep applicant and account data for as long as we need it to provide the service or to meet a legal obligation. You can ask us to delete it &mdash; see section 8.</p>",

  '      <h2 id="p7">7. International transfers</h2>',
  "      <p>We work with applicants and clients in several countries, and your information may be transferred to and processed in a country other than your own.</p>",

  '      <h2 id="p8">8. Your rights</h2>',
  "      <p>Depending on where you live, you may have the right to see, correct or delete your personal information. Some of that you can do yourself: signing in at <a href=\"/status\">your application page</a> lets you read and update what you sent us. For anything else, write to <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>",

  '      <h2 id="p9">9. Cookies</h2>',
  /* This used to say storage was only for sign-in and the theme. The two
     forms also keep a draft of what is typed into them — name, email, phone,
     notes — and park a submission that failed to send for up to seven days,
     re-sending it on later visits (QUEUE_TTL in index.html and careers.html).
     On a shared computer that matters, so it is said, with what to do. */
  "      <p>The Site keeps a few things in your browser&rsquo;s own storage, on the device you are using:</p>",
  "      <ul>",
  "        <li>Your sign-in, so you stay signed in, and whether you prefer the light or dark theme.</li>",
  "        <li>A draft of the application or seat request form while you fill it in, including the contact details you type, so nothing is lost if the page closes. The draft is removed once the form has been sent.</li>",
  "        <li>If a form fails to send, a copy of it, which the Site tries to send again on your next visits. It is deleted after seven days whether or not it went.</li>",
  "      </ul>",
  "      <p>On a shared or public computer, clear this site&rsquo;s data in your browser settings when you finish. You can also block browser storage entirely, though signing in and saving drafts will stop working if you do.</p>",

  '      <h2 id="p10">10. Children</h2>',
  "      <p>The Site is not intended for anyone under 18, and we do not knowingly collect information from minors.</p>",

  '      <h2 id="p11">11. Changes</h2>',
  "      <p>We may update this policy. Continuing to use the Site after a change means you accept the revised version.</p>",

  '      <h2 id="p12">12. Contact</h2>',
  "      <p>Questions about this policy: <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>"
].join(nl);

/* ────────────────────────────── terms ────────────────────────────── */

const TERMS = [
  '      <span class="eyebrow">Site policies</span>',
  "      <h1>Terms of Service</h1>",
  '      <p class="doc__meta">Last updated ' + UPDATED + "</p>",
  toc([
    ["t1", "1. Acceptance"], ["t2", "2. The service"], ["t3", "3. Eligibility"],
    ["t4", "4. Your account"], ["t5", "5. Applicant conduct"], ["t6", "6. Social accounts"],
    ["t7", "7. No guarantee of work"], ["t8", "8. Status of placed assistants"],
    ["t9", "9. Fees"], ["t10", "10. Intellectual property"], ["t11", "11. Termination"],
    ["t12", "12. Liability"], ["t13", "13. Governing law"], ["t14", "14. Changes"],
    ["t15", "15. Contact"]
  ]),

  '      <h2 id="t1">1. Acceptance</h2>',
  "      <p>By using securejobva.com you agree to these Terms. If you do not agree, do not use the Site.</p>",

  '      <h2 id="t2">2. The service</h2>',
  "      <p>SecureJobVA connects people seeking virtual assistant work (&ldquo;Applicants&rdquo;) with businesses seeking to hire them (&ldquo;Clients&rdquo;). We are an intermediary. We do not guarantee employment, income, or any particular outcome.</p>",

  '      <h2 id="t3">3. Eligibility</h2>',
  "      <p>You must be at least 18 to create an account or apply.</p>",

  '      <h2 id="t4">4. Your account</h2>',
  "      <ul>",
  "        <li>Keep your login details to yourself.</li>",
  "        <li>Give accurate, current information in your application and profile.</li>",
  "        <li>You are responsible for what happens under your account.</li>",
  "      </ul>",

  '      <h2 id="t5">5. Applicant conduct</h2>',
  "      <p>Do not submit false information, impersonate anyone, or use the Site for anything other than genuinely looking for work.</p>",

  '      <h2 id="t6">6. Social accounts</h2>',
  "      <p>If you give us links to your social media, you authorise us to look at the public profile and activity there while we assess your application. That is the whole of it.</p>",
  "      <p><b>We do not post to your accounts.</b> Not with your permission, not at your request, and not once you are placed. We ask for links so we can see how you write; we never ask for the access that would let us publish, and nothing in the application grants it. If anyone contacts you claiming otherwise on our behalf, it did not come from us &mdash; tell us at <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>",

  '      <h2 id="t7">7. No guarantee of work</h2>',
  "      <p>Being listed, reviewed or interviewed does not guarantee an offer or continuing work. We take reasonable steps to check that a Client is legitimate, but we do not guarantee their conduct, their payment practices, or the conditions of the work.</p>",

  '      <h2 id="t8">8. Status of placed assistants</h2>',
  '      <div class="doc__open">',
  "        <b>This section is being finalised and is not yet in force.</b>",
  "        Whether a placed assistant is an independent contractor of the Client, a contractor of Secure Job VA, or an employee changes the tax and liability position for everyone involved, and it is being settled with our accountant and attorney rather than drafted here. Until it is published, the arrangement that applies to you is the one written in the agreement you sign before starting work, and that agreement governs.",
  "      </div>",
  "      <p>If you are applying and want to know where you would stand before you spend time on the exams, ask us at <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a> and we will tell you plainly.</p>",

  '      <h2 id="t9">9. Fees</h2>',
  "      <p><b>Applicants are never charged.</b> There is no fee to apply, to be listed, to be assessed, or to be placed, and we do not take a percentage of what you are paid. If anyone asks you to pay us for any of those things, it did not come from us &mdash; tell us at <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>",
  "      <p><b>Clients</b> pay a flat hourly rate for hours worked, quoted before the seat starts and billed weekly. There is no setup fee, no recruiting fee, and no markup added afterwards. The current rate and what it includes are on the <a href=\"/#pricing\">pricing section</a> of the home page; the rate quoted to you on your first call is the rate you are billed.</p>",
  /* This promised "a card and a deposit are set up before it starts". Nothing
     takes a card or a deposit: /pay records payments made off the Site, after
     the hours are billed. The billing that does happen is the one the Refund
     Policy already describes in its section 4, so this says the same. */
  "      <p>The first week of a new seat is not charged. Billing begins in the second week, weekly and in arrears: each bill covers hours already worked, at the rate quoted to you.</p>",

  '      <h2 id="t10">10. Intellectual property</h2>',
  "      <p>Everything on the Site except content submitted by users belongs to Secure Job VA and may not be copied or reproduced without permission.</p>",

  '      <h2 id="t11">11. Termination</h2>',
  "      <p>We may suspend or close an account for breaking these Terms, for fraud, or for misusing the Site.</p>",

  '      <h2 id="t12">12. Liability</h2>',
  "      <p>To the fullest extent the law allows, Secure Job VA is not liable for disputes, damages or losses arising out of the working relationship between an Applicant and a Client.</p>",

  '      <h2 id="t13">13. Governing law</h2>',
  "      <p>These Terms are governed by the laws of the State of Texas, United States, without regard to conflict of law principles. Secure Job VA is the legal business name operating this Site.</p>",

  '      <h2 id="t14">14. Changes</h2>',
  "      <p>We may update these Terms. Continuing to use the Site after a change means you accept the revised version.</p>",

  '      <h2 id="t15">15. Contact</h2>',
  "      <p>Questions about these Terms: <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a>.</p>"
].join(nl);

/* ────────────────────────────── refunds ────────────────────────────── */

const REFUNDS = [
  '      <span class="eyebrow">Site policies</span>',
  "      <h1>Refund Policy</h1>",
  '      <p class="doc__meta">Last updated ' + UPDATED + "</p>",

  /* Section 6, not 5: 5 is "When we will not refund", and the applicant
     section is the one after it. */
  "      <p>This policy covers fees paid by Clients. It does not apply to Applicants, who are never charged anything &mdash; see section 6.</p>",

  /* The card and deposit are gone from sections 1 and 2 for the same reason
     as in the Terms: nothing takes either, and billing is weekly in arrears,
     which is what section 4 below already says. */
  '      <h2 id="r1">1. The free first week</h2>',
  "      <p>A new seat&rsquo;s first week is not billed. If you decide during that week that the fit is wrong, you are not charged for the hours worked and there is nothing to refund. Billing begins in the second week, for hours already worked.</p>",

  '      <h2 id="r2">2. If the seat never starts</h2>',
  "      <p>If a seat does not begin work on the agreed start date and the reason is ours &mdash; we could not staff it, or the assistant withdrew &mdash; anything you have paid toward it is refunded in full. There is nothing to argue about: no work happened.</p>",
  "      <p>If the delay is yours &mdash; a change of plan, a project put back &mdash; tell us and we will hold the seat or release it. Nothing is billed for hours nobody worked either way.</p>",

  '      <h2 id="r3">3. Replacement, or a refund, at your choice</h2>',
  "      <p>If an assistant is not working out, our first answer is to replace them, at no cost, with the handover done for us rather than by you. There is no replacement fee and no charge for the overlap while the handover happens.</p>",
  "      <p><b>You are not obliged to take the replacement.</b> If you would rather stop, you can have a prorated refund of anything paid in advance for time not yet worked instead. The choice is yours, not ours &mdash; we prefer replacing because a refund leaves you where you started, still short a person, but that is a preference and not a condition.</p>",
  '      <div class="doc__open">',
  "        <b>How long this lasts is being finalised.</b>",
  "        The site currently promises a free replacement whenever a placement stops working, with no time limit attached, and we are not going to quietly narrow that in a policy page. If a guarantee period is set, it will be written here and it will not apply retroactively to seats already running.",
  "      </div>",

  '      <h2 id="r4">4. Billing and cancellation</h2>',
  "      <p>Billing is weekly and in arrears &mdash; you are billed for hours already worked, at the rate quoted to you. You can end the arrangement with two weeks&rsquo; notice. Hours worked during the notice period are billed normally; hours not worked are not.</p>",
  "      <p>Because billing follows work rather than preceding it, there is rarely anything to refund. Where you have been billed for hours that were not worked, or billed at a rate other than the one you were quoted, we correct it in full.</p>",

  '      <h2 id="r5">5. When we will not refund</h2>',
  "      <ul>",
  "        <li>Hours that were worked, delivered and billed at the agreed rate.</li>",
  "        <li>Ending the arrangement for reasons unrelated to the assistant&rsquo;s work, such as a change in your own plans &mdash; the two weeks&rsquo; notice applies instead.</li>",
  "        <li>Subscription or retainer fees, if you are ever on one. There are none today &mdash; billing is weekly and in arrears &mdash; and this policy will be updated before that changes.</li>",
  "        <li>Where the Terms of Service have been breached.</li>",
  "      </ul>",

  '      <h2 id="r6">6. Applicants are never charged</h2>',
  "      <p>SecureJobVA does not charge Applicants to apply, to be listed, to be assessed, or to be placed, and takes no percentage of their pay. There is therefore nothing for an Applicant to be refunded. If anybody asks an applicant to pay us, it did not come from us.</p>",

  '      <h2 id="r7">7. Asking for a refund</h2>',
  "      <p>Write to <a href=\"mailto:support@securejobva.com\">support@securejobva.com</a> with your account details and what happened. We review requests within 15 business days and usually much sooner.</p>"
].join(nl);

/* ────────────────────────────── contact ────────────────────────────── */

const CONTACT = [
  '      <span class="eyebrow">Contact</span>',
  "      <h1>Get in touch.</h1>",
  "      <p>Questions about an application, hiring, billing or anything else. A person reads these.</p>",

  '      <div class="contact__at">',
  '        <div class="contact__row"><span class="contact__k">All inquiries</span><span><a href="mailto:support@securejobva.com">support@securejobva.com</a></span></div>',
  '        <div class="contact__row"><span class="contact__k">Business address</span><span>Houston, Texas</span></div>',
  '        <div class="contact__row"><span class="contact__k">Hours</span><span>Monday to Sunday, 9am&ndash;7pm CST</span></div>',
  "      </div>",

  "      <p>For the fastest answer on an application, include your full name and the email address you applied with.</p>",

  '      <h2 id="form">Send us a message</h2>',
  '      <form class="cform" id="cform" novalidate>',
  '        <div class="cform__two">',
  '          <div class="fld">',
  '            <label for="c-name">Full name</label>',
  '            <input id="c-name" name="name" type="text" autocomplete="name" maxlength="200">',
  '            <p class="err" data-for="c-name" aria-live="polite"></p>',
  "          </div>",
  '          <div class="fld">',
  '            <label for="c-email">Email address</label>',
  '            <input id="c-email" name="email" type="email" autocomplete="email" spellcheck="false" maxlength="320">',
  '            <p class="err" data-for="c-email" aria-live="polite"></p>',
  "          </div>",
  "        </div>",
  '        <div class="cform__two">',
  '          <div class="fld">',
  '            <label for="c-phone">Phone <em>&mdash; optional</em></label>',
  '            <input id="c-phone" name="phone" type="tel" autocomplete="tel" maxlength="60">',
  "          </div>",
  '          <div class="fld">',
  '            <label for="c-reason">Reason for contact</label>',
  '            <select id="c-reason" name="reason">',
  '              <option value="General inquiry">General inquiry</option>',
  '              <option value="Application status">Application status</option>',
  '              <option value="Billing and refunds">Billing &amp; refunds</option>',
  '              <option value="Privacy request">Privacy request</option>',
  '              <option value="Other">Other</option>',
  "            </select>",
  "          </div>",
  "        </div>",
  '        <div class="fld">',
  '          <label for="c-message">Message</label>',
  '          <textarea id="c-message" name="message" maxlength="5000" placeholder="What can we help with?"></textarea>',
  '          <p class="err" data-for="c-message" aria-live="polite"></p>',
  "        </div>",
  '        <label class="opt" style="margin-bottom:1rem">',
  '          <input type="checkbox" id="c-agree">',
  '          <span class="opt__box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"></path></svg></span>',
  '          <span><span class="opt__t">I agree to the Terms of Service and Privacy Policy</span>',
  '          <span class="opt__d">Read the <a href="/terms">Terms</a> and the <a href="/privacy">Privacy Policy</a></span></span>',
  "        </label>",
  '        <p class="err" data-for="c-agree" aria-live="polite"></p>',
  '        <button class="btn btn--solid" id="c-send" type="submit">Send message</button>',
  '        <p class="err" data-for="c-send" aria-live="polite" style="margin-top:.5rem"></p>',
  '        <p class="doc__meta" style="margin:1rem 0 0;text-transform:none;letter-spacing:0;font-family:inherit;font-size:.85rem">By sending this you agree to be contacted about your inquiry at the email or phone number above. We answer within one to two business days.</p>',
  "      </form>",
  '      <div id="c-done" hidden></div>'
].join(nl);

/* The contact form's script. Written as one raw template rather than a list of
   quoted lines, because it now carries say() sentences that tools/lib-seg.mjs
   reads out of the page by pattern, and a sentence split across two quoted
   generator lines is one escaped quote away from reaching the page as
   something the pattern cannot see. Nothing in it uses a backtick or ${. */
const CONTACT_SCRIPT = String.raw`<script>
/* ── the words this page builds after it has loaded ───────────────────────
   The same arrangement as careers.html and index.html: SAYS is empty here and
   tools/build-es.mjs replaces it wholesale when it writes /es/contact, so the
   English page is untouched and the Spanish one says its own validation
   messages and results. /es/contact used to answer a Spanish form with "Tell
   us your name." and "Message sent." — contact.html was not one of the pages
   that went through say(). The key IS the English sentence. */
var SAYS = {};
function say(en, vars) {
  var s = Object.prototype.hasOwnProperty.call(SAYS, en) ? SAYS[en] : en;
  if (!vars) return s;
  return s.replace(/[{]([a-zA-Z]+)[}]/g, function (m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
}

/* Unused on this page, and here so the page has the same pair as the other
   two: tools/test-es-runtime.mjs lifts say() and sayList() together out of
   every page that builds sentences. */
function sayList(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + say(" and ") + items[items.length - 1];
}

(function () {
  "use strict";

  /* Same shape as the two intake forms: post to PostgREST, and if that fails
     fall back to a written email rather than losing the message. */
  var ENDPOINT = "https://hmgravlkatfmerzbozct.supabase.co/rest/v1/contact_messages";
  var HEADERS = {
    "apikey": "sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY",
    "Authorization": "Bearer sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
  };

  var form = document.getElementById("cform");
  var done = document.getElementById("c-done");
  if (!form) return;

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function fail(id, msg) {
    var p = form.querySelector('[data-for="' + id + '"]');
    if (p) p.textContent = msg || "";
    return !msg;
  }
  function clear() {
    Array.prototype.forEach.call(form.querySelectorAll(".err"), function (p) { p.textContent = ""; });
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* The rule is the database's own, character for character: sql/073 checks
     it on the two intake tables and sql/092 on this one. It used to be "an @
     after the first character and a dot anywhere", which let juan.perez@gmail
     through — and that address then went out as the reply-to on the staff
     notification, where Resend refused the whole email over it. */
  var ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var btn = document.getElementById("c-send");
  function ready() {
    btn.disabled = false;
    btn.textContent = say("Send message");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clear();

    var ok = true;
    if (!val("c-name")) ok = fail("c-name", say("Tell us your name.")) && ok;
    var em = val("c-email");
    if (!ADDRESS.test(em)) {
      ok = fail("c-email", say("We need an address we can reply to.")) && ok;
    }
    if (!val("c-message")) ok = fail("c-message", say("Tell us what you need.")) && ok;
    if (!document.getElementById("c-agree").checked) {
      ok = fail("c-agree", say("Please agree to the Terms and Privacy Policy.")) && ok;
    }
    if (!ok) return;

    var d = {
      name: val("c-name"),
      email: em,
      phone: val("c-phone") || null,
      reason: val("c-reason"),
      message: val("c-message"),
      /* contact_messages_sane caps page at 500, and a long query string from
         an ad link used to take the whole message down with it. */
      page: location.href.slice(0, 500)
    };

    btn.disabled = true;
    btn.textContent = say("Sending…");

    /* "sent", "failed", or a refusal the person can act on. A 4xx carrying an
       sjva- hint is a rule saying no on purpose — sql/092 refusing an address
       — and the fix is theirs to make in the form, so it is shown on the
       field rather than dressed up as the database being down and turned
       into an email they would then have to send by hand. */
    fetch(ENDPOINT, { method: "POST", headers: HEADERS, body: JSON.stringify(d) })
      .then(function (r) {
        if (r.ok) return "sent";
        if (r.status < 400 || r.status >= 500) return "failed";
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (x) {}
          if (j && typeof j.hint === "string" && j.hint.indexOf("sjva-") === 0 && j.message) {
            return { hint: j.hint, message: String(j.message) };
          }
          return "failed";
        }, function () { return "failed"; });
      })
      ["catch"](function () { return "failed"; })
      .then(function (v) {
        if (v && v.hint) {
          ready();
          if (v.hint === "sjva-address") {
            var s = say("That email address does not look complete. Check it and send again.");
            /* On the English page SAYS is empty and the sentence is the
               database's; on /es it is ours. */
            fail("c-email", s === "That email address does not look complete. Check it and send again." ? v.message : s);
            document.getElementById("c-email").focus();
          } else if (v.hint === "sjva-throttled") {
            /* sql/047 counts contact_messages too, ten an hour from one place.
               The sentence is the one /careers says for the same rule, so /es
               already has it in Spanish. */
            var t = say("That is more submissions than we accept from one place in an hour. " +
                        "Write to support@securejobva.com and a person will pick it up.");
            fail("c-send", t === "That is more submissions than we accept from one place in an hour. " +
                                 "Write to support@securejobva.com and a person will pick it up." ? v.message : t);
          } else {
            /* A rule written after this page. It is about the message as a
               whole, not the Terms box, so it goes under Send, where the
               person is looking — it used to sit under c-agree and read as
               if the checkbox had been the problem. */
            fail("c-send", v.message);
          }
          return;
        }
        var sent = v === "sent";
        form.setAttribute("hidden", "");
        done.removeAttribute("hidden");
        done.innerHTML = sent
          ? '<div class="cform__ok">' +
              say("<b>Message sent.</b> We answer within one to two business days, at {email}.",
                  { email: esc(d.email) }) +
            '</div>'
          /* Not lost: the message is written into an email the visitor sends
             themselves, which works even when our database does not. */
          : '<div class="cform__ok">' +
              say("<b>That did not send.</b> Your message is ready to email instead &mdash; {link}.",
                  { link: '<a href="mailto:support@securejobva.com?subject=' +
                      encodeURIComponent(d.reason + " — " + d.name) +
                      '&body=' + encodeURIComponent(d.message + "\n\n" + d.name + "\n" + d.email + (d.phone ? "\n" + d.phone : "")) +
                      '">' + say("send it now") + '</a>' }) +
            '</div>';
      });
  });
})();
</script>`.split("\n").join(nl);

/* The fifth column is where the language link points. Written out per page
   rather than derived from the filename: /contact and /privacy do not follow
   one rule, and a link that guesses is a link that 404s. */
const PAGES = [
  ["privacy.html",  "Privacy Policy — SecureJobVA",  PRIVACY, "",             "/es/privacy"],
  ["terms.html",    "Terms of Service — SecureJobVA", TERMS,  "",             "/es/terms"],
  ["refunds.html",  "Refund Policy — SecureJobVA",   REFUNDS, "",             "/es/refunds"],
  ["contact.html",  "Contact — SecureJobVA",         CONTACT, CONTACT_SCRIPT, "/es/contact"]
];

for (const [file, title, body, script, es] of PAGES) {
  writeFileSync(file, shell({ title, body, script, es }));
  console.log(file + " written");
}
