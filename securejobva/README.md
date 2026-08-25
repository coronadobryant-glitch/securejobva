# SecureJobVA

Two static pages, no framework, no dependencies.

| File | Who it is for | Published at |
| --- | --- | --- |
| `index.html` | Businesses hiring a virtual assistant | [artifact 8b71696b](https://claude.ai/code/artifact/8b71696b-b927-4756-86d8-fb33f7c314f7) |
| `careers.html` | People applying for a seat | [artifact 59e78011](https://claude.ai/code/artifact/59e78011-5885-43c0-bd9a-8c4754a13d45) |

Each page carries its own CSS and JS so it can be published as a Claude artifact,
which means it has no `<!doctype>`, `<html lang>` or `<head>` — the artifact viewer
supplies those. `build.mjs` adds them back for real hosting.

## Build

```
node build.mjs
```

Writes `dist/`: both pages wrapped as complete documents with meta, Open Graph and
Twitter cards, `sitemap.xml`, `robots.txt`, the favicon and the share image. It also
rewrites the cross-page links from artifact URLs to plain paths.

## Deploy

Vercel hosts it. GoDaddy stays the registrar and keeps the DNS — only two
records there point at Vercel; nameservers do not move.

`vercel.json` holds the whole host config: build command, output directory,
clean URLs (`/careers`, never `/careers.html`), the `/apply` and `/jobs`
aliases, security headers and asset caching. Vercel handles HTTPS and the
certificate itself.

### First deploy

From this folder:

```
npx vercel login
npx vercel --prod
```

Vercel reads `vercel.json`, runs `node build.mjs`, and publishes `dist/`. Accept
the defaults it offers — do not let it guess a framework, this is plain static
output and `vercel.json` already says so.

Every later deploy is the same one command.

### The domain

In the Vercel project: **Settings → Domains → Add**, enter `securejobva.com`,
then add `www.securejobva.com` and choose **Redirect to securejobva.com**.

Vercel then shows the exact DNS records to create. Use the ones it shows you —
the apex IP has changed more than once, so anything written down here would go
stale. Add them at GoDaddy under **My Products → Domain → DNS → Manage Zones**:

- an **A** record for `@`, value as shown by Vercel
- a **CNAME** for `www`, value as shown by Vercel

Delete GoDaddy's parking records for `@` and `www` first, or the new ones will
not take. Vercel's domain page goes green when it sees them — usually minutes,
occasionally an hour.

### Check it

- `securejobva.com` loads over HTTPS
- **Careers** in the nav goes to `/careers`, with no `.html`
- `/careers.html` redirects to `/careers`
- `/apply` and `/jobs` land on the careers page
- `www.securejobva.com` redirects to the bare domain

### Other hosts

`_headers`, `_redirects` and `.htaccess` are kept for Cloudflare Pages, Netlify
and Apache respectively. They are not copied into `dist/` — add them back to
`ASSETS` in `build.mjs` if you ever move.

## Forms

Both dialogs POST JSON to Supabase. `supabase.sql` in this folder creates the
two tables and the policies; paste it into the Supabase SQL editor and run it
once.

Then fill in `CFG` at the bottom of each page (search for `CFG = {`):

```js
/* index.html */
endpoint: "https://<project-ref>.supabase.co/rest/v1/seat_requests",
headers: {
  "apikey":        "<anon key>",
  "Authorization": "Bearer <anon key>",
  "Prefer":        "return=minimal"
},

/* careers.html */
endpoint: "https://<project-ref>.supabase.co/rest/v1/applications",
headers: { ...the same three... },
```

Both values are in Supabase under **Settings → API**. Use the **anon** key.
Never the `service_role` key — that one bypasses every policy and would hand
the whole table to anyone who viewed source.

With `endpoint` empty the dialogs fall back to handing the visitor a written
email, and they do the same if a POST fails, so a Supabase outage never costs
you a lead.

**The one rule.** The anon key is public. It is safe only because RLS on those
two tables allows INSERT and nothing else. Do not add a SELECT policy for
`anon` — the tables hold applicants' names, emails, phone numbers and CV links.
Read the rows in the Supabase dashboard, which bypasses RLS.

Column names match the JSON keys exactly and PostgREST rejects an insert
carrying a key with no column. Add a field to a form, add the column too.

## Brand

Four colours, read pixel by pixel out of the supplied logo file. They are the
whole palette — everything else on the pages is a neutral mixed toward the navy.

| | Hex | Where it comes from |
| --- | --- | --- |
| Azure | `#0092FE` | the `VA` in the wordmark |
| Blue | `#0072EE` | the shield's bright corner; the site's `--accent` |
| Mid | `#0053B4` | the briefcase |
| Navy | `#001232` | the wordmark, and the shield's point; the site's `--ink` |

Amber `#FFC233` is kept from the old palette as `--signal`. It is deliberately
not in the logo: it marks the few things that must be noticed — the rate, the
underline in the headline, a `seats left` badge — and it never sits next to the
mark, so it never competes with it.

The mark is drawn as SVG in three places per page (nav, footer, dialog), all
pointing at one `linearGradient id="brandShield"` defined just above the header.
Its stops read `--mark-from` and `--mark-to` so the artwork follows the theme;
both carry a literal fallback, so a browser that cannot resolve `var()` inside a
gradient stop still gets a blue shield rather than a black one.

The proportions are **not** a literal tracing of the logo file. The ring is
thicker, the briefcase wider and the check heavier, because the nav renders the
mark at 26px and the dialog at 22px, and the traced original silts up into a
blob at that size. `favicon.svg` carries the same geometry with the colours
written out, since a favicon is fetched on its own and cannot read the tokens.

## Share image

`og.png` is generated by `node tools/make-og.mjs` — a mark-only card, no text.
That script is a hand-rolled rasteriser with no image dependencies, so the mark
is defined there a third time, as geometry. Both shield outlines are cubics and
are flattened before filling: the ring is barely two units thick, so an
eyeballed polygon puts its inner edge in the wrong place and the interior leaks
out of the bottom.

`og.svg` is the typeset version; open it in a browser and export at 1200x630 if you
want the wordmark card instead, then overwrite `og.png`.

## Still to do before launch

- **`hello@` and `apply@` do not exist.** The domain has no MX records, so both
  addresses on the pages bounce. Until this is fixed the forms are decorative:
  every visitor who taps send is writing into a hole. Cheapest fix is a free
  ImprovMX account (two DNS records at GoDaddy, forwards both to a Gmail); GoDaddy
  also sells mailboxes. Check with `nslookup -type=MX securejobva.com` — no
  answer means it is still broken.
- **Pay bands on `careers.html`** — flagged placeholder, the first thing applicants look for.
- **Confirm the hardware minimums** on `careers.html`; applicants buy kit against them.
- **Client quotes on `index.html`** — optional. The first-90-days section stands on its own;
  three real quotes can replace it in the same grid once you have written permission.
- **Wire the forms to Supabase.** Run `supabase.sql`, then paste the project URL and
  anon key into `CFG` on both pages — see Forms above. Until then both dialogs just hand
  the visitor a pre-written email, so you only hear from the ones who tap send.
- **A booking link** (optional). `CFG.scheduler` on `index.html` takes a Cal.com or
  Calendly URL and adds a "Pick your time" step after submit.

## Note

The two pages duplicate their shared CSS, because an artifact has to be self-contained.
If they drift, that is why — extract a `styles.css` at the point you stop publishing
them as artifacts.
