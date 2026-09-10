import { convertDrawioBlocksToImages, DrawioAttachmentFetcher } from "./diagrams/drawio-diagrams.js";
import { preprocessStorage } from "./preprocess/preprocess.js";
import { buildTurndown } from "./turndown.js";

export { preprocessStorage } from "./preprocess/preprocess.js";

function formatTableBlocks(md: string): string {
  return md.replace(/<table[\s\S]*?<\/table>/g, (table) =>
    table
      .replace(/(<table[^>]*>)\s*(<colgroup>|<thead>|<tbody>)/g, "$1\n$2")
      .replace(/<\/colgroup>\s*(<thead>|<tbody>)/g, "</colgroup>\n$1")
      .replace(/(<thead>|<tbody>)\s*<tr>/g, "$1\n<tr>")
      .replace(/<\/tr>\s*<tr>/g, "</tr>\n<tr>")
      .replace(/<\/tr>\s*(<\/thead>|<\/tbody>)/g, "</tr>\n$1")
      .replace(/<\/thead>\s*<tbody>/g, "</thead>\n<tbody>")
      .replace(/<\/(thead|tbody)>\s*<\/table>/g, "</$1>\n</table>"),
  );
}

export function confluenceStorageToMarkdown(
  storageXml: string,
  imgRelPath?: string,
  baseUrl?: string,
): string {
  const html = preprocessStorage(storageXml, imgRelPath, baseUrl); // Etape 1 : Storage Format → HTML (prétraitement des macros, etc.)
  return formatTableBlocks(buildTurndown().turndown(html).trim()); // Etape 2 : HTML → Markdown (Turndown + règles Confluence)
}

export interface MarkdownPageOptions {
  /** Télécharge le contenu texte d'une pièce jointe .drawio (I/O réseau injectée). */
  fetchAttachment: DrawioAttachmentFetcher;
  /** Dossier d'images (chemin absolu) où enregistrer les diagrammes draw.io rendus en PNG. Sans valeur : diagrammes non convertis (préservés tels quels). */
  imagesDir?: string;
  /** Chemin relatif vers le dossier d'images, vu depuis le .md. */
  imgRelPath?: string;
  /** Domaine Confluence (sert à reconstruire les liens Jira). */
  baseUrl?: string;
}

/** Sens pull : page Confluence (Storage Format + pièces jointes) → Markdown. */
export async function renderMarkdown(
  storageXml: string,
  options: MarkdownPageOptions,
): Promise<string> {
  const withImages = await convertDrawioBlocksToImages(
    storageXml,
    options.fetchAttachment,
    options.imagesDir,
    options.imgRelPath,
  );
  return confluenceStorageToMarkdown(withImages, options.imgRelPath, options.baseUrl);
}
