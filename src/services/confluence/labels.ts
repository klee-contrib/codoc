import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {log} from '../log/logger.js'

const COMBINING_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g')

export function toConfluenceLabel(keyword: string): string {
  return keyword
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function pushKeywordLabels(client: ConfluenceClient, pageId: string, keywords: string[] | undefined): Promise<void> {
  const labels = [...new Set((keywords ?? []).map(toConfluenceLabel).filter(Boolean))]
  if (!labels.length) return
  try {
    await client.pages.addLabels(pageId, labels)
  } catch (err) {
    log.warning4(`Labels Confluence non appliqués (${labels.join(', ')}) : ${(err as Error).message}`)
  }
}
