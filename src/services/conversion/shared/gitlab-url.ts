import {splitRelativeHref} from "./relative-href.js";

// Réécrit un href RELATIF en URL GitLab vers la source (http(s)/mailto/ancre/sans config → inchangé).
export function toGitlabFileUrl(
  href: string,
  sourceFile: string,
  gitlab?: { baseUrl?: string; branch?: string },
): string {
  if (/^https?:\/\/|^mailto:|^#/.test(href)) return href;

  const gitlabBase = (gitlab?.baseUrl ?? process.env.GITLAB_BASE_URL)?.replace(/\/$/, "");
  if (!gitlabBase) return href;

  const target = splitRelativeHref(href, sourceFile);
  if (!target) return href;

  // La branche est résolue par l'appelant via `getDefaultBranch()` (CI_DEFAULT_BRANCH + git).
  const branch = gitlab?.branch ?? "main";
  return `${gitlabBase}/-/blob/${branch}/${target.normalized}${target.fragment}`;
}
