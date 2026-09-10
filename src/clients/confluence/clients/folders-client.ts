import {ConfluenceHttp} from '../confluence-client.js'
import {titleVariants} from '../utils/confluence-url.js'

/** Extrait le curseur de pagination de `_links.next` (API v2, pagination par curseur). */
function extractCursor(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined
  const query = nextLink.split('?')[1]
  if (!query) return undefined
  return new URLSearchParams(query).get('cursor') ?? undefined
}

/** Échappe une valeur pour l'insérer dans une clause CQL entre guillemets doubles. */
function escapeCql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export class ConfluenceFoldersClient {
  constructor(private readonly http: ConfluenceHttp) {}

  async findByTitleUnderParent(parentId: string, title: string): Promise<{id: string; title: string} | undefined> {
    for (const variant of titleVariants(title)) {
      const cql = `type = folder and parent = ${parentId} and title = "${escapeCql(variant)}"`
      const data = await this.http.v1.get('search', {searchParams: {cql, limit: 2}}).json<any>()
      const results = data.results ?? []
      if (results.length === 1) {
        return {id: String(results[0].content.id), title: results[0].content.title}
      }
    }
    return undefined
  }

  // Dossiers (v2) enfants directs d'un id quelconque, page (v1) ou dossier - par CQL, seule façon de lister
  // des dossiers sous une page : l'API v2 dédiée (`direct-children`) exige que le parent soit lui-même un
  // dossier. Complète `pages.fetchChildren` (v1, restreint aux pages) pour couvrir le cas page → sous-dossier.
  async childrenFolders(parentId: string): Promise<Array<{id: string; title: string}>> {
    const results: Array<{id: string; title: string}> = []
    const cql = `type = folder and parent = ${parentId}`
    const limit = 100
    let start = 0

    for (let page = 0; page < 1000; page++) {
      const data = await this.http.v1.get('search', {searchParams: {cql, start, limit}}).json<any>()
      const batch = data.results ?? []
      results.push(...batch.map((r: any) => ({id: String(r.content.id), title: r.content.title})))
      if (batch.length < limit) break
      start += limit
    }

    return results
  }

  async exists(id: string): Promise<boolean> {
    try {
      await this.http.v2.get(`folders/${id}`)
      return true
    } catch {}

    return false
  }

  async get(folderId: string): Promise<
    | {
        id: string
        title: string
        parentId?: string
      }
    | undefined
  > {
    try {
      const data = await this.http.v2.get(`folders/${folderId}`).json<any>()

      return {
        id: String(data.id),
        title: data.title,
        parentId: data.parentId ? String(data.parentId) : undefined,
      }
    } catch {
      return undefined
    }
  }

  /** Suit la pagination par curseur de l'API v2 - sinon les dossiers de plus de 250 enfants étaient tronqués silencieusement. */
  async children(folderId: string): Promise<Array<{id: string; title: string; type: string}>> {
    const results: Array<{id: string; title: string; type: string}> = []
    let cursor: string | undefined

    for (let page = 0; page < 1000; page++) {
      const data = await this.http.v2
        .get(`folders/${folderId}/direct-children`, {
          searchParams: cursor ? {limit: 250, cursor} : {limit: 250},
        })
        .json<any>()

      results.push(
        ...(data.results ?? []).map((child: any) => ({
          id: String(child.id),
          title: child.title,
          type: child.type,
        })),
      )

      cursor = extractCursor(data._links?.next)
      if (!cursor) break
    }

    return results
  }

  async delete(folderId: string): Promise<void> {
    await this.http.v2.delete(`folders/${folderId}`)
  }

  async create(title: string, spaceId: string, parentId?: number) {
    const payload: Record<string, unknown> = {
      title,
      spaceId,
    }

    if (parentId) {
      payload.parentId = String(parentId)
    }

    return this.http.v2
      .post('folders', {
        json: payload,
      })
      .json<{id: string}>()
  }

  async getSpaceId(spaceKey: string): Promise<string> {
    const data = await this.http.v2
      .get('spaces', {
        searchParams: {
          keys: spaceKey,
          limit: 1,
        },
      })
      .json<any>()

    const id = data.results?.[0]?.id

    if (!id) {
      throw new Error(`Space "${spaceKey}" introuvable.`)
    }

    return String(id)
  }
}
