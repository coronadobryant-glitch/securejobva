/* Tells you when something arrives.

   Five applications and two seat requests reached the database before this
   existed, and nobody was told about any of them. The only way to find out was
   to open /admin and look, which means the thing that decides how fast you
   reply is whether somebody happened to check.

   Supabase fires a Database Webhook on insert; this receives it and sends one
   email. It hangs off the row landing rather than the form submitting, so a
   lead that was parked on somebody's device by the queue in index.html and
   drained three days later still tells you when it finally arrives.

   Note what it does NOT need: the service role key. A webhook carries the whole
   row in its payload, so there is nothing to go back and read, and the most
   dangerous credential in the project stays out of a function that is reachable
   from the internet. */

const RESEND = "https://api.resend.com/emails";

/* Which tables are worth an email, and how each one reads. Anything not listed
   is ignored rather than guessed at — a new table should be a decision here,
   not an automatic email nobody chose to receive. */
const KINDS = {
  applications: {
    subject: (r) => "New application — " + (list(r.tracks) || r.track || "no track given"),
    lines: (r) => [
      ["Name", r.name],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Country", r.country],
      ["Region", r.region],
      ["Tracks", list(r.tracks) || r.track],
      ["Experience", r.experience],
      ["Shifts", list(r.shifts)],
      ["Connection", r.speed],
      ["Equipment", list(r.kit)],
      ["CV", r.cv],
      ["Note", r.note]
    ],
    where: "/admin"
  },
  seat_requests: {
    subject: (r) => "New seat request — " + (r.company || r.name || "no company given"),
    lines: (r) => [
      ["Name", r.name],
      ["Company", r.company],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Seats", list(r.seats)],
      ["Hours a week", r.hours],
      ["Quoted", r.weekly ? "$" + r.weekly + " a week" : ""],
      ["Cover", list(r.blocks)],
      ["Time zone", r.timezone],
      ["Notes", r.notes]
    ],
    where: "/admin"
  },
  contact_messages: {
    subject: (r) => "Contact form — " + (r.reason || "no reason given"),
    lines: (r) => [
      ["Name", r.name],
      ["Email", r.email],
      ["Phone", r.phone],
      ["Reason", r.reason],
      ["Message", r.message]
    ],
    where: "/admin"
  }
};

function list(v) {
  return Array.isArray(v) ? v.filter(Boolean).join(", ") : (v || "");
}

function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Plain text alongside the HTML. A notification that arrives unreadable on a
   phone with images off is a notification that gets ignored. */
function render(kind, row, site) {
  const rows = kind.lines(row).filter(([, v]) => v !== null && v !== undefined && v !== "");

  const text = rows.map(([k, v]) => k + ": " + v).join("\n") +
    "\n\nOpen it: " + site + kind.where;

  const html =
    '<div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#26374F">' +
      '<table style="border-collapse:collapse">' +
        rows.map(([k, v]) =>
          '<tr>' +
            '<td style="padding:4px 16px 4px 0;color:#5C6E88;vertical-align:top;white-space:nowrap">' +
              esc(k) + "</td>" +
            '<td style="padding:4px 0;color:#001232">' + esc(v) + "</td>" +
          "</tr>").join("") +
      "</table>" +
      '<p style="margin:20px 0 0">' +
        '<a href="' + esc(site) + esc(kind.where) + '" ' +
        'style="background:#0072EE;color:#fff;text-decoration:none;padding:10px 18px;' +
        'border-radius:6px;display:inline-block">Open in the portal</a></p>' +
    "</div>";

  return { text, html };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  /* A webhook endpoint is a URL on the public internet, and this one describes
     real applicants. Supabase sends whatever headers you configure, so the
     shared secret goes in one and is compared here. Without WEBHOOK_SECRET set
     the endpoint refuses everything rather than defaulting to open. */
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    return res.status(500).json({ error: "WEBHOOK_SECRET is not set" });
  }
  if (req.headers["x-webhook-secret"] !== expected) {
    return res.status(401).json({ error: "bad secret" });
  }

  const key = process.env.RESEND_API_KEY;
  const to = (process.env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.RESEND_FROM || "support@securejobva.com";
  const site = process.env.SITE_URL || "https://www.securejobva.com";
  if (!key || !to.length) {
    return res.status(500).json({ error: "RESEND_API_KEY or NOTIFY_TO is not set" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const kind = KINDS[body.table];

  /* Not an error. A webhook on a table nobody asked to hear about should be
     ignored quietly, and answering 200 stops Supabase retrying it forever. */
  if (!kind || body.type !== "INSERT" || !body.record) {
    return res.status(200).json({ skipped: body.table || "unknown" });
  }

  const { text, html } = render(kind, body.record, site);

  const r = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SecureJobVA <" + from + ">",
      to,
      /* So hitting reply reaches the person, not the mailbox. */
      reply_to: body.record.email || undefined,
      subject: kind.subject(body.record),
      text,
      html
    })
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    /* Non-2xx tells Supabase to retry, which is what you want: a Resend outage
       should delay the email, not lose it. */
    return res.status(502).json({ error: "resend refused", detail: detail.slice(0, 300) });
  }

  return res.status(200).json({ sent: to.length, table: body.table });
}
