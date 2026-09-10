import {STATE_FILE} from '../../config/codoc-paths.js'
import {fileExists, readFile, writeFile} from '../files-service.js'
import {log} from '../log/logger.js'

export interface PageState {
  confluencePageId: string
  environment: string
  title: string
  confluenceUrl?: string
  sourceFile: string
  publishedAt: string
  maintainedIn: 'code' | 'confluence'
  isFolder?: boolean
  children?: LockChild[]
}

export interface LockChild {
  title: string
  confluencePageId: string
  sourceFile: string
  isFolder?: boolean
  confluenceUrl?: string
}

export interface PublishState {
  lastPublished: string
  pages: Record<string, PageState>
}

let cache: PublishState | undefined

export function loadPublishState(): PublishState {
  if (cache) return cache
  if (!fileExists(STATE_FILE)) {
    cache = {lastPublished: '', pages: {}}
    return cache
  }
  try {
    const raw = readFile(STATE_FILE)
    cache = JSON.parse(raw) as PublishState
    return cache
  } catch {
    log.warning0('codoc.lock illisible - état précédent ignoré.')
    cache = {lastPublished: '', pages: {}}
    return cache
  }
}

export function savePublishState(state: PublishState): void {
  cache = state
  writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
}

export interface LockedRef {
  confluencePageId: string
  confluenceUrl?: string
  title: string
}

export function findLockedRef(lock: PublishState, envKey: string, sourceFile: string): LockedRef | undefined {
  for (const p of Object.values(lock.pages)) {
    if (p.environment !== envKey) continue
    if (p.sourceFile === sourceFile)
      return {confluencePageId: p.confluencePageId, confluenceUrl: p.confluenceUrl, title: p.title}
    const child = p.children?.find((c) => c.sourceFile === sourceFile)
    if (child) return {confluencePageId: child.confluencePageId, confluenceUrl: child.confluenceUrl, title: child.title}
  }
  return undefined
}

export function makePageState(p: {
  pageId: string
  environment: string
  title: string
  url?: string
  sourceFile: string
  maintainedIn: 'code' | 'confluence'
  publishedAt: string
  isFolder?: boolean
}): PageState {
  return {
    confluencePageId: p.pageId,
    environment: p.environment,
    title: p.title,
    confluenceUrl: p.url,
    sourceFile: p.sourceFile,
    publishedAt: p.publishedAt,
    maintainedIn: p.maintainedIn,
    ...(p.isFolder ? {isFolder: true} : {}),
  }
}
