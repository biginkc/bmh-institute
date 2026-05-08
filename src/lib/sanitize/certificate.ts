import sanitizeHtml from "sanitize-html";

export const CERTIFICATE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "code",
    "pre",
    "a",
    "div",
    "span",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt", "width", "height"],
    div: ["style"],
    span: ["style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["https"] },
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      "font-size": [/^[\d.]+(px|em|rem|%|pt)$/],
      color: [
        /^#[0-9a-f]{3,8}$/i,
        /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/,
        /^[a-z]+$/i,
      ],
      margin: [/^([\d.]+(px|em|rem|%)?(\s+|$)){1,4}$/],
      "margin-top": [/^[\d.]+(px|em|rem|%)?$/],
      "margin-bottom": [/^[\d.]+(px|em|rem|%)?$/],
      padding: [/^([\d.]+(px|em|rem|%)?(\s+|$)){1,4}$/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-family": [/^[\w\s,'"-]+$/],
      "font-weight": [/^(\d{3}|normal|bold|bolder|lighter)$/],
    },
  },
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

export function sanitizeCertificateBodyHtml(html: string): string {
  return sanitizeHtml(html, CERTIFICATE_OPTIONS);
}
