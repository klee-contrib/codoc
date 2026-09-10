export function wikiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/wiki`
}

export function wikiLink(baseUrl: string, link: string): string {
  if (link.startsWith('http')) return link
  const base = baseUrl.replace(/\/$/, '')
  return link.startsWith('/wiki') ? `${base}${link}` : `${base}/wiki${link}`
}

export function pageUrl(baseUrl: string, spaceKey: string, pageId: string): string {
  return `${wikiBase(baseUrl)}/spaces/${spaceKey}/pages/${pageId}`
}

/**
 * Variantes d'un titre à essayer lors d'une recherche : Confluence peut stocker
 * une apostrophe droite (') ou typographique (’) selon la source.
 */
export function titleVariants(title: string): string[] {
  return [...new Set([title, title.replace(/'/g, '’'), title.replace(/’/g, "'")])]
}
