import {createHash} from "node:crypto";

import {unescapeXml} from "./xml-escaping.js";

// Extraction + assainissement des noms de fichiers d'images/pièces jointes en Storage Format.
// Source unique partagée par preprocess.ts (lien markdown) et render-remote-page.ts (téléchargement) - même nom des deux côtés, sinon lien mort.

// `ri:filename` est XML-échappé (`&amp;`) ; sans décodage, la recherche de la pièce jointe (titre réel, décodé) échoue à tort.
// Ex. `decodeAttachmentFilename("a&amp;b.png")` → `"a&b.png"`
export function decodeAttachmentFilename(rawFilename: string): string {
  return unescapeXml(rawFilename);
}

// Deux conteneurs Confluence embarquent un `<ri:attachment>` inline : `<ac:image>` (images/vidéos)
// et la macro `view-file` (prévisualisation PDF/Office). Extraction par contexte, pas par extension.
export const EMBEDDED_ATTACHMENT_PATTERNS: readonly RegExp[] = [
  /<ac:image[^>]*>[\s\S]*?<ri:attachment[^>]*ri:filename="([^"]+)"[^>]*\/>[\s\S]*?<\/ac:image>/g,
  /<ac:structured-macro[^>]*ac:name="view-file"[^>]*>[\s\S]*?<ri:attachment[^>]*ri:filename="([^"]+)"[^>]*\/>[\s\S]*?<\/ac:structured-macro>/g,
];

// XML Storage Format → noms d'attachments embarqués (dédupliqués, décodés).
export function embeddedAttachmentFilenames(storageXml: string): string[] {
  const raw = EMBEDDED_ATTACHMENT_PATTERNS.flatMap((pattern) => [...storageXml.matchAll(pattern)].map((m) => m[1]));
  return [...new Set(raw.map(decodeAttachmentFilename))];
}

const CONTROL_CHARS = Array.from({length: 32}, (_, i) => String.fromCharCode(i)).join("");
const ILLEGAL_FILENAME_CHARS = new RegExp(`[<>:"/\\\\|?*${CONTROL_CHARS}]`, "g");
const MAX_FILENAME_LENGTH = 120;

// Nom utilisable localement (Windows + POSIX) : neutralise les caractères interdits, puis
// raccourcit avec un suffixe de hash stable pour éviter les collisions après troncature
// (certains noms "media card" sont en réalité une URL CDN tronquée à 255 car. côté Confluence).
// Ex. `sanitizeAttachmentFilename("cdn?allowAnimated=true&name=foo.png")` → `"cdn_allowAnimated=true&name=foo.png"`
export function sanitizeAttachmentFilename(filename: string): string {
  const safe = filename.replace(ILLEGAL_FILENAME_CHARS, "_");
  if (safe.length <= MAX_FILENAME_LENGTH) return safe;
  const hash = createHash("sha1").update(filename).digest("hex").slice(0, 8);
  return `${safe.slice(0, MAX_FILENAME_LENGTH)}-${hash}`;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi", "mkv", "m4v"]);

export type AttachmentKind = "image" | "video" | "other";

function extensionOf(filename: string): string | undefined {
  return /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
}

// Classe par extension du nom réel : `image` → `<img>`, `video` → `<video>`, `other` (pdf, docx…
// ou nom sans extension reconnaissable, ex. media card CDN tronquée) → lien simple.
// Ex. `classifyAttachment("demo.mp4")` → `"video"`
export function classifyAttachment(filename: string): AttachmentKind {
  const ext = extensionOf(filename);
  if (ext && IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext && VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}

// `ri:filename` brut → balise HTML (`<img>`/`<video>`/`<a>`). Source unique partagée entre
// `<ac:image>` et la macro `view-file` (preprocess.ts) - seul le conteneur XML diffère.
export function renderAttachmentTag(rawFilename: string, imgRelPath: string | undefined): string {
  // Décodage PUIS assainissement, dans cet ordre et avec les mêmes règles que le téléchargement
  // (render-remote-page.ts) - sinon le nom diffère et le lien pointe vers un fichier différent.
  const filename = decodeAttachmentFilename(rawFilename);
  const localFilename = sanitizeAttachmentFilename(filename);
  const href = imgRelPath ? `${imgRelPath}/${localFilename}` : localFilename;
  const kind = classifyAttachment(filename);
  if (kind === "video") return `<video src="${href}" controls>${filename}</video>`;
  if (kind === "other") return `<a href="${href}">${filename}</a>`;
  return `<img src="${href}" alt="${filename}">`;
}
