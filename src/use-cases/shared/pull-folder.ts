import path from 'path'

import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {pageUrl} from '../../clients/confluence/utils/confluence-url.js'
import {LockChild} from '../../services/lock/lock-file.js'
import {slugify} from '../../services/slugify.js'
import {toPosixPath} from '../../services/files-service.js'
import {renderRemotePageToLocal} from './render-remote-page.js'

interface FolderDescendant {
  id: string
  title: string
  parentId: string
  /** "folder" (sous-dossier Confluence) ou "page". */
  type: string
}

export async function fetchFolderDescendants(
  ConfluenceClient: ConfluenceClient,
  parentId: string,
  parentType: 'folder' | 'page',
): Promise<FolderDescendant[]> {
  const children =
    parentType === 'folder'
      ? await ConfluenceClient.folders.children(parentId)
      : [
          ...(await ConfluenceClient.pages.fetchChildren(parentId)).map((c) => ({...c, type: 'page'})),
          ...(await ConfluenceClient.folders.childrenFolders(parentId)).map((c) => ({...c, type: 'folder'})),
        ]

  // Explore les enfants en parallèle (ordre du résultat sans importance).
  const nested = await Promise.all(
    children.map((child) =>
      fetchFolderDescendants(ConfluenceClient, child.id, child.type === 'folder' ? 'folder' : 'page'),
    ),
  )

  return [...children.map((child) => ({...child, parentId})), ...nested.flat()]
}

// Descendants Confluence → chemin local (.md) par id, dossiers en `index.md`.
// Ex. `folderLocalPaths([{id:"f1",title:"Sous-dossier",parentId:"root",type:"folder"},{id:"p1",title:"Ma Page",parentId:"f1",type:"page"}], "root", "doc/")` → `Map{"f1"=>"doc/sous-dossier/index.md", "p1"=>"doc/sous-dossier/ma-page.md"}`
export function folderLocalPaths(
  descendants: FolderDescendant[],
  rootId: string,
  localFolder: string,
): Map<string, string> {
  const slugById = new Map(descendants.map((d) => [d.id, slugify(d.title)]))
  const parentById = new Map(descendants.map((d) => [d.id, d.parentId]))
  const hasChildren = new Set(descendants.map((d) => d.parentId).filter((id) => id !== rootId))
  const folderIds = new Set(descendants.filter((d) => d.type === 'folder').map((d) => d.id))

  const result = new Map<string, string>()
  for (const d of descendants) {
    const parts: string[] = []
    let cur = d.id
    while (cur !== rootId) {
      const slug = slugById.get(cur)!
      if (cur === d.id) {
        const isDir = hasChildren.has(cur) || folderIds.has(cur)
        parts.unshift(isDir ? `${slug}/index.md` : `${slug}.md`)
      } else {
        parts.unshift(slug)
      }
      cur = parentById.get(cur)!
    }
    result.set(d.id, `${localFolder}${parts.join('/')}`)
  }
  return result
}

export interface PulledPage {
  id: string
  title: string
  localPath: string
}

// Pages tirées → entrées LockChild pour le fichier de lock.
// Ex. `pulledPagesToChildren([{id:"123",title:"Ma Page",localPath:"doc/ma-page.md"}], "https://x.atlassian.net", "DOCS")` → `[{title:"Ma Page", confluencePageId:"123", sourceFile:"doc/ma-page.md", confluenceUrl:"https://x.atlassian.net/wiki/spaces/DOCS/pages/123"}]`
export function pulledPagesToChildren(pages: PulledPage[], baseUrl: string, spaceKey: string): LockChild[] {
  return pages.map((p) => ({
    title: p.title,
    confluencePageId: p.id,
    sourceFile: p.localPath,
    confluenceUrl: pageUrl(baseUrl, spaceKey, p.id),
  }))
}

export async function pullFolderToLocal(params: {
  confluenceClient: ConfluenceClient
  rootId: string
  localDir: string
  rootType?: 'folder' | 'page'
  imagesDir?: string
  prevChildren?: LockChild[]
  onPage?: (page: PulledPage, index: number, total: number) => void
  /** Si fourni, une page en échec est loggée et ignorée (mode `pull`) ; sinon l'erreur interrompt tout l'import (mode `sync`). */
  onPageError?: (page: {id: string; title: string}, err: unknown, index: number, total: number) => void
}): Promise<PulledPage[]> {
  const {confluenceClient, rootId, imagesDir, onPage, onPageError} = params
  const localFolder = toPosixPath(params.localDir).replace(/\/?$/, '/')

  const descendants = await fetchFolderDescendants(confluenceClient, rootId, params.rootType ?? 'folder')
  const pages = descendants.filter((d) => d.type !== 'folder')
  const localPaths = folderLocalPaths(descendants, rootId, localFolder)
  // Chemin d'origine par id (prioritaire sur le chemin dérivé du titre courant).
  const prevPathById = new Map((params.prevChildren ?? []).map((c) => [c.confluencePageId, c.sourceFile]))

  const folderBase = localFolder.replace(/\/$/, '') // racine du pull, sans slash final

  const written: PulledPage[] = []
  for (let i = 0; i < pages.length; i++) {
    const {id, title} = pages[i]
    const localPath = prevPathById.get(id) ?? localPaths.get(id)!
    try {
      const page = await confluenceClient.pages.fetchPage(id)
      // Sous-dossier d'images qui miroite l'arborescence (`imagesDir/sous/dossier`) ; sans imagesDir, pas de download.
      const pageImagesDir = imagesDir ? imagesDirForPage(imagesDir, folderBase, localPath) : undefined
      await renderRemotePageToLocal(confluenceClient, page, localPath, pageImagesDir)
      const pulled = {id, title, localPath}
      written.push(pulled)
      onPage?.(pulled, i + 1, pages.length)
    } catch (err) {
      if (!onPageError) throw err
      onPageError({id, title}, err, i + 1, pages.length)
    }
  }
  return written
}

function imagesDirForPage(imagesDir: string, folderBase: string, localPath: string): string {
  const pageDir = path.posix.dirname(toPosixPath(localPath))
  const base = toPosixPath(folderBase)
  const sub = path.posix.relative(base, pageDir) // peut être "" si la page est à la racine
  return sub && sub !== '.' ? `${imagesDir.replace(/\/$/, '')}/${sub}` : imagesDir
}
