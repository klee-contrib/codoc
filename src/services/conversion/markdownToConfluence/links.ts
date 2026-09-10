import { escapeXml, escapeAttr } from "../shared/xml-escaping.js";
import { structuredMacro } from "../shared/confluence-macro-builder.js";
import { JIRA_KEY_RE } from "../shared/jira.js";
import { toGitlabFileUrl } from "../shared/gitlab-url.js";
import { conversionOptions } from "./conversion-state.js";

// Résout un href de lien Markdown (URLs GitLab), dérive aussi #Lxx depuis un title `"L42"`.
function resolveHref(href: string, title?: string | null): string {
  if (/^https?:\/\/|^mailto:|^#/.test(href)) return href;

  const sourceFile = conversionOptions().sourceFile;
  if (!sourceFile) return href;

  // Ajoute le fragment #Lxx dérivé du title si l'href n'en a pas déjà un.
  let withFragment = href;
  if (!href.includes("#") && title) {
    const lineMatch = title.match(/^L(\d+)$/);
    if (lineMatch) withFragment = `${href}#L${lineMatch[1]}`;
  }

  return toGitlabFileUrl(withFragment, sourceFile, conversionOptions().gitlab);
}

// Ticket Jira → macro jira (sans config serverId/server, repli sur un lien HTML simple).
export function buildJiraMacro(key: string, href: string): string {
  const jira = conversionOptions().jira;
  if (!jira?.serverId && !jira?.server) {
    return `<a href="${escapeAttr(href)}">${escapeXml(key)}</a>`;
  }
  const params: Array<[string, string]> = [["key", escapeXml(key)]];
  if (jira.serverId) params.push(["serverId", escapeXml(jira.serverId)]);
  if (jira.server) params.push(["server", escapeXml(jira.server)]);
  return structuredMacro("jira", { schemaVersion: true, params });
}

// `user:<accountId>` → mention Confluence Cloud (cf. `resolveStaticRoleMentions` /
// `resolveTicketRoleMentions`, qui génèrent ce lien pour matérialiser un membre référent -
// ex. `[@Jean Dupont](user:5b10ac8d82e05b22cc7d4ef5)`). Cloud identifie les comptes par un
// accountId opaque, pas par un username (retiré côté Atlassian pour des raisons RGPD).
const USER_MENTION_SCHEME = "user:";

// Lien Markdown → forme Storage Format adaptée : carte Jira, macro jira, mention utilisateur, ou ancre simple.
export function emitConfluenceLink(
  rawHref: string,
  detectText: string,
  labelHtml: string,
  title?: string | null,
): string {
  if (detectText.includes("Tableau Jira")) {
    return `<a href="${escapeAttr(resolveHref(rawHref, title))}" data-card-appearance="block"></a>`;
  }
  if (JIRA_KEY_RE.test(detectText.trim()) && /\/browse\//i.test(rawHref)) {
    return buildJiraMacro(detectText.trim(), rawHref);
  }
  if (rawHref.toLowerCase().startsWith(USER_MENTION_SCHEME)) {
    const accountId = rawHref.slice(USER_MENTION_SCHEME.length);
    return `<ac:link><ri:user ri:account-id="${escapeAttr(accountId)}" /></ac:link>`;
  }
  return `<a href="${escapeAttr(resolveHref(rawHref, title))}">${labelHtml}</a>`;
}
