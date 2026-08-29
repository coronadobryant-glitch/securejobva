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
 */

/* Public values. They are in the source of every page this site serves, so
 * there is nothing to protect here — the env vars exist so a second project
 * does not need a code change, not because these are secret. */
const SB = process.env.SUPABASE_URL || "https://hmgravlkatfmerzbozct.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY || "sb_publishable_rDJAEC5owqmunkIgcRRktg_Y6xIBxdY";

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
  if (req.headers["x-webhook-secret"] !== expected) {
    return res.status(401).json({ error: "bad secret" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const email = String(body.email || "").trim();

  /* Not an error, and answered 200 so Postgres does not retry it forever. A
     client with no address on file is a normal state — the field is optional
     in /admin — and it means there is nobody to write to, not that something
     went wrong. */
  if (!email || email.indexOf("@") < 1) {
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
     transaction down with it. */
  if (!out.ok) {
    console.error("[invite] could not send to " + email, out.status, out.detail || "");
    return res.status(200).json({ sent: 0, why: out.status });
  }

  return res.status(200).json({ sent: 1, business: body.business || null });
}
