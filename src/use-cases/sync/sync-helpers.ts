import {wikiLink} from '../../clients/confluence/utils/confluence-url.js'
import {ConfluenceConfig} from '../../types/codoc-types.js'

// parentPageId (yaml, string) → number pour les payloads Confluence.
// Ex. `"123"` → `123`
export const parentNum = (p?: string): number | undefined => (p ? Number(p) : undefined)

// `_links.webui` de l'API → URL absolue de la page Confluence.
// Ex. `{baseUrl: "https://x.atlassian.net"}, {_links: {webui: "/spaces/DEP/pages/123"}}` → `"https://x.atlassian.net/wiki/spaces/DEP/pages/123"`
export function urlOf(env: ConfluenceConfig, published: {_links?: {webui?: string}}): string | undefined {
  return published._links?.webui ? wikiLink(env.baseUrl, published._links.webui) : undefined
}
