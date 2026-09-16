export interface ParsedPageUrl {
  pageId: string;
  domain: string;
  /** true si l'URL était de type /folder/ (dossier Confluence). */
  isFolder?: boolean;
  /** Clé d'espace, si présente dans l'URL (`/spaces/<clé>/...` - format Confluence Cloud standard). */
  spaceKey?: string;
}

// URL Confluence (page/dossier) → identifiant de page normalisé. Le domaine sert à déduire
// l'environnement cible (voir matchEnvByDomain) - un ID brut n'y suffit plus, il est donc rejeté.
// Ex. `"https://confluence.example.com/folder/98765"` → `{pageId: "98765", domain: "confluence.example.com", isFolder: true}`
export function parsePageUrl(rawInput: string): ParsedPageUrl {
  rawInput = rawInput.trim();

  let url: URL;
  try {
    url = new URL(rawInput);
  } catch {
    throw new Error(`Entrée invalide : "${rawInput}"\n  Attendu : une URL Confluence complète.`);
  }

  const withSpace = url.pathname.match(/\/spaces\/([^/]+)\/(pages|folder)\/(\d+)/);
  if (withSpace) {
    const [, spaceKey, kind, pageId] = withSpace;
    return kind === "folder"
      ? { pageId, domain: url.hostname, isFolder: true, spaceKey }
      : { pageId, domain: url.hostname, spaceKey };
  }

  const match = url.pathname.match(/\/(pages|folder)\/(\d+)/);
  if (!match) throw new Error("Aucun ID de page trouvé dans l'URL.");

  return match[1] === "folder"
    ? { pageId: match[2], domain: url.hostname, isFolder: true }
    : { pageId: match[2], domain: url.hostname };
}
