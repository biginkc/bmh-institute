export type NewSubmissionInput = {
  learnerName: string;
  learnerEmail: string;
  assignmentTitle: string;
  lessonTitle: string;
  submissionKind: "text" | "url" | "file";
  submissionPreview: string;
  submissionsUrl: string;
};

export function renderNewSubmissionEmail(input: NewSubmissionInput): {
  subject: string;
  html: string;
} {
  const subject = `New submission: ${input.assignmentTitle} from ${input.learnerName}`;

  const previewBlock = buildPreviewBlock(input);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="font-size:22px;margin:0 0 16px;">New submission ready for review</h1>
      <p>
        <strong>${escapeHtml(input.learnerName)}</strong>
        (${escapeHtml(input.learnerEmail)}) submitted
        <strong>${escapeHtml(input.assignmentTitle)}</strong>
        in the lesson <em>${escapeHtml(input.lessonTitle)}</em>.
      </p>
      ${previewBlock}
      <p style="margin-top:24px;">
        <a href="${escapeAttr(input.submissionsUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Review in admin
        </a>
      </p>
    </div>
  `.trim();

  return { subject, html };
}

function buildPreviewBlock(input: NewSubmissionInput): string {
  if (input.submissionKind === "text") {
    const trimmed = input.submissionPreview.slice(0, 600);
    return `
      <div style="border-left:3px solid #666;background:#f5f5f5;padding:12px 16px;margin:16px 0;white-space:pre-wrap;">
        ${escapeHtml(trimmed)}${input.submissionPreview.length > 600 ? "…" : ""}
      </div>
    `.trim();
  }
  if (input.submissionKind === "url") {
    return `
      <p style="margin:12px 0;">
        Link: <a href="${escapeAttr(input.submissionPreview)}" target="_blank" rel="noopener">${escapeHtml(input.submissionPreview)}</a>
      </p>
    `.trim();
  }
  // file
  return `
    <p style="margin:12px 0;color:#555;">
      File attached: <code>${escapeHtml(input.submissionPreview)}</code>. Open it from the admin reviewer queue to preview.
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
