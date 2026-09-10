import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {log} from '../log/logger.js'
import {createPageOrThrowConflict} from './pages.js'

export async function createOrEnsureFolder(
  client: ConfluenceClient,
  title: string,
  parentId?: number,
  existingId?: string,
): Promise<{id: string}> {
  if (existingId && (await resourceExists(client, existingId))) {
    return {id: existingId}
  }

  if (parentId) {
    const already = await client.folders.findByTitleUnderParent(String(parentId), title)
    if (already) return {id: already.id}
  }

  if (!client.foldersV2Unavailable) {
    try {
      const spaceId = await client.folders.getSpaceId(client.configuration.spaceKey)
      const result = await client.folders.create(title, spaceId, parentId)
      return {id: result.id}
    } catch (err) {
      client.foldersV2Unavailable = true // une seule tentative/alerte pour ce client
      const status = (err as {response?: {status?: number}}).response?.status
      log.warning2(`API v2 dossiers indisponible (HTTP ${status ?? 'réseau'}) - repli sur des pages de type dossier.`)
    }
  }

  const page = await createPageOrThrowConflict(client, title, '<p></p>', parentId)
  return {id: page.id}
}

async function resourceExists(client: ConfluenceClient, id: string): Promise<boolean> {
  return (await client.folders.exists(id)) || (await client.pages.exists(id))
}

export interface FolderRef {
  id: string
  title: string
  parentId?: string
  type: 'folder' | 'page'
}

export async function getFolderRef(client: ConfluenceClient, id: string): Promise<FolderRef | undefined> {
  const folder = await client.folders.get(id)
  if (folder) return {...folder, type: 'folder'}

  try {
    const page = await client.pages.fetchPage(id)
    return {id: page.id, title: page.title, parentId: page.parentId, type: 'page'}
  } catch {
    return undefined
  }
}
