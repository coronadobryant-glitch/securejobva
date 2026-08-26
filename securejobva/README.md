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

In the Vercel project: **Settings → Domains → Add**, enter `securejobva.com`
and `www.securejobva.com`.

**`www` is the primary host**, and the apex redirects to it — that is what the
project currently serves, and `SITE` in `build.mjs` is set to match so the
canonical never names a URL that immediately redirects. If you ever flip the
primary to the apex in Vercel, flip `SITE` in the same commit;
`node tools/check.mjs --live` fails when the two disagree.

Vercel then shows the exact DNS records to create. Use the ones it shows you —
the apex IP has changed more than once, so anything written down here would go
stale. Add them at GoDaddy under **My Products → Domain → DNS → Manage Zones**:

- an **A** record for `@`, value as shown by Vercel
- a **CNAME** for `www`, value as shown by Vercel

Delete GoDaddy's parking records for `@` and `www` first, or the new ones will
not take. Vercel's domain page goes green when it sees them — usually minutes,
occasionally an hour.

### Check it

`node tools/check.mjs --live` checks all of this in one go. By hand:

- `securejobva.com` loads over HTTPS
- **Careers** in the nav goes to `/careers`, with no `.html`
- `/careers.html` redirects to `/careers`
- `/apply` and `/jobs` land on the careers page
- `securejobva.com` redirects to `www.securejobva.com`

### Other hosts

`_headers`, `_redirects` and `.htaccess` are kept for Cloudflare Pages, Netlify
and Apache respectively. They are not copied into `dist/` — add them back to
`ASSETS` in `build.mjs` if you ever move.

## Forms

Both dialogs POST JSON to Supabase. Everything the database needs lives in
**`sql/`** — numbered files you copy and paste into the Supabase SQL editor, in
order. `sql/README.md` explains the workflow; the short version is that every
file is safe to run twice, so when in doubt, run it.

That folder is the shared surface between whoever is working on this. Add a
schema change as the next numbered file, push, and the other person has it.

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

**The one rule.** The anon key is public. It is safe only because RLS holds it
to INSERT and nothing else. Do not add a SELECT policy for `anon` — the tables
hold applicants' names, emails, phone numbers and CV links.

Reading is for `authenticated`, which is a different thing entirely: a session
Supabase issues only after Google has vouched for an email, with every read
still fenced by a policy. An applicant sees their own row and nobody else's;
anything wider requires being listed in `public.admins`. So grant to
`authenticated`, never to `anon` — see `sql/003-portal.sql`.

Read the rows yourself in the Supabase dashboard, which bypasses RLS.

Column names match the JSON keys exactly and PostgREST rejects an insert
carrying a key with no column. Add a field to a form, add the column too.

## Guards

Four, because every way this site loses data is silent. A rejected insert, a
readable table and a stale canonical all leave the pages rendering perfectly.

**In the page — a submission survives a failed POST.** `send()` retries once,
then parks the payload in `localStorage` and re-sends it on the visitor's next
visit; the written-email handoff still runs, it is just no longer the only net.
The trade is deliberate and worth knowing: a parked row holds a real name,
email and phone number on that person's own machine. So the queue is capped at
20, entries are dropped after a week whether or not they ever went, and a
stored row is deleted the moment Supabase confirms it.

**Before a deploy — `node tools/check.mjs`.** Runs as part of the Vercel build
command, so a tree that would lose leads cannot ship. It checks that every
inline script parses, that every form field has a column, that no unrounded
arithmetic goes into an integer column, that nothing in `sql/` grants `anon`
more than INSERT, and that `dist/` carries its meta with no artifact URLs
left in it. Add `--live` to also check the running site's routes, redirects and
canonical host. It also runs `tools/test-queue.mjs`, which pulls the queue code
straight out of `index.html` and drives it against a mocked store — parking,
draining, the cap, the expiry, and storage being blocked outright.

**Is it all running? — `node tools/status.mjs`.** One command for the whole picture: whether both repos are in sync, whether the build and every check pass, whether the live site serves its routes with the right headers and is actually current, which migrations have landed in the database, and whether the two forms still accept work. Nothing it does writes a row — every probe fails on a constraint or names a column that does not exist. It prints what it cannot see too: anything behind sign-in is invisible to the public key by design, so it hands you the two URLs to open instead.

**Against the database — `node tools/guard-rls.mjs`.** Asserts that the
publishable key still cannot `SELECT` from any of the eleven tables behind
sign-in, that the SECURITY DEFINER functions refuse it, and that the two intake
tables still accept an insert. This is the one rule below, checked rather than believed: it is a
single dashboard toggle away from being untrue, and nothing in this repo would
change when it happened. Nothing it does writes a row — the insert probe names
a column that does not exist on purpose. Worth running on a schedule.

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

- **Confirm `support@` receives mail.** The only one still open, and the only one
  that cannot be checked from this repo. Mail is on **Zoho**, not GoDaddy, and the
  DNS side is complete and correct: MX at `mx.zoho.com` (10/20/50), SPF
  `include:zohomail.com`, DKIM on `zmail._domainkey`, DMARC `p=quarantine` with
  reports going to `support@`, domain verified. But MX records route mail, they do
  not create a mailbox. Send a real message from an outside account and confirm it
  lands in the Zoho inbox rather than bouncing. Every fallback on both pages hands
  the visitor this address, so a dead box loses the leads the guards just saved.
- **A booking link** (optional). `CFG.scheduler` on `index.html` takes a Cal.com or
  Calendly URL and adds a "Pick your time" step after submit.

Settled, so they are not on the list any more: hardware minimums on `careers.html`
are concrete; pay stays at the offer stage by decision, not by oversight; the
first-90-days grid on `index.html` stays as it is rather than carrying quotes.

## Note

The two pages duplicate their shared CSS, because an artifact has to be self-contained.
If they drift, that is why — extract a `styles.css` at the point you stop publishing
them as artifacts.
