/* api/invite — the email that gives a client a way in.
 *
 * A client contact never applies for anything. They are written down in
 * /admin, their address becomes the key that unlocks their whole portal, and
 * until this endpoint existed nothing was ever sent to it. /seats grew an
 * email-and-password form so they *could* get in; this is what tells them.
 *
 * WHY THE ANON KEY AND NOT THE SERVICE ROLE
 *
 * Supabase has an admin invite endpoint that creates the user and mails them
 * a link. It needs the service-role key — the one credential that ignores
 * every policy in this database. Putting that in a web-facing function to
 * save a client one form is a bad trade in a codebase whose entire argument
 * is that the database decides who sees what.
 *
 * /auth/v1/otp with create_user does the same job with the publishable key
 * that already ships inside every page here. Worst case if this endpoint is
 * ever abused: somebody causes sign-in links to be mailed to addresses. That
 * is a nuisance. The other key's worst case is the whole database.
 *
 * The link signs them straight in. captureRedirect() in the portal already
 * handles the landing — it stores the session and carries on, because the
 * type is `magiclink` rather than `recovery`, so no password form appears.
 * They can set a password afterwards from the portal if they want one; a
 * client who never bothers just clicks a fresh link, which is a reasonable
 * way to live for somebody who signs in once a week to approve hours.
 *
 * WHAT THE EMAIL SAYS IS NOT WRITTEN HERE (F17)
 *
 * The auth server writes and sends it, from the project's email templates,
 * so it reads as a generic "click here to sign in" that names no assistant
 * and no start date. Sending our own instead means minting the link
 * ourselves, and the only endpoint that hands a link back rather than
 * mailing it (admin generate_link) needs the service-role key — the trade
 * refused above, and refused by tools/check.mjs for every file in api/. So
 * the wording is changed where it lives: Supabase dashboard -> Authentication
 * -> Email Templates, "Magic Link" and "Confirm signup" (an address the
 * auth server has never seen can get the second, depending on the
 * project's confirm-email setting). Both receive {{ .RedirectTo }}, which is this
 * file's /seats for a client and something else for everybody else, so one
 * template can say the client's version only to clients.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/* Public values. They are in the source of every page this site serves, so
 * there is nothing to protect here — the env vars exist so a second project
 * does not need a code change, not because these are secret. */
const SB = process.env.SUPABASE_URL || "https://hmgravlkatfmerzbozct.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY || "sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY";

/* The same address rule the rest of the schema holds people to (073, 092):
   something, an @, something, a dot, two or more. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* The shared secret, compared in constant time — see api/notify.js, which
   does the same for the same reason. Hashing both sides first gives
   timingSafeEqual two buffers of one length, so a wrong guess's length is not
   given away either. */
function sameSecret(given, expected) {
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  /* Same shared secret as /api/notify, and the same refusal to default open.
     Without it this is a URL on the public internet that mails anybody. */
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    return res.status(500).json({ error: "WEBHOOK_SECRET is not set" });
  }
  if (!sameSecret(req.headers["x-webhook-secret"], expected)) {
    return res.status(401).json({ error: "bad secret" });
  }

  /* A body that is not JSON is the caller's mistake, and says so with a 400
     rather than crashing the function into a stack trace and a 500. */
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: "bad json" });
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "bad json" });
  }
  const email = String(body.email || "").trim();

  /* Not an error, and answered 200 so the outbox (sql/095) records it as
     done rather than asking again. A client with no address on file, or one
     that is not an address, is a normal state — the field is optional in
     /admin — and it means there is nobody to write to, not that something
     went wrong. Asking ten more times would not give them one. */
  if (!EMAIL.test(email)) {
    return res.status(200).json({ skipped: "no address on the client" });
  }

  const site = process.env.SITE_URL || "https://www.securejobva.com";

  /* redirect_to is a query parameter on this endpoint, not a body field.
     Sent as one and it is silently ignored, which would land them on the
     Supabase default instead of their own portal — working, and wrong. */
  const url = SB + "/auth/v1/otp?redirect_to=" + encodeURIComponent(site + "/seats");

  let out;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: "Bearer " + ANON,
        "Content-Type": "application/json"
      },
      /* create_user is the whole point: the account does not exist yet, and
         asking a plumber to go and make one is how this was broken before. */
      body: JSON.stringify({ email: email, create_user: true })
    });
    out = { ok: r.ok, status: r.status };
    if (!r.ok) out.detail = (await r.text()).slice(0, 300);
  } catch (e) {
    out = { ok: false, status: 0, detail: String(e && e.message ? e.message : e).slice(0, 300) };
  }

  /* Logged rather than thrown. A placement that saved and an email that did
     not is a person to chase; a placement rolled back because an email failed
     is worse, and the trigger already refuses to let this call take the
     transaction down with it.

     And the status code is now a request (sql/095, 096): every caller posts
     through public.notify_send(), whose outbox tries again on anything but a
     2xx or a plain refusal. So a failure that might pass — the auth server
     down (5xx), its email rate limit (429), the network gone (0) — answers
     502 and the invite goes again a minute later, then at growing gaps for
     about eight hours. A refusal about this address (any other 4xx) answers
     200: it will be refused the same way every time, and the place to fix it
     is the address in /admin, which sends the invite again when it changes
     (sql/104), or its "Send the invite again" button.

     The log names the business, not the address. Vercel keeps function logs
     where anybody with the project can read them, and the business is enough
     to find the client in /admin and send the invite again by hand. The auth
     server's own refusal can quote the address back, so it is scrubbed too. */
  if (!out.ok) {
    console.error("[invite] could not send the invite for " + String(body.business || "a client"),
      out.status, String(out.detail || "").replace(/[^\s@"'<>,;:]+@[^\s@"'<>,;:]+/g, "<address>"));
    const again = out.status === 0 || out.status === 429 || out.status >= 500;
    return res.status(again ? 502 : 200).json({ sent: 0, why: out.status, retry: again });
  }

  return res.status(200).json({ sent: 1, business: body.business || null });
}
