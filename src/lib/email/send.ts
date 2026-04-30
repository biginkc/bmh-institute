import nodemailer from "nodemailer";

/**
 * Transactional email via SMTP. Production uses Google Workspace SMTP
 * (smtp.gmail.com) with an app password on `jarrad@bmhgroupkc.com`.
 * Gracefully no-ops when SMTP_* envs are absent or still `replace_me` so
 * local dev and pre-config deploys don't throw.
 *
 * Swapping transports (SendGrid, AWS SES, etc.) only touches the
 * transporter construction below — the `sendEmail` contract stays stable.
 */
export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? "465");

  if (
    !host ||
    !user ||
    !pass ||
    host === "replace_me" ||
    user === "replace_me" ||
    pass === "replace_me"
  ) {
    return {
      ok: false,
      skipped: true,
      reason: "SMTP_HOST / SMTP_USER / SMTP_PASS not configured",
    };
  }

  const fromEmail = input.fromEmail ?? process.env.SMTP_FROM_EMAIL ?? user;
  const fromName =
    input.fromName ?? process.env.SMTP_FROM_NAME ?? "BMH Institute";

  const transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 is STARTTLS upgrade.
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo ?? fromEmail,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
