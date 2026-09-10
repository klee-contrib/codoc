import path from "path";

// Réécrit un href RELATIF en URL GitLab vers la source (http(s)/mailto/ancre/sans config → inchangé).
export function toGitlabFileUrl(
  href: string,
  sourceFile: string,
  gitlab?: { baseUrl?: string; branch?: string },
): string {
  if (/^https?:\/\/|^mailto:|^#/.test(href)) return href;

  const gitlabBase = (gitlab?.baseUrl ?? process.env.GITLAB_BASE_URL)?.replace(/\/$/, "");
  if (!gitlabBase) return href;

  const hashIdx = href.indexOf("#");
  const fragment = hashIdx !== -1 ? href.slice(hashIdx) : "";
  const filePart = hashIdx !== -1 ? href.slice(0, hashIdx) : href;
  if (!filePart) return href;

  const sourceDir = path.dirname(sourceFile).replace(/\\/g, "/");
  const normalized = path.posix.normalize(path.posix.join(sourceDir, filePart));
  // La branche est résolue par l'appelant via `getDefaultBranch()` (CI_DEFAULT_BRANCH + git).
  const branch = gitlab?.branch ?? "main";
  return `${gitlabBase}/-/blob/${branch}/${normalized}${fragment}`;
}
