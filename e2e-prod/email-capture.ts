import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

export type EmailCaptureConfig = {
  inbox: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  pollMs: number;
  timeoutMs: number;
};

export function emailCaptureConfigFromEnv(): EmailCaptureConfig | null {
  const inbox = process.env.PROD_READINESS_EMAIL_INBOX?.trim();
  const pass = process.env.PROD_READINESS_EMAIL_IMAP_PASS?.trim();
  if (!inbox || !pass) return null;

  const port = Number(process.env.PROD_READINESS_EMAIL_IMAP_PORT ?? "993");
  return {
    inbox,
    host: process.env.PROD_READINESS_EMAIL_IMAP_HOST?.trim() || "imap.gmail.com",
    port,
    secure: (process.env.PROD_READINESS_EMAIL_IMAP_SECURE ?? "true") !== "false",
    user: process.env.PROD_READINESS_EMAIL_IMAP_USER?.trim() || inbox,
    pass,
    mailbox: process.env.PROD_READINESS_EMAIL_MAILBOX?.trim() || "INBOX",
    pollMs: Number(process.env.PROD_READINESS_EMAIL_POLL_MS ?? "5000"),
    timeoutMs: Number(process.env.PROD_READINESS_EMAIL_TIMEOUT_MS ?? "90000"),
  };
}

export function buildTaggedEmailAddress(inbox: string, tag: string): string {
  const at = inbox.lastIndexOf("@");
  if (at < 1) throw new Error("PROD_READINESS_EMAIL_INBOX must be an email address.");
  const local = inbox.slice(0, at);
  const domain = inbox.slice(at + 1);
  const cleanTag = tag.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${local}+${cleanTag}@${domain}`;
}

export async function waitForEmailLink(input: {
  config: EmailCaptureConfig;
  sentAfter: Date;
  to: string;
  linkPattern: RegExp;
  subjectPattern?: RegExp;
}): Promise<string> {
  const deadline = Date.now() + input.config.timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const found = await findEmailLink(input);
      if (found) return found;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, input.config.pollMs));
  }

  const suffix =
    lastError instanceof Error ? ` Last mailbox error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for email link sent to ${input.to}.${suffix}`);
}

async function findEmailLink(input: {
  config: EmailCaptureConfig;
  sentAfter: Date;
  to: string;
  linkPattern: RegExp;
  subjectPattern?: RegExp;
}): Promise<string | null> {
  const client = new ImapFlow({
    host: input.config.host,
    port: input.config.port,
    secure: input.config.secure,
    auth: {
      user: input.config.user,
      pass: input.config.pass,
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(input.config.mailbox);
  try {
    const query = buildSearchQuery(input.to, input.sentAfter);
    const uids = await client.search(query, { uid: true });
    if (!uids || uids.length === 0) return null;

    for await (const message of client.fetch(uids.reverse(), {
      envelope: true,
      source: true,
    }, { uid: true })) {
      if (!message.source) continue;
      if (message.envelope?.date && message.envelope.date < input.sentAfter) {
        continue;
      }
      if (
        input.subjectPattern &&
        !input.subjectPattern.test(message.envelope?.subject ?? "")
      ) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const link = extractFirstLink(parsed.text ?? "", input.linkPattern)
        ?? extractFirstLink(parsed.html ? String(parsed.html) : "", input.linkPattern);
      if (link) return link;
    }
    return null;
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

function buildSearchQuery(to: string, sentAfter: Date) {
  const since = new Date(sentAfter);
  since.setDate(since.getDate() - 1);
  const or: SearchObject[] = [
    { to },
    { header: { "delivered-to": to } },
    { header: { "x-original-to": to } },
  ];
  return {
    since,
    or,
  };
}

export function extractFirstLink(source: string, pattern: RegExp): string | null {
  const decoded = decodeHtmlEntities(source);
  const urls = decoded.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  for (const raw of urls) {
    const cleaned = raw.replace(/[),.]+$/, "");
    if (pattern.test(cleaned)) return cleaned;
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#x3D;", "=");
}
