/* Builds dist/ — deployable copies of the pages.

   index.html and careers.html are written to double as Claude artifacts, so they
   carry no doctype, <html lang> or <head>: the artifact viewer supplies those.
   A real host does not, so this step wraps each page into a complete document,
   adds the meta a share or a search result needs, and rewrites the cross-page
   artifact links to plain relative paths.

   Run: node build.mjs   Deploy: the dist/ folder. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const SITE = "https://securejobva.com";

const PAGES = [
  {
    src: "index.html",
    path: "/",
    /* The <title> in the page file names the Claude artifact; a search result
       wants more than the brand on its own, so dist gets this instead. */
    title: "Dedicated virtual assistants from $9/hr | SecureJobVA",
    description:
      "Dedicated virtual assistants in customer service, sales and marketing, and admin support — matched to your business in about a week at $9 an hour flat. No setup fee, no recruiting fee, no long-term contract.",
    ogTitle: "Cover the hours you can't."
  },
  {
    src: "careers.html",
    path: "/careers.html",
    title: "Remote virtual assistant jobs, hiring worldwide | SecureJobVA",
    description:
      "Full-time remote seats in customer service, sales and marketing, and admin support. Apply from any country — fixed hours, one client, and no fee to apply, ever.",
    ogTitle: "A full-time seat, not a gig queue."
  }
];

/* Cross-page links are absolute artifact URLs so the published pages can reach
   each other; on a real domain they are just files sitting side by side. */
const REWRITE = [
  ["https://claude.ai/code/artifact/8b71696b-b927-4756-86d8-fb33f7c314f7", "/"],
  ["https://claude.ai/code/artifact/59e78011-5885-43c0-bd9a-8c4754a13d45", "/careers.html"]
];

const ASSETS = ["og.png", "og.svg", "favicon.svg", "robots.txt"];

/* Everything before the page header is head material: <title>, the font links,
   the stylesheet and the pre-paint theme script. */
const SPLIT = '<header class="nav">';

function title(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : "SecureJobVA";
}

function build(page) {
  let html = readFileSync(page.src, "utf8");
  for (const [from, to] of REWRITE) html = html.split(from).join(to);

  const cut = html.indexOf(SPLIT);
  if (cut === -1) throw new Error(page.src + ": no " + SPLIT + " — cannot tell head from body");

  let head = html.slice(0, cut).trim();
  if (page.title) head = head.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + page.title + "</title>");
  const body = html.slice(cut).trim();
  const url = SITE + page.path;

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${page.description}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191110" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SecureJobVA">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${page.ogTitle}">
<meta property="og:description" content="${page.description}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The SecureJobVA shield mark on a red field.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.ogTitle}">
<meta name="twitter:description" content="${page.description}">
<meta name="twitter:image" content="${SITE}/og.png">
${head}
</head>
<body>
${body}
</body>
</html>
`;

  writeFileSync("dist/" + page.src, doc);
  return { url, title: page.title || title(html), bytes: doc.length };
}

mkdirSync("dist", { recursive: true });

const built = PAGES.map(build);

writeFileSync(
  "dist/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    built.map((p) => "  <url><loc>" + p.url + "</loc></url>\n").join("") +
    "</urlset>\n"
);

for (const a of ASSETS) copyFileSync(a, "dist/" + a);

for (const p of built) console.log(p.url + "  " + p.title + "  " + (p.bytes / 1024).toFixed(1) + " KB");
console.log("dist/ ready — " + (ASSETS.length + built.length + 1) + " files");
