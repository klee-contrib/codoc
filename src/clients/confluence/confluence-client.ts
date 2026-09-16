import { ConfluenceAttachmentsClient } from './clients/attachments-client.js'
import { ConfluenceFoldersClient } from './clients/folders-client.js'
import { ConfluencePagesClient } from './clients/pages-client.js'
import { ConfluenceConfig } from '../../types/codoc-types.js'
import ky, { KyInstance } from 'ky'
import { wikiBase } from './utils/confluence-url.js'

export type ConfluenceClient = ReturnType<typeof createConfluenceClient>

export function createConfluenceClient(
  configuration: ConfluenceConfig
) {
  const http = createConfluenceHttp(configuration)

  const attachments = new ConfluenceAttachmentsClient(http)
  const pages = new ConfluencePagesClient(http, configuration)
  const folders = new ConfluenceFoldersClient(http)

  return {
    pages,
    folders,
    attachments,
    configuration,
    foldersV2Unavailable: false
  }
}

export interface ConfluenceHttp {
  readonly baseUrl: string

  readonly v1: KyInstance

  readonly v2: KyInstance
}

function basicAuth(username: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`
}

const CONFLUENCE_TIMEOUT_MS = 30_000

export function createConfluenceHttp(conf: ConfluenceConfig): ConfluenceHttp {
  return {
    baseUrl: conf.baseUrl,

    v1: ky.create({
      prefixUrl: `${wikiBase(conf.baseUrl)}/rest/api`,
      timeout: CONFLUENCE_TIMEOUT_MS,
      headers: {
        Authorization: basicAuth(conf.username, conf.apiToken),
        Accept: 'application/json',
      },
    }),

    v2: ky.create({
      prefixUrl: `${wikiBase(conf.baseUrl)}/api/v2`,
      timeout: CONFLUENCE_TIMEOUT_MS,
      headers: {
        Authorization: basicAuth(conf.username, conf.apiToken),
        Accept: 'application/json',
      },
    }),
  }
}
