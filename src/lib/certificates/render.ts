import { sanitizeCertificateBodyHtml } from "@/lib/sanitize/certificate";

/**
 * Resolves the {{merge_field}} placeholders inside a certificate template's
 * body_html. Unknown fields render as empty strings so an admin typo in
 * a template can't crash a learner's certificate page.
 */
export function renderCertificateHtml(
  bodyHtml: string,
  fields: {
    full_name: string;
    title: string;
    completion_date: string;
    certificate_number: string;
  },
): string {
  const sanitizedTemplate = sanitizeCertificateBodyHtml(bodyHtml);

  return sanitizedTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    switch (key) {
      case "full_name":
        return escapeHtml(fields.full_name);
      case "title":
        return escapeHtml(fields.title);
      case "completion_date":
        return escapeHtml(fields.completion_date);
      case "certificate_number":
        return escapeHtml(fields.certificate_number);
      default:
        return "";
    }
  });
}

/** Normalizes only known legacy copy on program-scope learner certificates. */
export function normalizeLearnerCertificateTemplate(
  bodyHtml: string,
  scope: "course" | "program",
): string {
  if (scope !== "program") return bodyHtml;
  return bodyHtml
    .replace(/Program Completion Certificate/g, "Course Completion Certificate")
    .replace(/has completed the program/g, "has completed the course")
    .replace(/completed the (\{\{title\}\}) program/g, "completed the $1 course");
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
