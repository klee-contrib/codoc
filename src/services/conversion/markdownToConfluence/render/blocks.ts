import { marked, Token, Tokens } from "marked";

import { escapeXml, escapeCdata } from "../../shared/xml-escaping.js";
import { structuredMacro } from "../../shared/confluence-macro-builder.js";
import { RICH_BODY_MACRO_TYPES_PATTERN } from "../../shared/macro-types.js";
import { nextTaskId } from "../conversion-state.js";
import { confluenceLanguage } from "../languages.js";
import { emitConfluenceLink } from "../links.js";
import { emitTask } from "../raw-html/task-lists.js";
import { fromMarked, renderInline, renderInlineToken, renderInlineImage } from "./inline.js";
import { sanitizeRawHtml } from "../raw-html/raw-html.js";
import { log } from "../../../log/logger.js";

const BLOCKQUOTE_MACRO_TYPE_RE = new RegExp(
  `^\\[(${RICH_BODY_MACRO_TYPES_PATTERN})(?: ([^\\n\\]]+))?\\]\\s*\\n?([\\s\\S]*)$`,
);

export function renderTokens(tokens: readonly Token[]): string {
  return tokens.map(renderBlock).filter(Boolean).join("\n");
}

function renderBlock(token: Token): string {
  switch (token.type) {
    case "space":
      return "";
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens?.length ? `<p>${renderInline(t.tokens)}</p>` : `<p>${fromMarked(t.text)}</p>`;
    }
    case "heading":
      return renderHeading(token as Tokens.Heading);
    case "paragraph":
      return renderParagraph(token as Tokens.Paragraph);
    case "list":
      return renderList(token as Tokens.List);
    case "code":
      return renderCode(token as Tokens.Code);
    case "blockquote":
      return renderBlockquote(token as Tokens.Blockquote);
    case "table":
      return renderTable(token as Tokens.Table);
    case "hr":
      return "<hr/>";
    case "html":
      return sanitizeRawHtml((token as Tokens.HTML).text);
    default:
      log.warning0(`Unsupported block token: ${token.type}`);
      return "";
  }
}

function renderHeading(token: Tokens.Heading): string {
  return `<h${token.depth}>${renderInline(token.tokens).trim()}</h${token.depth}>`;
}

function renderParagraph(token: Tokens.Paragraph): string {
  if (token.tokens.length === 1 && token.tokens[0].type === "image") {
    return renderInlineToken(token.tokens[0]);
  }
  const content = renderInline(token.tokens).trim();
  return content ? `<p>${content}</p>` : "";
}

function renderCode(token: Tokens.Code): string {
  return structuredMacro("code", {
    params: [
      ["language", confluenceLanguage(token.lang)],
      ["linenumbers", "true"],
    ],
    plainTextBody: escapeCdata(token.text),
  });
}

interface BlockquoteMacroHeader {
  macroName: string;
  title: string;
  restOfFirstPara: string;
}

/** Parse `[info]` / `[note]` / `[warning]` / `[tip]` / `[expand Titre]` en tête de blockquote. */
function parseBlockquoteMacroHeader(paraText: string): BlockquoteMacroHeader | undefined {
  const typeMatch = paraText.trim().match(BLOCKQUOTE_MACRO_TYPE_RE);
  if (!typeMatch) return undefined;
  return {
    macroName: typeMatch[1],
    title: typeMatch[2]?.trim() ?? "",
    restOfFirstPara: typeMatch[3]?.trim() ?? "",
  };
}

// [info]/[note]/[warning]/[tip]/[expand] → macro typée ; sans marqueur, toujours `info`.
function renderBlockquote(token: Tokens.Blockquote): string {
  const first = token.tokens[0];
  const header = first?.type === "paragraph" ? parseBlockquoteMacroHeader((first as Tokens.Paragraph).text ?? "") : undefined;
  if (!header) return structuredMacro("info", { richTextBody: renderTokens(token.tokens) });

  const {macroName, title, restOfFirstPara} = header;
  const bodyTokens: readonly Token[] = restOfFirstPara
    ? [...marked.lexer(restOfFirstPara, { gfm: true }), ...token.tokens.slice(1)]
    : token.tokens.slice(1);
  return structuredMacro(macroName, {
    params: title ? [["title", escapeXml(title)]] : [],
    richTextBody: renderTokens(bodyTokens),
  });
}

// Liste de tâches → <ac:task-list> (sous-listes émises en FRÈRES du <ac:task>, pas en enfants).
function renderList(token: Tokens.List): string {
  if (token.items.some((item) => item.task)) {
    const output: string[] = [];
    for (const item of token.items) {
      const status = item.checked ? "complete" : "incomplete";
      const taskId = nextTaskId();
      const bodyTokens: Token[] = [];
      const subTaskLists: Tokens.List[] = [];
      for (const t of item.tokens) {
        if (t.type === "list" && (t as Tokens.List).items.some((i) => i.task)) {
          subTaskLists.push(t as Tokens.List);
        } else {
          bodyTokens.push(t);
        }
      }
      output.push(emitTask(taskId, status, renderListItemInner(bodyTokens).trim()));
      for (const sub of subTaskLists) output.push(renderList(sub));
    }
    return `<ac:task-list>\n${output.join("\n")}\n</ac:task-list>`;
  }

  const tag = token.ordered ? "ol" : "ul";
  const start = token.ordered && token.start && token.start !== 1 ? ` start="${token.start}"` : "";
  const items = token.items.map(renderListItem).join("\n");
  return `<${tag}${start}>\n${items}\n</${tag}>`;
}

function renderListItem(item: Tokens.ListItem): string {
  const inner = renderListItemInner(item.tokens);
  const body = item.task ? `${item.checked ? "☑" : "☐"} ${inner}` : inner;
  return `<li>${body}</li>`;
}

function renderListItemInner(tokens: readonly Token[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case "paragraph":
          return renderInline((t as Tokens.Paragraph).tokens);
        case "text": {
          const tt = t as Tokens.Text;
          return tt.tokens?.length ? renderInline(tt.tokens) : renderInlineText(tt.text);
        }
        case "list":
          return renderList(t as Tokens.List);
        case "strong":
        case "em":
        case "codespan":
        case "link":
        case "image":
          return renderInlineToken(t);
        default:
          return renderBlock(t);
      }
    })
    .join("");
}

// Texte brut d'un <li> : liens/images re-parsés à la main (reste échappé caractère par caractère).
function renderInlineText(text: string): string {
  let i = 0;
  const parts: string[] = [];
  while (i < text.length) {
    // ![alt](url)
    if (text[i] === "!" && text[i + 1] === "[") {
      const endAlt = text.indexOf("]", i + 2);
      const startUrl = endAlt !== -1 ? text.indexOf("(", endAlt) : -1;
      const endUrl = startUrl !== -1 ? text.indexOf(")", startUrl) : -1;
      if (endAlt !== -1 && startUrl === endAlt + 1 && endUrl !== -1) {
        const alt = text.slice(i + 2, endAlt);
        const url = text.slice(startUrl + 1, endUrl);
        parts.push(renderInlineImage({ type: "image", href: url, text: alt } as Tokens.Image));
        i = endUrl + 1;
        continue;
      }
    }
    // [label](url)
    if (text[i] === "[") {
      const endLabel = text.indexOf("]", i + 1);
      const startUrl = endLabel !== -1 ? text.indexOf("(", endLabel) : -1;
      const endUrl = startUrl !== -1 ? text.indexOf(")", startUrl) : -1;
      if (endLabel !== -1 && startUrl === endLabel + 1 && endUrl !== -1) {
        const label = text.slice(i + 1, endLabel);
        const rawUrl = text.slice(startUrl + 1, endUrl);
        parts.push(emitConfluenceLink(rawUrl, label, escapeXml(label)));
        i = endUrl + 1;
        continue;
      }
    }
    parts.push(escapeXml(text[i]));
    i++;
  }
  return parts.join("");
}

function alignStyle(align: "left" | "right" | "center" | null): string {
  return align ? ` style="text-align: ${align};"` : "";
}

function renderTable(token: Tokens.Table): string {
  const parts: string[] = ["<table>\n<thead><tr>\n"];
  for (let i = 0; i < token.header.length; i++) {
    const align = alignStyle((token.align?.[i]) as any ?? null);
    parts.push(`<th${align}>${renderInline(token.header[i].tokens)}</th>\n`);
  }
  parts.push("</tr></thead>\n<tbody>\n");
  for (const row of token.rows) {
    parts.push("<tr>\n");
    for (let i = 0; i < row.length; i++) {
      const align = alignStyle((token.align?.[i]) as any ?? null);
      parts.push(`<td${align}>${renderInline(row[i].tokens)}</td>\n`);
    }
    parts.push("</tr>\n");
  }
  parts.push("</tbody>\n</table>");
  return parts.join("");
}
