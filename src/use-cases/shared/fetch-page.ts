import {ConfluencePage} from '../../clients/confluence/clients/pages-client.js'
import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'

/** Récupère une page sur un environnement, ou undefined si absente/inaccessible. */
export async function fetchPageOrUndefined(client: ConfluenceClient, pageId: string): Promise<ConfluencePage | undefined> {
  try {
    return await client.pages.fetchPage(pageId)
  } catch {
    return undefined
  }
}
