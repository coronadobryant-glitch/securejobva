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

`vercel.json` is the one list of headers and redirects the live site uses.
`.htaccess` is kept for a move to Apache and says so itself; it is not copied
into `dist/`, because a host config copied into the output is just a file
anybody can download, so on a move it goes into the document root by hand. `_headers` and `_redirects` (Cloudflare Pages and
Netlify) used to sit here too, with comments saying the host read them from
the publish directory — nothing ever put them there, so they were deleted
rather than left describing a deploy that did not exist. Write them again from
`vercel.json` if you ever move to one of those hosts.

## Forms

Both dialogs POST JSON to Supabase. Everything the database needs lives in
**`sql/`** — numbered files you copy and paste into the Supabase SQL editor, in
order, each one once. `sql/README.md` explains the workflow. The short version:
when you are unsure whether a file has run, ask the database (`node
tools/status.mjs`, or `select n from public.schema_migrations`) rather than
running it again. Each file is repeatable on its own, but re-running an older
one after a later file has replaced a function it defines puts the older body
back, silently.

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
draining, the cap, the expiry, and storage being blocked outright — and every
other `tools/test-*.mjs`, each of which is offline: nothing in them reaches the
network, the database or a mail provider. A new test is not guarding anything
until it has a line in `check.mjs`; two once sat outside it for a week.

Two of its checks are about files that write other files. `tools/audit.mjs`
(duplicate ids, dead anchors, missing labels) sweeps every page `build.mjs`
ships, read from `build.mjs` — it used to stop at nine and never saw `/hub`,
`/pay` or the Spanish pages. And `status.html`, `admin.html`, `hub.html`,
`seats.html` and `pay.html` are written by `tools/build-portal.mjs`, which
never reads them: an edit made in one of those pages and not in the generator
is undone, silently, the next time somebody runs it. `check.mjs` runs the
generator in a scratch folder and warns, page by page, while what it writes
and what is in the repo differ. While that warning is up, port the edits into
the generator before running it here.

**Is it all running? — `node tools/status.mjs`.** One command for the whole picture: whether both repos are in sync, whether the build and every check pass, whether the live site serves its routes with the right headers and is actually current, which migrations have landed in the database, and whether the two forms still accept work. It prints what it cannot see too: anything behind sign-in is invisible to the public key by design, so it hands you the two URLs to open instead.

What it touches: it runs `git fetch --all`, rebuilds `dist/` with `build.mjs`, and against the database only reads, plus insert probes that each fail on a constraint or a column that does not exist, so no row is written. With `.env.local` present it also reads the paying half with the service role key. The one write is opt-in: `node tools/status.mjs --auth-probe` asks GoTrue where emailed links land by minting five password-recovery links on one real account — no mail is sent, but each rewrites that account's recovery token, so a reset link already in their inbox stops working. It picks the account least likely to have one (the oldest link, never one from the last hour) and its last line names the account it used. Run bare it skips that section and says so; this paragraph used to say nothing it does writes a row, which was not true once `.env.local` was there.

It asks about the migrations twice, because the two answers fail differently. The probes infer: a table that exists but refuses the public key has landed. That covers most migrations and misses whole shapes — a trigger function or a column granted to nobody is invisible to PostgREST however well it ran, which left 034, 040 and 043 with no check at all and made the newest schema change the one nothing could see. So `sql/044` gave every migration a place to write its own number, and the second answer reads that rather than guessing. A file with no row is reported by which side of 044 it falls on: after it, a missing stamp means the file did not run; before it, only that 044 had no artifact to detect. Those two silences mean opposite things and saying so is the whole point — reporting the second as missing would light up a dozen red lines nobody can ever clear, and a check that cries wolf gets switched off.

**Against the database — `node tools/guard-rls.mjs`.** Asserts that the
publishable key still cannot `SELECT` from any table or view behind sign-in —
every one a numbered file in `sql/` creates, read from the folder, so a table
added tomorrow is guarded the day it is pasted — that the SECURITY DEFINER
functions refuse it, that the `applicant-docs` bucket is neither public nor
listable, and that the two intake tables still accept an insert. This is the
one rule below, checked rather than believed: it is a single dashboard toggle
away from being untrue, and nothing in this repo would change when it happened.
Run bare it writes nothing — the insert probe names a column that does not
exist on purpose — and it is worth running on a schedule.

`--probe-signup` adds the one check that cannot be made without writing: that
sign-up issues no session until the address is confirmed. It signs up a
made-up `@securejobva-guard.invalid` address, which creates a row in
`auth.users` and makes GoTrue try to send it a confirmation mail (a bounce, and
a unit of the auth email rate limit real sign-ups share), then deletes it with
the service role key if `.env.local` has one. Run it after touching the auth
settings, not on a schedule.

**The paying half — `node tools/walk-paying.mjs`.** The one tool here that
writes rows, and the reason it exists is that on 7 September 2026 every table
on that half was empty: no client had ever been created, no assistant had ever
been placed, no week had ever been worked, nothing had ever been paid. Phases 5
to 11 had never run once. `simulate.mjs` walks the same ground offline and
cannot walk this part of it — it hands the render functions rows it builds
itself, which tests a renderer and not the wiring that fills it, and that is
exactly the gap the interview flow fell through in `623137d`.

Run bare it reads whatever is on the paying half and checks it holds together:
every placement points at a client that exists and has a billing rate, every
week sits on the assistant its placement names, every week starts on a Monday,
nobody is paid more than they are billed, and no payment settles a week
belonging to a different business. Run with `--go` it creates a client,
places somebody, works two weeks — a trial and a chargeable one — sends them,
approves them, takes a payment, and presses every refusal on the way past,
then removes all of it in a `finally` and says out loud whether the removal
worked rather than assuming it did.

`--go` is a flag rather than the default for two reasons. It writes to the
database that serves the site. And it is not quiet: moving a placement and
deciding a week both notify the assistant, so it sends about five real emails,
which is deliberate — a walk that silenced its own mail would not be walking
the half of this a person actually sees. So whose inbox that is must be typed
every time — `node tools/walk-paying.mjs --go --as=<address>` — and `--go`
without `--as=` refuses before it reads or writes anything; there is no default
address in the file any more. It borrows an assistant who is already hired
rather than inventing and then erasing a person, and refuses rather than
clearing anybody else's placement out of the way. Every row it makes is written
to `tools/.walk-made.json` the moment it exists — each week as soon as it is
inserted, before its days — so `--sweep` can always take back a run that was
killed part-way. Weeks of the assistant's own that 043 adopted onto the walk's
placement are put back unattached, never deleted.

## Notifications

An application, a seat request or a contact message sends one email to whoever
is listed in `NOTIFY_TO`, and the applicant or the business gets a receipt of
their own -- the seat request one says a person reads every request and links
the 20-minute call and `/seats` (F11). It hangs off the row landing rather than
the form submitting, so a lead the queue parked on somebody's device and drained
three days later still tells you when it finally arrives.

Everything else the database emails -- a stage decision, an interview booked or
moved, a timesheet waiting, a swap answered, a placement ended, a payment
receipt, the client's sign-in invite -- comes from a trigger, because the person
it is about has to be looked up and a function holding no credential cannot look
anybody up.

`api/notify.js` (and `api/invite.js` for the client invite) receives the post
and sends through Resend. It deliberately does NOT use the service role key: the
post carries the whole row, so there is nothing to go back and read, and the most
dangerous credential in the project stays out of a function reachable from the
internet.

### How an email leaves

Every sender goes the same way, and nothing posts on its own any more:

- **One secret, in one place** (`sql/094`). The shared secret lives in
  `private.webhook_secret`, a row in a schema nobody but the database owner can
  read, behind a function granted to nobody. It used to be pasted into every
  sender's body, so changing it meant finding every copy, and a copy you missed
  was one kind of email that quietly stopped (F52). To change it now:
  `update private.webhook_secret set value = '<new>', set_at = now();` in the
  SQL editor, and the same string as `WEBHOOK_SECRET` on Vercel -- either order;
  the outbox below tries again until both agree.
- **Every post through the outbox** (`sql/095`). `notify_send()` writes the
  payload to `public.notify_outbox` and posts it with the secret and an
  `x-idempotency-key` that stays the same on every try of that row. The pg_cron
  job `sjva-notify-outbox` runs every minute, reads the answer and decides:
  a 2xx is delivered, a 400/405/413/422 is given up on at once (the same
  payload will be refused every time), anything else is tried again after
  1, 2, 4 ... 128 minutes and then every 4 hours -- ten tries, about 8 hours,
  well inside Resend's 24-hour idempotency window. A row given up on sends the
  team one alert, and shows on /admin under *Emails that did not go* with a
  button that calls `retry_notify()` and sends it again under the same key, so
  it can never arrive twice.
- **The three forms too** (`sql/096`). `notify_form()` is the trigger on
  `applications`, `seat_requests` and `contact_messages`, AFTER INSERT, and it
  posts exactly the body a Supabase Database Webhook would
  (`{type:'INSERT', table, schema, record, old_record:null}`) -- through the
  outbox like everything else. It drops and recreates the three dashboard
  webhooks under their own trigger names (`notify-applications`,
  `notify-seat-requests`, `notify-contact-messages`), so there is nothing to set
  up in Supabase -> Database -> Webhooks any more. A webhook added there under
  another name would mail the same row twice, so do not add one.

The contract between the two halves is the status code, because the outbox acts
on it:

- **200** means done -- sent, or refused for good (a dead address), said in the
  body. Ten more tries would get ten more refusals.
- **503** (502 for the alert to the team, as it always was) means try again --
  Resend down or rate-limited, the network gone. The retry is safe: the same
  key makes Resend answer with the first send and send nothing new.

Anything `api/notify.js` does not recognise answers `200 skipped`, which the
outbox records as delivered -- so the endpoint's templates are deployed before
the SQL that starts posting them. `sql/README.md` and the "Paste + deploy order"
for each fix run say which comes first.

### Setting it up

Four environment variables on the Vercel project, Production:

```
RESEND_API_KEY      from resend.com -> API Keys
RESEND_FROM         support@securejobva.com
NOTIFY_TO           comma separated
WEBHOOK_SECRET      the same string as private.webhook_secret
```

Without `WEBHOOK_SECRET` the endpoint refuses everything rather than defaulting
to open. `api/invite.js` also needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

On the database side: paste `094`, `095` (it needs the pg_cron extension -- if
the paste says it cannot create it, enable pg_cron under Database -> Extensions
and paste again) and `096`, then `verify.sql`, whose section 5 says whether the
secret is filled, whether any function still holds its own copy and whether the
outbox job is running. Every file from `094` on is pasted exactly as committed --
no placeholder, no `.local.sql` copy.

The older senders -- `019`, `021`, `028`, `031`, `035`, `036`, `037`, `040`,
`058`, `093` -- carry a `__WEBHOOK_SECRET__` placeholder and their own
`net.http_post`. `096` (and `097`/`099` after it) replaced every one of them.
Pasting one again puts back a sender that bypasses the outbox; the ones from
`031` on open with a DO NOT RE-RUN note naming the file to paste straight after,
and for `019`, `021` and `028` that file is `096`. `.gitignore` and `.vercelignore` still keep `*.local.sql` out of the repo
and out of a CLI deploy, for anything left over from the old way.

`node tools/test-notify.mjs` drives the endpoint without Supabase, Resend or a
deploy -- the refusals as much as the sending, since the endpoint is public and
describes real applicants -- and `node tools/test-sql-senders.mjs` reads `sql/`
and fails if any sender posts around the outbox or carries its own secret.
`node tools/check.mjs` runs both.

### The mail DNS, both directions

Two services, and they are not the same one. **Zoho receives** at
`support@securejobva.com`; **Resend sends** as it. Both need records on this
domain, and the mail is only trustworthy when both are right -- an outbound
message with no DKIM of its own is one your own DMARC policy quarantines.

| Record | Host | Value | Whose |
| --- | --- | --- | --- |
| MX | `@` | `mx.zoho.com` 10, `mx2.zoho.com` 20, `mx3.zoho.com` 50 | Zoho, receiving |
| TXT | `@` | `v=spf1 include:zohomail.com include:amazonses.com ~all` | both senders |
| TXT | `@` | `zoho-verification=zb...zmverify.zoho.com` | Zoho, ownership |
| TXT | `zmail._domainkey` | the Zoho DKIM key | Zoho, signing |
| TXT | `resend._domainkey` | the Resend DKIM key | Resend, signing |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Resend, Return-Path |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` 10 | Resend, bounces |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:support@securejobva.com;` | the policy over both |

The `send` subdomain is the part that is easy to leave off and expensive to
leave off. DMARC asks whether the domain that signed the message and the domain
in the From line are the same, and alignment is relaxed here, so a bounce path
at `send.securejobva.com` counts as aligned with `securejobva.com`. Without it
Resend sends on its own domain, alignment fails, and `p=quarantine` sends your
own application confirmations to spam.

All eight were verified live on 1 September 2026 and are correct.

**And none of that proves a mailbox exists.** MX records route mail; they do not
create an inbox. A domain with perfect DNS and no mailbox behind it looks
identical from the outside to one that works, right up until a message bounces.
So the one check that matters cannot be done from here or from this repo: send a
real message from an outside provider to `support@securejobva.com` and open the
Zoho inbox to confirm it landed. If it bounces, the mailbox needs creating in
Zoho Mail -- the DNS above is already done and needs no changes.

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
  that cannot be checked from this repo — see **The mail DNS, both directions**
  under Notifications for why. Every fallback on both pages hands this address to
  the visitor, and
  DMARC reports go there too, so a dead box loses the leads the guards just saved.
- **A booking link** (optional). `CFG.scheduler` on `index.html` takes a Cal.com or
  Calendly URL and adds a "Pick your time" step after submit.

Settled, so they are not on the list any more: hardware minimums on `careers.html`
are concrete; pay stays at the offer stage by decision, not by oversight; the
first-90-days grid on `index.html` stays as it is rather than carrying quotes.

## Note

The two pages duplicate their shared CSS, because an artifact has to be self-contained.
If they drift, that is why — extract a `styles.css` at the point you stop publishing
them as artifacts.
