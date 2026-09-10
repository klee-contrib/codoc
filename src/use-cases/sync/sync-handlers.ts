// Orchestration des passes du sync : décide quoi faire pour une entrée/un lock, délègue l'exécution à sync-actions.ts.

import path from 'path'

import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {getFolderRef} from '../../services/confluence/folders.js'
import {PageState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {fileExists, removePath} from '../../services/files-service.js'
import {pulledPagesToChildren, pullFolderToLocal} from '../shared/pull-folder.js'
import {
  assertParentExists,
  confluenceState,
  deleteRemote,
  pageMeta,
  publishCode,
  pullPageToLocal,
  SyncCtx,
} from './sync-actions.js'
import {SyncEntry} from './sync-entries.js'

/** Passe 1 - entrée de lock sans config. Retourne l'entrée conservée, ou null si retirée. */
export async function handleLockOrphan(ctx: SyncCtx, lock: PageState): Promise<PageState | null> {
  const env = lock.environment ? ctx.envByKey.get(lock.environment) : undefined
  if (!env) {
    log.warning2(`"${lock.title}" : environnement "${lock.environment ?? '?'}" inconnu - conservée dans le lock.`)
    return lock
  }
  const client = await ctx.registry.connect(env)
  const absLocal = path.resolve(PROJECT_ROOT, lock.sourceFile)

  if (lock.maintainedIn === 'confluence') {
    const exists = lock.isFolder
      ? Boolean(await getFolderRef(client, lock.confluencePageId))
      : await pageMeta(client, lock.confluencePageId)
    if (exists) {
      removePath(absLocal)
      log.itemCleaned(
        `"${lock.title}" retirée de la config → doc locale supprimée (${lock.sourceFile}). Page Confluence conservée.`,
      )
      return null
    }
    const ok = await ctx.confirm(
      `⚠️  "${lock.title}" : page Confluence introuvable ET retirée de la config. Supprimer la doc locale "${lock.sourceFile}" ? (perte définitive possible)`,
    )
    if (ok) {
      removePath(absLocal)
      log.itemCleaned(`Doc locale supprimée : ${lock.sourceFile}`)
      return null
    }
    log.itemKept(`Conservée : ${lock.sourceFile}`)
    return lock
  }

  // maintainedIn: code → supprimer la page distante (avec confirmation)
  const warn = fileExists(absLocal) ? '' : ' (doc locale absente - perte définitive possible)'
  const ok = await ctx.confirm(
    `[DELETE] "${lock.title}" retirée de la config. Supprimer la page Confluence distante${warn} ?`,
  )
  if (!ok) {
    log.itemKept(`Conservée à distance : ${lock.title}`)
    return lock
  }
  await deleteRemote(client, lock)
  log.itemDeleted({env: env.key, title: lock.title})
  return null
}

/** Passe 1 - entrée appariée (codocId présent des deux côtés). On garde le confluencePageId. */
export async function syncMatched(ctx: SyncCtx, entry: SyncEntry, lock: PageState): Promise<PageState> {
  const env = entry.env
  const client = await ctx.registry.connect(env)
  const cpid = lock.confluencePageId

  if (entry.maintainedIn === 'code') {
    return (await publishCode(ctx, entry, cpid, lock.children)) ?? lock
  }

  // maintainedIn: confluence
  if (entry.kind === 'page') {
    const meta = await pageMeta(client, cpid)
    if (!meta)
      throw new Error(
        `"${entry.title ?? entry.path}" : page Confluence ${cpid} introuvable. Revois la config (codocId).`,
      )
    if (entry.title && meta.title !== entry.title) {
      throw new Error(
        `"${entry.path}" : titre Confluence ("${meta.title}") ≠ config ("${entry.title}"). Revois la config.`,
      )
    }
    if (entry.parentPageId && meta.parentId && meta.parentId !== entry.parentPageId) {
      throw new Error(
        `"${entry.path}" : parent Confluence (${meta.parentId}) ≠ config (${entry.parentPageId}). Revois la config.`,
      )
    }
    log.itemPulled({env: env.key, title: entry.title ?? cpid, dest: entry.relPath})
    return pullPageToLocal(ctx, entry, client, cpid)
  }

  // dossier confluence - le conteneur peut être un vrai dossier v2 ou une page-dossier v1 (`getFolderRef` gère les deux).
  await assertParentExists(client, entry)
  const folderMeta = await getFolderRef(client, cpid)
  if (!folderMeta) throw new Error(`"${entry.path}" : dossier Confluence ${cpid} introuvable. Revois la config.`)
  log.itemPulled({env: env.key, title: `dossier "${folderMeta.title}"`, dest: entry.relPath})
  const pulled = await pullFolderToLocal({
    confluenceClient: client,
    rootId: cpid,
    rootType: folderMeta.type,
    localDir: entry.relPath,
    imagesDir: entry.imagesDir,
    prevChildren: lock.children, // identité par id (pas par nom) au re-pull
    onPage: (p, i, total) => log.progress(i, total, p.title),
  })
  log.success4(`[PULL] ${pulled.length} page(s) importée(s)`)
  return {
    ...confluenceState(entry, env, cpid, folderMeta.title, ctx.now),
    isFolder: true,
    children: pulledPagesToChildren(pulled, env.baseUrl, env.spaceKey),
  }
}

/** Passe 2 - entrée yaml sans équivalent dans le lock (création / premier pull). Retourne `undefined` si rien à faire (voir `publishCode`). */
export async function syncNew(ctx: SyncCtx, entry: SyncEntry): Promise<PageState | undefined> {
  const env = entry.env
  const client = await ctx.registry.connect(env)

  if (entry.maintainedIn === 'code') {
    return publishCode(ctx, entry)
  }

  // confluence sans lock → on retrouve l'élément distant par son titre
  if (entry.kind === 'page') {
    if (!entry.title)
      throw new Error(`"${entry.path}" : titre Confluence requis dans la config pour retrouver la page.`)
    log.itemPulled({env: env.key, title: entry.title, dest: entry.relPath})
    const found = await client.pages.findByTitle(entry.title)
    if (!found)
      throw new Error(
        `"${entry.title}" : page Confluence introuvable (env ${env.key}). Revois la config ou fais 'codoc pull'.`,
      )
    const id = String(found.id)
    const meta = await pageMeta(client, id)
    if (entry.parentPageId && meta?.parentId && meta.parentId !== entry.parentPageId) {
      throw new Error(
        `"${entry.title}" : parent Confluence (${meta.parentId}) ≠ config (${entry.parentPageId}). Revois la config.`,
      )
    }
    return pullPageToLocal(ctx, entry, client, id)
  }

  if (!entry.title) {
    throw new Error(`"${entry.path}" : titre Confluence requis dans la config pour retrouver le dossier.`)
  }

  const page = await client.pages.findByTitle(entry.title)
  const found: {id: string; type: 'folder' | 'page'} | undefined = page
    ? {id: String(page.id), type: 'page'}
    : entry.parentPageId
      ? await client.folders.findByTitleUnderParent(entry.parentPageId, entry.title).then((f) => (f ? {...f, type: 'folder' as const} : undefined))
      : undefined

  if (!found) {
    throw new Error(
      `"${entry.title}" : dossier Confluence introuvable (env ${env.key}). Revois la config ou fais 'codoc pull'.`,
    )
  }

  if (entry.parentPageId) {
    const parentId = found.type === 'page' ? (await pageMeta(client, found.id))?.parentId : (await client.folders.get(found.id))?.parentId
    if (parentId && parentId !== entry.parentPageId) {
      throw new Error(
        `"${entry.title}" : parent Confluence (${parentId}) ≠ config (${entry.parentPageId}). Revois la config.`,
      )
    }
  }

  log.itemPulled({env: env.key, title: `dossier "${entry.title}" (premier import)`, dest: entry.relPath})
  const pulled = await pullFolderToLocal({
    confluenceClient: client,
    rootId: found.id,
    rootType: found.type,
    localDir: entry.relPath,
    imagesDir: entry.imagesDir,
    onPage: (p, i, total) => log.progress(i, total, p.title),
  })
  log.success4(`[PULL] ${pulled.length} page(s) importée(s) - dossier local créé`)
  return {
    ...confluenceState(entry, env, found.id, entry.title, ctx.now),
    isFolder: true,
    children: pulledPagesToChildren(pulled, env.baseUrl, env.spaceKey),
  }
}
