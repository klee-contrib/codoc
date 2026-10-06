import path from "path";

export interface RelativeHrefTarget {
  /** Chemin POSIX normalisé, relatif à PROJECT_ROOT (même convention que PageState.sourceFile). */
  normalized: string;
  /** Fragment `#...` éventuel de href, vide sinon. */
  fragment: string;
}

// Résout un href RELATIF contre le dossier de sourceFile → chemin repo-relatif posix + fragment
// séparés. Partagé par toGitlabFileUrl (gitlab-url.ts) et resolveConfluencePageLink
// (confluence-page-link.ts) : les deux ont besoin de la MÊME normalisation pour que le résultat
// corresponde à ce que PageState.sourceFile contient réellement (cf. codoc.lock).
export function splitRelativeHref(href: string, sourceFile: string): RelativeHrefTarget | undefined {
  const hashIdx = href.indexOf("#");
  const fragment = hashIdx !== -1 ? href.slice(hashIdx) : "";
  const filePart = hashIdx !== -1 ? href.slice(0, hashIdx) : href;
  if (!filePart) return undefined;

  const sourceDir = path.dirname(sourceFile).replace(/\\/g, "/");
  const normalized = path.posix.normalize(path.posix.join(sourceDir, filePart));
  return {normalized, fragment};
}
