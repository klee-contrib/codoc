import {pageUrl, wikiBase} from '../../clients/confluence/utils/confluence-url.js'
import {getCodocConfig} from '../../config/codoc-config.js'
import {findLockedRef, loadPublishState, PublishState} from '../../services/lock/lock-file.js'
import {ansi, log} from '../../services/log/logger.js'
import {ConfluenceConfig} from '../../types/codoc-types.js'
import {DocTarget, listDocumentTargets} from '../shared/list-documents.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {selectEnvs} from '../shared/env-select.js'

export interface TreeOptions {
  env?: string
}

interface PageNode {
  title: string
  sourceFile: string
  deployed: boolean
  pageId?: string
  url?: string
  parentPageId?: string
  children: PageNode[]
  isFolder?: boolean
}

interface FolderNode {
  id: string
  title: string
  url?: string
  subFolders: Map<string, FolderNode>
  pages: PageNode[]
}

const ROOT_KEY = '(racine)'

const isPageId = (id: string): boolean => /^\d+$/.test(id)

function printPage(node: PageNode, prefix: string, isLast: boolean): void {
  const connector = isLast ? '└─ ' : '├─ '
  const badge = node.isFolder ? '[FOLDER]' : node.deployed ? ansi.green('✅') : ansi.yellow('⚠️')
  const label = node.isFolder ? ansi.bold(node.title) : node.title
  const hint = node.isFolder ? '' : `  ${ansi.dim(node.sourceFile)}`
  log.raw(`${prefix}${connector}${badge} ${ansi.link(label, node.url)}${hint}`)

  const childPrefix = prefix + (isLast ? '   ' : '│  ')
  const kids = [...node.children].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  kids.forEach((k, i) => printPage(k, childPrefix, i === kids.length - 1))
}

function printFolder(folder: FolderNode, prefix: string, isLast: boolean): void {
  const connector = isLast ? '└─ ' : '├─ '
  const idHint = isPageId(folder.id) ? ansi.dim(` (${folder.id})`) : ''
  log.raw(`${prefix}${connector}[FOLDER] ${ansi.link(ansi.bold(folder.title), folder.url)}${idHint}`)

  const childPrefix = prefix + (isLast ? '   ' : '│  ')
  const subs = [...folder.subFolders.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  const pages = [...folder.pages].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  const total = subs.length + pages.length
  let i = 0
  for (const sf of subs) printFolder(sf, childPrefix, ++i === total)
  for (const p of pages) printPage(p, childPrefix, ++i === total)
}

/** Place chaque groupe de pages sous son dossier, imbriqué selon `chains` si fourni. */
function buildFolderForest(
  pagesByFolder: Map<string, PageNode[]>,
  chains: Map<string, Array<{id: string; title: string}>>,
  baseUrl: string,
  spaceKey: string,
): FolderNode[] {
  const roots = new Map<string, FolderNode>()

  const getOrCreate = (level: Map<string, FolderNode>, id: string, title: string): FolderNode => {
    let f = level.get(id)
    if (!f) {
      f = {
        id,
        title,
        url: isPageId(id) ? pageUrl(baseUrl, spaceKey, id) : undefined,
        subFolders: new Map(),
        pages: [],
      }
      level.set(id, f)
    }
    return f
  }

  for (const [folderId, pages] of pagesByFolder) {
    const chain = chains.get(folderId) ?? [
      {id: folderId, title: folderId === ROOT_KEY ? "Racine de l'espace" : `Dossier`},
    ]

    let level = roots
    let node: FolderNode | undefined
    for (const {id, title} of chain) {
      node = getOrCreate(level, id, title)
      level = node.subFolders
    }
    node!.pages.push(...pages)
  }

  return [...roots.values()]
}

async function printEnvTree(
  env: ConfluenceConfig,
  registry: EnvRegistry,
  targets: DocTarget[],
  lock: PublishState,
): Promise<void> {
  const locked = (t: DocTarget) => findLockedRef(lock, env.key, t.sourceFile)

  const nodes: PageNode[] = targets.map((t) => {
    const l = locked(t)
    return {
      title: t.title,
      sourceFile: t.sourceFile,
      deployed: !!l,
      pageId: l?.confluencePageId,
      url: l?.confluenceUrl,
      parentPageId: t.parentPageId,
      children: [],
      isFolder: t.isFolder,
    }
  })

  // Index des dossiers locaux (glob) par clé, pour rattacher chaque fichier à son dossier immédiat.
  const nodeByLocalFolderKey = new Map<string, PageNode>()
  targets.forEach((t, i) => {
    if (t.isFolder) nodeByLocalFolderKey.set(`${env.key}:${t.id}`, nodes[i])
  })

  // Sinon rattachement à la page Confluence parente connue, si gérée par codoc.
  const byPageId = new Map<string, PageNode>()
  for (const n of nodes) if (n.pageId) byPageId.set(n.pageId, n)

  const pagesByFolder = new Map<string, PageNode[]>()
  targets.forEach((t, i) => {
    const n = nodes[i]
    const localFolder = t.parentFolderKey ? nodeByLocalFolderKey.get(t.parentFolderKey) : undefined
    if (localFolder) {
      localFolder.children.push(n)
      return
    }
    const parent = n.parentPageId ? byPageId.get(n.parentPageId) : undefined
    if (parent) {
      parent.children.push(n)
      return
    }
    const key = n.parentPageId ?? ROOT_KEY
    ;(pagesByFolder.get(key) ?? pagesByFolder.set(key, []).get(key)!).push(n)
  })

  const chains = new Map<string, Array<{id: string; title: string}>>()
  try {
    const client = registry.raw(env)
    for (const id of pagesByFolder.keys()) {
      if (!isPageId(id)) continue
      try {
        chains.set(id, await client.pages.fetchAncestors(id))
      } catch {
        log.warning2('dossier inaccessible → reste à plat avec son id')
      }
    }
  } catch {
    log.warning2("impossible d'initialiser le client (creds absentes) → tout reste à plat")
  }

  const forest = buildFolderForest(pagesByFolder, chains, env.baseUrl, env.spaceKey)
  const deployedCount = nodes.filter((n) => n.deployed).length

  const spaceUrl = `${wikiBase(env.baseUrl)}/spaces/${env.spaceKey}`
  log.blank()
  log.raw(
    `${ansi.bold(`Documentation Confluence [${env.key}]`)} - espace ${ansi.link(ansi.cyan(env.spaceKey), spaceUrl)}  ${ansi.dim(env.baseUrl)}`,
  )
  log.blank()

  const sorted = forest.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  sorted.forEach((f, i) => printFolder(f, '', i === sorted.length - 1))

  log.raw(ansi.dim(`${nodes.length} page(s) · ${deployedCount} déployée(s)`))
}

export async function printDocsTree(opts: TreeOptions = {}): Promise<void> {
  const config = getCodocConfig()
  const environments = selectEnvs(config, opts.env)
  const allTargets = await listDocumentTargets()
  const lock = loadPublishState()
  const registry = new EnvRegistry()

  for (const env of environments) {
    const targets = allTargets.filter((t) => t.env.key === env.key)
    if (!targets.length) continue
    await printEnvTree(env, registry, targets, lock)
  }

  log.blank()
  log.raw(`${ansi.dim('Légende :')} ${ansi.green('✅')} déployé   ${ansi.yellow('⚠️')} défini mais pas encore publié`)
}
