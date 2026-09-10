import { escapeAttr } from "../../shared/xml-escaping.js";
import { structuredMacro } from "../../shared/confluence-macro-builder.js";

// Colgroups purement cosmétiques, et le Fabric editor rejette colgroup+rowspan+macro status (bug connu).
function stripColgroups(html: string): string {
  return html.replace(/<colgroup\b[^>]*>[\s\S]*?<\/colgroup>/gi, "");
}

/** Enveloppe le corps converti : bandeau « Généré le … » + sommaire (optionnel), puis le corps (colgroups retirés). */
export function buildConfluencePage(body: string, generatedAt: string, generateSummary = true): string {
  const info = structuredMacro("info", {
    richTextBody: `    <p><strong>Généré le :</strong> ${escapeAttr(generatedAt)}</p>`,
  });
  if (!generateSummary) return [info, "", stripColgroups(body)].join("\n");

  const toc = structuredMacro("toc", {
    params: [
      ["printable", "true"],
      ["style", "disc"],
      ["maxLevel", "3"],
      ["minLevel", "1"],
      ["type", "list"],
      ["outline", "false"],
    ],
  });
  return [info, "", toc, "", stripColgroups(body)].join("\n");
}
