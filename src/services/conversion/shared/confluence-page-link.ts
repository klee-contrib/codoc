import {log} from "../../log/logger.js";
import {splitRelativeHref} from "./relative-href.js";

/** Résout un chemin repo-relatif posix (déjà normalisé, cf. splitRelativeHref) vers l'URL Confluence
 * de la page publiée pour ce fichier, si connue - undefined sinon (pas encore publié, autre env, …).
 * La couche conversion ne connaît jamais `lock-file.ts`/`envKey` : seul l'appelant (sync-actions.ts,
 * qui a déjà le lock sous la main) construit cette fonction, via `findLockedRef`. */
export type MdLinkResolver = (sourceFile: string) => string | undefined;

/**
 * Si `href` cible un `.md` local ET qu'un resolver est fourni : renvoie l'URL Confluence si trouvée
 * dans le lock, sinon undefined (cache miss - avertit, l'appelant se rabat sur le lien GitLab source).
 * Renvoie aussi undefined silencieusement si `href` ne cible pas un `.md` local, ou hors contexte
 * sync (pas de resolver configuré, ex. `codoc pull`/prévisualisation) - l'appelant se rabat alors sur
 * `toGitlabFileUrl` comme pour n'importe quel autre lien relatif.
 *
 * Le fragment `#ancre` éventuel de `href` est délibérément abandonné sur un hit : une ancre markdown
 * ne correspond pas au format d'ancrage Confluence, mieux vaut pointer en haut de la page cible que
 * produire une ancre cassée.
 */
export function resolveConfluencePageLink(
  href: string,
  sourceFile: string,
  resolveMdLink: MdLinkResolver | undefined,
): string | undefined {
  if (/^https?:\/\/|^mailto:|^#/.test(href)) return undefined;
  if (!resolveMdLink) return undefined;

  const target = splitRelativeHref(href, sourceFile);
  if (!target || !/\.md$/i.test(target.normalized)) return undefined;

  const url = resolveMdLink(target.normalized);
  if (!url) {
    log.warning2(
      `Lien vers "${target.normalized}" : page Confluence introuvable dans codoc.lock (pas encore publiée, ou autre environnement) - lien GitLab source utilisé à la place.`,
    );
    return undefined;
  }
  return url;
}
