import ky from 'ky'

import {ConfluenceHttp} from '../confluence-client.js'
import {wikiLink} from '../utils/confluence-url.js'

export interface AttachmentMetadata {
  id: string
  filename: string
  downloadPath: string
}

export class ConfluenceAttachmentsClient {
  constructor(private readonly http: ConfluenceHttp) {}

  /**
   * Recherche une pièce jointe par son nom.
   */
  async find(pageId: string, filename: string): Promise<AttachmentMetadata | undefined> {
    const data = await this.http.v1
      .get(`content/${pageId}/child/attachment`, {
        searchParams: {
          filename,
          expand: 'version',
        },
      })
      .json<any>()

    const hit = data.results?.[0]

    if (!hit) {
      return undefined
    }

    if (!hit._links?.download) {
      return undefined
    }

    return {
      id: String(hit.id),
      filename,
      downloadPath: hit._links.download,
    }
  }

  /**
   * Télécharge directement via _links.download (API v1).
   */
  async downloadV1(downloadPath: string): Promise<ArrayBuffer> {
    return this.http.v1
      .get(wikiLink(this.http.baseUrl, downloadPath), {
        prefixUrl: '',
        headers: {
          Accept: '*/*',
        },
      })
      .arrayBuffer()
  }

  /**
   * Retourne le downloadLink signé (API v2).
   */
  async getDownloadLink(attachmentId: string): Promise<string | undefined> {
    const data = await this.http.v2.get(`attachments/${attachmentId}`).json<{
      downloadLink?: string
    }>()

    return data.downloadLink
  }

  /**
   * Télécharge un attachment via un downloadLink v2 (absolu OU relatif au wiki).
   * Le lien étant déjà pré-signé, on n'envoie pas d'en-tête d'authentification.
   */
  async downloadV2(signedUrl: string): Promise<ArrayBuffer> {
    const url = signedUrl.startsWith('http') ? signedUrl : wikiLink(this.http.baseUrl, signedUrl)
    return ky
      .get(url, {
        headers: {
          Accept: '*/*',
        },
      })
      .arrayBuffer()
  }

  /**
   * Upload ou remplace une pièce jointe.
   */
  async upload(pageId: string, filename: string, blob: Blob): Promise<void> {
    const existing = await this.find(pageId, filename)

    const form = new FormData()

    form.append('file', blob, filename)

    const endpoint = existing
      ? `content/${pageId}/child/attachment/${existing.id}/data`
      : `content/${pageId}/child/attachment`

    await this.http.v1.post(endpoint, {
      body: form,
      headers: {
        'X-Atlassian-Token': 'no-check',
      },
    })
  }

  /**
   * Télécharge directement le texte d'un attachment.
   */
  async downloadTextV1(downloadPath: string): Promise<string> {
    return this.http.v1
      .get(wikiLink(this.http.baseUrl, downloadPath), {
        prefixUrl: '',
        headers: {
          Accept: '*/*',
        },
      })
      .text()
  }
}
