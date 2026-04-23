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
  return bodyHtml.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
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

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
