import {ConfluenceConfig} from '../../../types/codoc-types.js'
import {ConfluenceHttp} from '../confluence-client.js'
import {titleVariants} from '../utils/confluence-url.js'

export interface ConfluencePage {
  id: string
  title: string
  storageXml: string
  parentId?: string
  hasImages: boolean
}

interface ConfluenceVersionResponse {
  id: string
  title: string
  version: {
    number: number
  }
}

export class ConfluencePagesClient {
  constructor(
    private readonly http: ConfluenceHttp,
    private readonly configuration: ConfluenceConfig,
  ) {}

  async exists(id: string): Promise<boolean> {
    try {
      await this.http.v1.get(`content/${id}`).json()
      return true
    } catch {
      return false
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.http.v1.get('content', {
        searchParams: {
          limit: 1,
        },
      })

      return true
    } catch {
      return false
    }
  }

  async fetchPage(pageId: string): Promise<ConfluencePage> {
    const data = await this.http.v1
      .get(`content/${pageId}`, {
        searchParams: {
          expand: 'body.storage,ancestors',
        },
      })
      .json<any>()

    const storageXml = data.body?.storage?.value ?? ''

    const parent = data.ancestors?.[data.ancestors.length - 1]

    return {
      id: String(data.id),
      title: data.title,
      storageXml,
      parentId: parent?.id ? parent.id : undefined,
      hasImages: /ri:attachment/i.test(storageXml) || /ri:url/i.test(storageXml),
    }
  }

  async fetchAncestors(pageId: string): Promise<Array<{id: string; title: string}>> {
    const data = await this.http.v1
      .get(`content/${pageId}`, {
        searchParams: {
          expand: 'ancestors',
        },
      })
      .json<any>()

    const ancestors = (data.ancestors ?? []).map((a: any) => ({
      id: String(a.id),
      title: a.title ?? String(a.id),
    }))

    return [
      ...ancestors,
      {
        id: String(data.id),
        title: data.title,
      },
    ]
  }

  /** Suit la pagination `start`/`limit` de l'API v1 - sinon les dossiers de plus de 200 pages étaient tronqués silencieusement. */
  async fetchChildren(pageId: string): Promise<Array<{id: string; title: string}>> {
    const results: Array<{id: string; title: string}> = []
    const limit = 200
    let start = 0

    for (let page = 0; page < 1000; page++) {
      const data = await this.http.v1
        .get(`content/${pageId}/child/page`, {
          searchParams: {start, limit, expand: 'version'},
        })
        .json<any>()

      const batch = data.results ?? []
      results.push(...batch.map((p: any) => ({id: String(p.id), title: p.title})))

      if (batch.length < limit) break
      start += limit
    }

    return results
  }

  async findByTitle(title: string) {
    for (const variant of titleVariants(title)) {
      const data = await this.http.v1
        .get('content', {
          searchParams: {
            title: variant,
            spaceKey: this.configuration.spaceKey,
            expand: 'version',
          },
        })
        .json<any>()

      if (data.results?.[0]) {
        return data.results[0]
      }
    }

    return undefined
  }

  private async getVersion(pageId: string): Promise<ConfluenceVersionResponse> {
    return this.http.v1
      .get(`content/${pageId}`, {
        searchParams: {
          expand: 'version',
        },
      })
      .json<ConfluenceVersionResponse>()
  }

  async delete(pageId: string): Promise<void> {
    await this.http.v1.delete(`content/${pageId}`)
  }

  /** Ajoute des labels à une page (n'écrase ni ne retire les existants - API additive). */
  async addLabels(pageId: string, labels: string[]): Promise<void> {
    if (!labels.length) return
    await this.http.v1.post(`content/${pageId}/label`, {
      json: labels.map((name) => ({prefix: 'global', name})),
    })
  }

  async create(title: string, storageContent: string, parentId?: number) {
    const effectiveParent = parentId ?? this.configuration.defaultParentPageId

    const payload: Record<string, unknown> = {
      type: 'page',
      title,
      space: {
        key: this.configuration.spaceKey,
      },
      body: {
        storage: {
          value: storageContent,
          representation: 'storage',
        },
      },
    }

    if (effectiveParent) {
      payload.ancestors = [
        {
          id: String(effectiveParent),
        },
      ]
    }

    return this.http.v1
      .post('content', {
        json: payload,
      })
      .json<any>()
  }

  async update(pageId: string, title: string, storageContent: string, parentId?: number) {
    const version = await this.getVersion(pageId)

    const effectiveParent = parentId ?? this.configuration.defaultParentPageId

    const payload: Record<string, unknown> = {
      id: pageId,
      type: 'page',
      title,
      version: {
        number: version.version.number + 1,
      },
      body: {
        storage: {
          value: storageContent,
          representation: 'storage',
        },
      },
    }

    if (effectiveParent) {
      payload.ancestors = [
        {
          id: String(effectiveParent),
        },
      ]
    }

    return this.http.v1
      .put(`content/${pageId}`, {
        json: payload,
      })
      .json<any>()
  }

  async updateContent(pageId: string, storageContent: string) {
    const page = await this.getVersion(pageId)

    return this.update(pageId, page.title, storageContent)
  }
}
