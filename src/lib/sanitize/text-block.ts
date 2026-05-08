import sanitizeHtml from "sanitize-html";

export const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "code",
    "pre",
    "a",
  ],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: "a",
      attribs: {
        href: attribs.href ?? "",
        rel: "noopener noreferrer",
        target: attribs.target === "_blank" ? "_blank" : "_self",
      },
    }),
  },
  disallowedTagsMode: "discard",
};

export function sanitizeTextBlockHtml(html: string): string {
  return sanitizeHtml(html, STRICT_OPTIONS);
}
