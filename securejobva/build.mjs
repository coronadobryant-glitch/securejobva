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
    title: "Privacy Policy — SecureJobVA",
    description:
      "How SecureJobVA collects, uses and protects information from visitors, applicants and clients.",
    ogTitle: "Privacy Policy"
  },
  {
    src: "terms.html",
    path: "/terms",
    title: "Terms of Service — SecureJobVA",
    description:
      "The terms you agree to by using securejobva.com, for both applicants and clients.",
    ogTitle: "Terms of Service"
  },
  {
    src: "refunds.html",
    path: "/refunds",
    title: "Refund Policy — SecureJobVA",
    description:
      "How refunds, the free first week and the replacement guarantee work. Applicants are never charged.",
    ogTitle: "Refund Policy"
  },
  {
    src: "contact.html",
    path: "/contact",
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

  const doc = `<!doctype html>
<html lang="en">
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
