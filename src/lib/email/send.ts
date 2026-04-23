/**
 * Minimal Resend wrapper. Uses the Resend HTTP API directly so we don't
 * need to add the resend package as a dependency. Gracefully no-ops
 * (returning { ok: false, skipped: true }) when RESEND_API_KEY isn't
 * configured so local development and pre-config deploys don't throw.
 */
export type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "replace_me") {
    return {
      ok: false,
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    };
  }

  const from = input.from ?? "Sandra University <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        skipped: false,
        error: `Resend ${res.status}: ${body.slice(0, 300)}`,
      };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
