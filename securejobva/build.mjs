/* Builds dist/ — deployable copies of the pages.

   index.html and careers.html are written to double as Claude artifacts, so they
   carry no doctype, <html lang> or <head>: the artifact viewer supplies those.
   A real host does not, so this step wraps each page into a complete document,
   adds the meta a share or a search result needs, and rewrites the cross-page
   artifact links to plain relative paths.

   Run: node build.mjs   Deploy: the dist/ folder. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

/* Must match the host Vercel serves as Production, not the one that redirects
   to it. Vercel is www-primary: securejobva.com 308s to www.securejobva.com. A
   canonical pointing at the apex would name a URL that immediately redirects,
   which splits the ranking signal. Flip this back if the apex is ever made
   primary in Vercel -> Domains. */
const SITE = "https://www.securejobva.com";

const PAGES = [
  {
    src: "index.html",
    path: "/",
    alt: "/es/",
    /* The <title> in the page file names the Claude artifact; a search result
       wants more than the brand on its own, so dist gets this instead. */
    title: "Dedicated virtual assistants at $7.75/hr flat | SecureJobVA",
    description:
      "Dedicated virtual assistants in customer service, sales and marketing, and admin support — matched to your business in about a week at $7.75 an hour flat. No setup fee, no recruiting fee, no long-term contract.",
    ogTitle: "Cover the hours you can't."
  },
  {
    src: "careers.html",
    path: "/careers",
    alt: "/es/careers",
    title: "Online jobs: remote VA roles with paid training | SecureJobVA",
    description:
      "Online jobs hiring worldwide. Training is paid only after you pass the exams and are approved, then 40 hours a week on fixed hours in American time. No fee to apply, ever.",
    ogTitle: "Online jobs with paid training, then a full-time seat."
  },
  {
    src: "status.html",
    path: "/status",
    title: "Your application — SecureJobVA",
    description:
      "Sign in with the Google account you applied with and see which stage your SecureJobVA application has reached.",
    ogTitle: "Where you are in the process.",
    /* A signed-in page is for the person signed in, not for search. */
    noindex: true
  },
  {
    src: "admin.html",
    path: "/admin",
    title: "Admin portal — SecureJobVA",
    description: "Internal.",
    ogTitle: "Admin portal",
    noindex: true
  },
  {
    src: "hub.html",
    path: "/hub",
    title: "Your portal — SecureJobVA",
    description:
      "The portal for assistants working with SecureJobVA. Sign in with the address on your application.",
    ogTitle: "Your portal",
    /* Signed in, and only for people who have been hired. */
    noindex: true
  },
  {
    src: "privacy.html",
    path: "/privacy",
    alt: "/es/privacy",
    title: "Privacy Policy — SecureJobVA",
    description:
      "How SecureJobVA collects, uses and protects information from visitors, applicants and clients.",
    ogTitle: "Privacy Policy"
  },
  {
    src: "terms.html",
    path: "/terms",
    alt: "/es/terms",
    title: "Terms of Service — SecureJobVA",
    description:
      "The terms you agree to by using securejobva.com, for both applicants and clients.",
    ogTitle: "Terms of Service"
  },
  {
    src: "refunds.html",
    path: "/refunds",
    alt: "/es/refunds",
    title: "Refund Policy — SecureJobVA",
    description:
      "How refunds, the free first week and the replacement guarantee work. Applicants are never charged.",
    ogTitle: "Refund Policy"
  },
  {
    src: "contact.html",
    path: "/contact",
    alt: "/es/contact",
    title: "Contact — SecureJobVA",
    description:
      "Reach SecureJobVA about an application, hiring, billing or a privacy request.",
    ogTitle: "Contact"
  },
  {
    src: "seats.html",
    path: "/seats",
    title: "Your seats — SecureJobVA",
    description: "Sign in to see the seats you have asked SecureJobVA for and where each one has got to.",
    ogTitle: "Your seats",
    noindex: true
  },
  {
    src: "pay.html",
    path: "/pay",
    title: "Pay — SecureJobVA",
    description: "Sign in to see what you owe for the hours you have approved, and how to settle it.",
    ogTitle: "Pay",
    /* The address that goes in the weekly email. Signed in, and about one
       business's money, so it is no more for search than /seats is. */
    noindex: true
  },

  /* ── the Spanish half ──────────────────────────────────────────────────
     Written by tools/build-es.mjs from the English pages, so these six are
     generated and never edited by hand. Each one is paired with its English
     original through `alt`, which becomes the hreflang links below: without
     them the two versions compete in search instead of pointing at each
     other. The portal pages have no Spanish twin and no alt. */
  {
    src: "es/index.html",
    path: "/es/",
    lang: "es",
    alt: "/",
    title: "Asistentes virtuales dedicados a $7.75/hora fijos | SecureJobVA",
    description:
      "Asistentes virtuales dedicados en atención al cliente, ventas y marketing, y soporte administrativo — asignados a su negocio en cerca de una semana a $7.75 la hora, tarifa fija. Sin cargo de instalación, sin cargo de reclutamiento, sin contrato a largo plazo.",
    ogTitle: "Cubra las horas que no alcanza."
  },
  {
    src: "es/careers.html",
    path: "/es/careers",
    lang: "es",
    alt: "/careers",
    title: "Empleos en línea: puestos remotos de asistente con formación pagada | SecureJobVA",
    description:
      "Empleos en línea con contratación en todo el mundo. La formación se paga solo después de que apruebes los exámenes y seas aceptado; después, 40 horas a la semana en horario fijo de Estados Unidos. Nunca se cobra por postular.",
    ogTitle: "Empleos en línea con formación pagada y un puesto de tiempo completo."
  },
  {
    src: "es/contact.html",
    path: "/es/contact",
    lang: "es",
    alt: "/contact",
    title: "Contacto — SecureJobVA",
    description: "Preguntas sobre una postulación, sobre contratar o sobre facturación. Una persona lee todos los mensajes.",
    ogTitle: "Hablemos."
  },
  {
    src: "es/privacy.html",
    path: "/es/privacy",
    lang: "es",
    alt: "/privacy",
    title: "Política de privacidad — SecureJobVA",
    description: "Cómo SecureJobVA recopila, usa y protege la información de visitantes, postulantes y clientes.",
    ogTitle: "Política de privacidad"
  },
  {
    src: "es/terms.html",
    path: "/es/terms",
    lang: "es",
    alt: "/terms",
    title: "Términos del servicio — SecureJobVA",
    description: "Las condiciones bajo las que se usa securejobva.com. La versión en inglés es la que rige.",
    ogTitle: "Términos del servicio"
  },
  {
    src: "es/refunds.html",
    path: "/es/refunds",
    lang: "es",
    alt: "/refunds",
    title: "Política de reembolsos — SecureJobVA",
    description: "La primera semana gratis, el reemplazo sin costo y cuándo se reembolsa. La versión en inglés es la que rige.",
    ogTitle: "Política de reembolsos"
  }
];

/* Cross-page links are absolute artifact URLs so the published pages can reach
   each other; on a real domain they are just files sitting side by side. */
const REWRITE = [
  ["https://claude.ai/code/artifact/8b71696b-b927-4756-86d8-fb33f7c314f7", "/"],
  ["https://claude.ai/code/artifact/59e78011-5885-43c0-bd9a-8c4754a13d45", "/careers"]
];

const ASSETS = ["og.png", "og.svg", "favicon.svg", "robots.txt"];

/* Everything before the page header is head material: <title>, the font links,
   the stylesheet and the pre-paint theme script. */
/* The header used to be the only marker, but anything rendering above it -- the
   rating banner on the home page -- then landed inside <head>, which browsers
   only survive by closing the head early. Whichever marker comes first wins. */
/* <main> is the backstop, and it is the one every page has. The two markers
   above are both optional chrome: the rating banner appears on one page, and
   the site header is absent from /admin, which now renders as an application
   with its navigation in a sidebar instead. Removing that header broke this
   split and the build with it — nothing matched, so head could not be told
   from body. A marker list made only of things a page might not have is a list
   that eventually finds none of them. */
const BODY_STARTS = ['<section class="rated"', '<header class="nav">', "<main>"];

function title(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : "SecureJobVA";
}

function build(page) {
  let html = readFileSync(page.src, "utf8");
  for (const [from, to] of REWRITE) html = html.split(from).join(to);

  const cut = BODY_STARTS
    .map((m) => html.indexOf(m))
    .filter((i) => i !== -1)
    .reduce((a, i) => (a === -1 || i < a ? i : a), -1);
  if (cut === -1)
    throw new Error(page.src + ": none of " + BODY_STARTS.join(", ") + " — cannot tell head from body");

  let head = html.slice(0, cut).trim();
  if (page.title) head = head.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + page.title + "</title>");
  const body = html.slice(cut).trim();
  const url = SITE + page.path;

  /* Kept out of the template below: a signed-in page has nothing for a crawler. */
  const robots = page.noindex
    ? '<meta name="robots" content="noindex, nofollow">'
    : "";

  /* Each page points at its twin and at itself, which is what hreflang
     wants: a pair that agrees. x-default goes to English, the language
     somebody gets when we cannot tell. */
  const alt = page.alt
    ? [
        '<link rel="alternate" hreflang="en" href="' + SITE + (page.lang === "es" ? page.alt : page.path) + '">',
        '<link rel="alternate" hreflang="es" href="' + SITE + (page.lang === "es" ? page.path : page.alt) + '">',
        '<link rel="alternate" hreflang="x-default" href="' + SITE + (page.lang === "es" ? page.alt : page.path) + '">'
      ].join(String.fromCharCode(10))
    : "";

  const doc = `<!doctype html>
<html lang="${page.lang || "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${page.description}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080F1C" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SecureJobVA">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${page.ogTitle}">
<meta property="og:description" content="${page.description}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The SecureJobVA shield mark — a briefcase and a check inside a shield — on a navy field.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.ogTitle}">
<meta name="twitter:description" content="${page.description}">
<meta name="twitter:image" content="${SITE}/og.png">
${robots}
${alt}
${head}
</head>
<body>
${body}
</body>
</html>
`;

  writeFileSync("dist/" + page.src, doc);
  return { url, title: page.title || title(html), bytes: doc.length, noindex: !!page.noindex };
}

mkdirSync("dist", { recursive: true });
mkdirSync("dist/es", { recursive: true });

const built = PAGES.map(build);

writeFileSync(
  "dist/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    built.filter((p) => !p.noindex).map((p) => "  <url><loc>" + p.url + "</loc></url>\n").join("") +
    "</urlset>\n"
);

for (const a of ASSETS) copyFileSync(a, "dist/" + a);

for (const p of built) console.log(p.url + "  " + p.title + "  " + (p.bytes / 1024).toFixed(1) + " KB");
console.log("dist/ ready — " + (ASSETS.length + built.length + 1) + " files");
