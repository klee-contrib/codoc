export interface ParsedInput {
  pageId: string;
  /** Domaine extrait de l'URL, undefined si entrée brute. */
  domain?: string;
  /** true si l'URL était de type /folder/ (dossier Confluence). */
  isFolder?: boolean;
}

// ID brut ou URL Confluence (page/dossier) → identifiant de page normalisé.
// Ex. `"https://confluence.example.com/folder/98765"` → `{pageId: "98765", domain: "confluence.example.com", isFolder: true}`
export function parsePageInput(rawInput: string): ParsedInput {
  rawInput = rawInput.trim();

  try {
    const url = new URL(rawInput);
    const match = url.pathname.match(/\/(pages|folder)\/(\d+)/);
    if (!match) throw new Error("Aucun ID de page trouvé dans l'URL.");
    // isFolder n'est posé que pour un dossier (champ optionnel → forme minimale sinon).
    return match[1] === "folder"
      ? { pageId: match[2], domain: url.hostname, isFolder: true }
      : { pageId: match[2], domain: url.hostname };
  } catch {
    // Pas une URL valide → on suppose un ID brut.
    if (/^\d+$/.test(rawInput)) return { pageId: rawInput };
    throw new Error(
      `Entrée invalide : "${rawInput}"\n` + `  Attendu : un ID numérique ou une URL Confluence complète.`,
    );
  }
}
