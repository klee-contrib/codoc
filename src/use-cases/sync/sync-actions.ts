// Actions effectives du sync (création/màj/suppression Confluence, pull local), une entrée/cible à la fois.
// Un PULL n'écrit que du local ; un PUBLISH n'écrit que Confluence.

import path from 'path'

import {pageUrl} from '../../clients/confluence/utils/confluence-url.js'
import {renderConfluencePage} from '../../services/conversion/markdownToConfluence/index.js'
import {LockChild, makePageState, PageState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {AppConfig, ConfluenceConfig} from '../../types/codoc-types.js'
import {DocTarget} from '../shared/list-documents.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {fetchPageOrUndefined} from '../shared/fetch-page.js'
import {renderRemotePageToLocal} from '../shared/render-remote-page.js'
import {uploadPageAttachments} from './attachment-upload.js'
import {parentNum, urlOf} from './sync-helpers.js'
import {SyncEntry} from './sync-entries.js'
import { ConfluenceClient } from '../../clients/confluence/confluence-client.js'
import { createOrUpdatePage } from '../../services/confluence/pages.js'
import { pushKeywordLabels } from '../../services/confluence/labels.js'
import { createOrEnsureFolder } from '../../services/confluence/folders.js'

// ─────────────────────────────── Contexte ───────────────────────────────

export interface SyncCtx {
  config: AppConfig
  generatedAt: string
  registry: EnvRegistry
  envByKey: Map<string, ConfluenceConfig>
  now: string
  confirm: (question: string) => Promise<boolean>
  /** Cibles maintenues côté code (dont l'expansion des globs), groupées par codocId. */
  codeTargetsByCodocId: Map<string, DocTarget[]>
  /** Branche par défaut du repo (résolue 1 fois) - pour réécrire les liens code en URLs GitLab. */
  defaultBranch: string
}

// ─────────────────────────────── Helpers ───────────────────────────────

// Titre + parent d'une page, ou undefined si absente.
export async function pageMeta(client: ConfluenceClient, pageId: string): Promise<{title: string; parentId?: string} | undefined> {
  const p = await fetchPageOrUndefined(client, pageId)
  return p ? {title: p.title, parentId: p.parentId} : undefined
}

// Convertit un .md (DocTarget) en XML Confluence + pièces jointes draw.io.
function renderTarget(
  ctx: SyncCtx,
  t: DocTarget,
): {xml: string; attachments: Array<{filename: string; content: string}>} {
  const {jira, drawio} = t.env
  return renderConfluencePage(t.markdown, {
    diagramBaseName: path.basename(t.sourceFile, '.md'),
    drawio,
    sourceFile: t.sourceFile,
    jira: jira.serverId || jira.server ? jira : undefined,
    gitlab: {baseUrl: ctx.config.gitlab.baseUrl, branch: ctx.defaultBranch},
    generatedAt: ctx.generatedAt,
    generateSummary: t.generateSummary,
  })
}

// Crée/màj la page (id valide → update en place, sinon création qui, en cas de conflit de titre,
// propose d'adopter la page trouvée après confirmation explicite - jamais d'adoption silencieuse
// par nom seul), puis téléverse pièces jointes et labels.
async function publishPage(
  confirm: SyncCtx['confirm'],
  client: ConfluenceClient,
  t: DocTarget,
  xml: string,
  attachments: Array<{filename: string; content: string}>,
  parentId: number | undefined,
  existingId: string | undefined,
): Promise<{id: string; _links?: {webui?: string}}> {
  const onTitleConflict = (_existingPageId: string, existingUrl: string) =>
    confirm(
      `⚠️  Une page "${t.title}" existe déjà (hors de l'arborescence suivie dans codoc.lock) : ${existingUrl}\n` +
        `   L'adopter et écraser son contenu par celui généré localement ?`,
    )
  const published = await createOrUpdatePage(client, t.title, xml, parentId, existingId, onTitleConflict)
  await uploadPageAttachments(client, published.id, xml, t.imagesDir, attachments)
  await pushKeywordLabels(client, published.id, t.keywords)
  return published
}

// Lève si le parentPageId de l'entrée n'existe ni comme page ni comme dossier.
export async function assertParentExists(client: ConfluenceClient, entry: SyncEntry): Promise<void> {
  const pid = entry.parentPageId
  if (!pid) return
  if (await pageMeta(client, pid) != undefined) return
  if (await client.folders.exists(pid)) return
  throw new Error(
    `"${entry.path}" : parentPageId ${pid} introuvable sur l'environnement "${entry.env.key}". Revois la config.`,
  )
}

export function confluenceState(
  entry: SyncEntry,
  env: ConfluenceConfig,
  pageId: string,
  title: string,
  now: string,
): PageState {
  return makePageState({
    pageId,
    environment: env.key,
    title,
    url: pageUrl(env.baseUrl, env.spaceKey, pageId),
    sourceFile: entry.relPath,
    maintainedIn: 'confluence',
    publishedAt: now,
  })
}

// Supprime une page/dossier, avale une absence déjà constatée. Retourne vrai si la suppression a eu lieu.
async function deleteConfluenceItem(client: ConfluenceClient, id: string, isFolder?: boolean): Promise<boolean> {
  try {
    if (isFolder) await client.folders.delete(id)
    else await client.pages.delete(id)
    return true
  } catch {
    return false
  }
}

// Supprime à distance une page (ou un dossier + ses enfants suivis).
export async function deleteRemote(client: ConfluenceClient, lock: PageState): Promise<void> {
  for (const c of lock.children ?? []) {
    await deleteConfluenceItem(client, c.confluencePageId, c.isFolder)
  }
  if (lock.confluencePageId) {
    await deleteConfluenceItem(client, lock.confluencePageId, lock.isFolder)
  }
}

// Publie un glob/dossier maintenu côté code : upsert par titre + suppression précise des retirés.
async function publishMulti(
  ctx: SyncCtx,
  env: ConfluenceConfig,
  entry: SyncEntry,
  targets: DocTarget[],
  prevChildren: LockChild[] | undefined,
): Promise<PageState> {
  const client = await ctx.registry.connect(env)
  const prevBySource = new Map((prevChildren ?? []).map((c) => [c.sourceFile, c]))
  const resolvedFolderIds = new Map<string, string>()
  const children: LockChild[] = []

  for (const folder of targets.filter((t) => t.isFolder)) {
    const parentId = folder.parentFolderKey
      ? Number(resolvedFolderIds.get(folder.parentFolderKey) ?? folder.parentPageId)
      : parentNum(folder.parentPageId)
    const existingId = prevBySource.get(folder.sourceFile)?.confluencePageId
    log.itemFolder({env: env.key, title: folder.title})
    const {id} = await createOrEnsureFolder(client, folder.title, parentId, existingId)
    resolvedFolderIds.set(`${env.key}:${folder.id}`, id)
    children.push({
      title: folder.title,
      confluencePageId: id,
      sourceFile: folder.sourceFile,
      isFolder: true,
      confluenceUrl: pageUrl(env.baseUrl, env.spaceKey, id),
    })
  }

  for (const file of targets.filter((t) => !t.isFolder)) {
    const parentId = file.parentFolderKey
      ? Number(resolvedFolderIds.get(file.parentFolderKey) ?? file.parentPageId)
      : parentNum(file.parentPageId)
    const {xml, attachments} = renderTarget(ctx, file)
    const existingId = prevBySource.get(file.sourceFile)?.confluencePageId
    log.itemPublished({env: env.key, isUpdate: Boolean(existingId), title: file.title})
    const published = await publishPage(ctx.confirm, client, file, xml, attachments, parentId, existingId)
    children.push({
      title: file.title,
      confluencePageId: published.id,
      sourceFile: file.sourceFile,
      confluenceUrl: pageUrl(env.baseUrl, env.spaceKey, published.id),
    })
  }

  // Suppression précise des enfants retirés en local (uniquement ceux qu'on suivait).
  const currentSources = new Set(targets.map((t) => t.sourceFile))
  for (const c of prevChildren ?? []) {
    if (currentSources.has(c.sourceFile)) continue
    if (await deleteConfluenceItem(client, c.confluencePageId, c.isFolder)) {
      log.itemDeleted({env: env.key, title: `retirée : ${c.title}`})
    }
  }

  const rootFolder = targets.find((t) => t.isFolder && !t.parentFolderKey)
  return {
    confluencePageId: rootFolder ? resolvedFolderIds.get(`${env.key}:${rootFolder.id}`)! : '',
    environment: env.key,
    title: entry.title ?? entry.path,
    sourceFile: entry.relPath,
    publishedAt: ctx.now,
    maintainedIn: 'code',
    ...(targets.some((t) => t.isFolder) ? {isFolder: true} : {}),
    children,
  }
}

export async function publishCode(
  ctx: SyncCtx,
  entry: SyncEntry,
  existingId?: string,
  prevChildren?: LockChild[],
): Promise<PageState | undefined> {
  const env = entry.env
  const client = await ctx.registry.connect(env)
  const targets = ctx.codeTargetsByCodocId.get(entry.codocId!) ?? []
  if (!targets.length) {
    log.warning1(`[SKIPPED] "${entry.path}" (codocId ${entry.codocId}) : dossier/fichier local vide ou introuvable - rien à publier, ignorée.`)
    return undefined
  }

  if (entry.kind !== 'page') {
    await assertParentExists(client, entry)
    return publishMulti(ctx, env, entry, targets, prevChildren)
  }

  const t = targets[0]
  const {xml, attachments} = renderTarget(ctx, t)
  const remote = existingId ? await pageMeta(client, existingId) != undefined : false
  log.itemPublished({env: env.key, isUpdate: remote, title: t.title})
  const published = await publishPage(ctx.confirm, client, t, xml, attachments, parentNum(t.parentPageId), existingId)
  return makePageState({
    pageId: published.id,
    environment: env.key,
    title: t.title,
    url: urlOf(env, published),
    sourceFile: t.sourceFile,
    maintainedIn: 'code',
    publishedAt: ctx.now,
  })
}

// Importe une page distante connue (par id) vers le local + état de lock confluence.
export async function pullPageToLocal(ctx: SyncCtx, entry: SyncEntry, client: ConfluenceClient, id: string): Promise<PageState> {
  const page = await client.pages.fetchPage(id)
  await renderRemotePageToLocal(client, page, entry.relPath, entry.imagesDir)
  return confluenceState(entry, entry.env, id, page.title, ctx.now)
}
