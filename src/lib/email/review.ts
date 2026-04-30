export type ReviewEmailInput = {
  recipientEmail: string;
  recipientName: string;
  assignmentTitle: string;
  lessonTitle: string;
  lessonUrl: string;
  note?: string;
};

type Rendered = { subject: string; html: string };

export function renderApprovedEmail(input: ReviewEmailInput): Rendered {
  const note = (input.note ?? "").trim();
  const subject = `Your submission for "${input.assignmentTitle}" was approved`;
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 16px;">Approved</h1>
    <p>Hi ${escapeHtml(input.recipientName)},</p>
    <p>
      Your submission for <strong>${escapeHtml(input.assignmentTitle)}</strong>
      in the lesson <em>${escapeHtml(input.lessonTitle)}</em> was approved. The
      lesson is now marked complete in your dashboard.
    </p>
    ${
      note
        ? `<div style="border-left:3px solid #0a7a3a;background:#f0fbf4;padding:12px 16px;margin:16px 0;">
             <div style="font-size:12px;color:#0a7a3a;font-weight:600;margin-bottom:4px;">Reviewer note</div>
             <div>${escapeHtml(note)}</div>
           </div>`
        : ""
    }
    ${openButton(input.lessonUrl, "Open lesson")}
    ${footer(input.recipientEmail)}
  `);
  return { subject, html };
}

export function renderRevisionEmail(input: ReviewEmailInput): Rendered {
  const note = (input.note ?? "").trim();
  const subject = `"${input.assignmentTitle}" needs revision`;
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 16px;">Needs revision</h1>
    <p>Hi ${escapeHtml(input.recipientName)},</p>
    <p>
      Your submission for <strong>${escapeHtml(input.assignmentTitle)}</strong>
      in the lesson <em>${escapeHtml(input.lessonTitle)}</em> was reviewed. The
      admin has asked for changes before it can be approved.
    </p>
    ${
      note
        ? `<div style="border-left:3px solid #b35900;background:#fff7ed;padding:12px 16px;margin:16px 0;">
             <div style="font-size:12px;color:#b35900;font-weight:600;margin-bottom:4px;">What to fix</div>
             <div>${escapeHtml(note)}</div>
           </div>`
        : ""
    }
    ${openButton(input.lessonUrl, "Open lesson to resubmit")}
    ${footer(input.recipientEmail)}
  `);
  return { subject, html };
}

function wrap(inner: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      ${inner.trim()}
    </div>
  `.trim();
}

function openButton(url: string, label: string): string {
  return `
    <p style="margin-top:24px;">
      <a href="${escapeAttr(url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </p>
  `.trim();
}

function footer(email: string): string {
  return `
    <p style="color:#666;font-size:12px;margin-top:32px;">
      This email was sent to ${escapeHtml(email)} from BMH Institute.
    </p>
  `.trim();
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(v: string): string {
  return escapeHtml(v);
}
