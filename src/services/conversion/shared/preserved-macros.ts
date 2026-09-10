import { escapeXml } from "./xml-escaping.js";

// Sentinelle portant un fragment XML sans équivalent Markdown à travers l'étape HTML intermédiaire.
// Pull : Turndown la réencode en base64 dans le .md final. Publish : consommée en mémoire, jamais encodée.
export const PRESERVED_MACRO_ATTR = "data-confluence-macro-preserved";

export function preserveAsSentinel(xml: string): string {
  return `<div ${PRESERVED_MACRO_ATTR}="1">${escapeXml(xml)}</div>`;
}
