import { escapeXml, escapeAttr } from "../../shared/xml-escaping.js";
import { JIRA_KEY_PATTERN } from "../../shared/jira.js";
import { macroParam, macroRegex } from "../../shared/read-storage-format.js";
import { preserveAsSentinel } from "../../shared/preserved-macros.js";

const JIRA_BROWSE_KEY_RE = new RegExp(`/browse/(${JIRA_KEY_PATTERN})`, "i");

// Couleurs de la macro `status` (lozenge « subtle » Atlassian : fond clair / texte foncé).
const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  grey:   { bg: "#DFE1E6", fg: "#42526E" },
  red:    { bg: "#FFEBE6", fg: "#BF2600" },
  yellow: { bg: "#FFF0B3", fg: "#172B4D" },
  green:  { bg: "#E3FCEF", fg: "#006644" },
  blue:   { bg: "#DEEBFF", fg: "#0747A6" },
  purple: { bg: "#EAE6FF", fg: "#403294" },
};

function statusStyle(colour: string): string {
  const c = STATUS_COLOURS[colour.trim().toLowerCase()] ?? STATUS_COLOURS.grey;
  return `background-color:${c.bg};color:${c.fg};padding:2px 6px;border-radius:3px;font-weight:bold`;
}

// Macro `status` → <span> surligné.
// Ex. `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Fait</ac:parameter></ac:structured-macro>` → `<span data-confluence-status="Grey" style="...">Fait</span>`
export function convertStatusMacros(html: string): string {
  return html.replace(
    /<ac:structured-macro[^>]*ac:name="status"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
    (_, inner: string) => {
      const title = macroParam(inner, "title") ?? "";
      const colour = macroParam(inner, "colou?r") ?? "Grey";
      return `<span data-confluence-status="${escapeAttr(colour)}" style="${statusStyle(colour)}">${escapeXml(title)}</span>`;
    },
  );
}

// draw.io → préservé verbatim. Filet de sécurité seulement : drawio-diagrams.ts convertit déjà les
// blocs draw.io en image PNG en amont (voir convertDrawioBlocksToImages) - n'arrive ici que si la
// conversion a échoué ou qu'aucun imagesDir n'est configuré.
// Ex. `<ac:structured-macro ac:name="drawio">...</ac:structured-macro>` → `<div data-confluence-macro-preserved="1">...</div>`
export function preserveDrawioMacros(html: string): string {
  html = html.replace(/<ac:adf-extension[\s\S]*?<\/ac:adf-extension>/g, (m) => preserveAsSentinel(m));
  html = html.replace(macroRegex("drawio"), (m) => preserveAsSentinel(m));
  return html;
}

// Éléments Jira (carte, lien inline, macro) → lien simple.
// Ex. `<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">DEP-123</ac:parameter></ac:structured-macro>` → `<a href=".../browse/DEP-123">DEP-123</a>`
export function convertJiraElements(html: string, jiraBase: string): string {
  html = html.replace(
    /<a\s[^>]*?href="([^"]+)"[^>]*?data-card-appearance="block"[^>]*?>[\s\S]*?<\/a>|<a\s[^>]*?data-card-appearance="block"[^>]*?href="([^"]+)"[^>]*?>[\s\S]*?<\/a>/g,
    (_, url1: string, url2: string) => `<a href="${url1 || url2}">Tableau Jira</a>`,
  );

  html = html.replace(
    /<a([^>]*)data-card-appearance="inline"([^>]*)>[\s\S]*?<\/a>/gi,
    (_, before: string, after: string) => {
      const url = (before + after).match(/href="([^"]+)"/)?.[1] ?? "";
      const key = url.match(JIRA_BROWSE_KEY_RE)?.[1];
      return `<a href="${url}">${key ?? url}</a>`;
    },
  );

  html = html.replace(
    /<ac:structured-macro[^>]*ac:name="jira"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
    (_, inner: string) => {
      const key = macroParam(inner, "key") ?? "";
      if (!key) return "";
      const url = jiraBase ? `${jiraBase}/browse/${key}` : `#${key}`;
      return `<a href="${url}">${key}</a>`;
    },
  );

  return html;
}

// Macro à corps riche → <blockquote data-macro-type>.
// Ex. `richMacroToBlockquote("info", "<ac:rich-text-body><p>Attention</p></ac:rich-text-body>")` → `<blockquote data-macro-type="info"><p>Attention</p></blockquote>`
export function richMacroToBlockquote(type: string, inner: string): string {
  const title = macroParam(inner, "title") ?? "";
  const body = inner.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/)?.[1] ?? "";
  const titleAttr = title ? ` data-macro-title="${title.replace(/"/g, "&quot;")}"` : "";
  return `<blockquote data-macro-type="${type}"${titleAttr}>${body}</blockquote>`;
}
