import { Token, Tokens } from "marked";

import { escapeXml, escapeAttr } from "../../shared/xml-escaping.js";
import { emitConfluenceLink } from "../links.js";
import { sanitizeRawHtml } from "../raw-html/raw-html.js";
import { log } from "../../../log/logger.js";

/** Décode les entités produites par marked puis ré-échappe pour le XML Confluence. */
export function fromMarked(text: string): string {
  const decoded = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  return escapeXml(decoded);
}

export function renderInline(tokens: readonly Token[] | undefined): string {
  return tokens ? tokens.map(renderInlineToken).join("") : "";
}

export function renderInlineToken(token: Token): string {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens?.length ? renderInline(t.tokens) : fromMarked(t.text);
    }
    case "escape":
      return fromMarked((token as Tokens.Escape).text);
    case "codespan":
      return `<code>${fromMarked((token as Tokens.Codespan).text)}</code>`;
    case "html":
      return sanitizeRawHtml((token as Tokens.HTML).text);
    case "br":
      return "<br/>";
    case "strong":
      return `<strong>${renderInline((token as Tokens.Strong).tokens)}</strong>`;
    case "em":
      return `<em>${renderInline((token as Tokens.Em).tokens)}</em>`;
    case "del":
      return `<del>${renderInline((token as Tokens.Del).tokens)}</del>`;
    case "link":
      return renderLink(token as Tokens.Link);
    case "image":
      return renderInlineImage(token as Tokens.Image);
    default:
      log.warning0(`Unsupported inline token: ${token.type}`);
      return "";
  }
}

function renderLink(token: Tokens.Link): string {
  const labelHtml = token.tokens ? renderInline(token.tokens) : fromMarked(token.text);
  return emitConfluenceLink(token.href, token.text, labelHtml, token.title);
}

export function renderInlineImage(token: Tokens.Image): string {
  const href = token.href;
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return `<ac:image><ri:url ri:value="${escapeAttr(href)}" /></ac:image>`;
  }
  const filename = escapeAttr(href.split("/").pop() ?? href);
  return `<ac:image><ri:attachment ri:filename="${filename}" /></ac:image>`;
}
