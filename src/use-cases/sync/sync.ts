// Sync piloté par `codocId` (lien stable yaml ↔ lock) : passe 1 traite les entrées du lock
// (orphelines → suppression, appariées → publish/pull), passe 2 traite les nouvelles entrées yaml.

import {getCodocConfig} from '../../config/codoc-config.js'
import {closeDrawioRenderer} from '../../services/conversion/confluenceToMarkdown/diagrams/drawio-to-image.js'
import {loadPublishState, PageState, savePublishState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {getDefaultBranch} from '../../services/git/default-branch.js'
import {createRl, resolveConfirm} from '../../services/prompt.js'
import {DocTarget, listDocumentTargets} from '../shared/list-documents.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {selectEnvs} from '../shared/env-select.js'
import {SyncCtx} from './sync-actions.js'
import {associateByCodocId, validateCodocIds} from './sync-associate.js'
import {buildSyncEntries} from './sync-entries.js'
import {handleLockOrphan, syncMatched, syncNew} from './sync-handlers.js'

export interface SyncOptions {
  /** Ne synchronise que cet environnement (clé). Par défaut : tous. */
  env?: string
  /** Réponse automatique aux suppressions/adoptions de page : true = accepte tout, false = refuse
   * tout, undefined = demande à chaque cas. */
  confirm?: boolean
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  log.startProcess('Synchronisation de la documentation...')

  const config = getCodocConfig()
  const envByKey = new Map(config.atlassian.environments.map((e) => [e.key, e]))
  const targetEnv = opts.env
  // Garde-fou : lève si la clé est inconnue.
  selectEnvs(config, targetEnv)
  if (targetEnv) {
    log.info0(`Environnement ciblé : ${targetEnv}`)
    log.blank()
  }
  if (opts.confirm === false) {
    log.info0("--no-confirm : les suppressions et adoptions nécessitant confirmation sont refusées (rien de risqué n'est fait).")
    log.blank()
  }

  const previousState = loadPublishState()
  const now = new Date().toISOString()

  // Périmètre : entrées yaml et lock de l'environnement ciblé (les autres restent intacts).
  const entries = buildSyncEntries(config).filter((e) => !targetEnv || e.env.key === targetEnv)
  const scopedLock: Record<string, PageState> = {}
  const keptOutOfScope: Record<string, PageState> = {}
  for (const [key, p] of Object.entries(previousState.pages)) {
    ;(!targetEnv || p.environment === targetEnv ? scopedLock : keptOutOfScope)[key] = p
  }

  // Garde-fou : codocId présents et uniques (yaml + lock) - pas de mauvaise association.
  validateCodocIds(entries)

  // Cibles maintenues côté code (expansion des globs incluse), groupées par codocId.
  const codeTargetsByCodocId = new Map<string, DocTarget[]>()
  for (const t of await listDocumentTargets()) {
    if (t.maintainedIn !== 'code' || !t.codocId) continue
    const list = codeTargetsByCodocId.get(t.codocId)
    if (list) list.push(t)
    else codeTargetsByCodocId.set(t.codocId, [t])
  }

  const assoc = associateByCodocId(scopedLock, entries)

  const rl = createRl()
  const ctx: SyncCtx = {
    config,
    generatedAt: now,
    registry: new EnvRegistry(),
    envByKey,
    now,
    confirm: (question) => resolveConfirm(rl, {flag: opts.confirm, question, default: false}),
    codeTargetsByCodocId,
    defaultBranch: await getDefaultBranch(),
  }

  const newPages: Record<string, PageState> = {...keptOutOfScope}

  try {
    // Passe 1 - orphelins du lock.
    if (assoc.lockOrphans.length) {
      log.info0(`${assoc.lockOrphans.length} entrée(s) de lock sans config :`)
      log.blank()
    }
    for (const {codocId, lock} of assoc.lockOrphans) {
      const kept = await handleLockOrphan(ctx, lock)
      if (kept) newPages[codocId] = kept
    }

    // Passe 1 - appariés.
    if (assoc.matched.length) {
      log.blank()
      log.info0(`${assoc.matched.length} doc(s) suivie(s) :`)
      log.blank()
    }
    for (const {entry, lock} of assoc.matched) {
      newPages[entry.codocId!] = await syncMatched(ctx, entry, lock)
    }

    // Passe 2 - nouvelles entrées yaml.
    if (assoc.yamlNew.length) {
      log.blank()
      log.info0(`${assoc.yamlNew.length} nouvelle(s) doc(s) :`)
      log.blank()
    }
    for (const entry of assoc.yamlNew) {
      const state = await syncNew(ctx, entry)
      if (state) newPages[entry.codocId!] = state
    }
  } finally {
    rl.close()
    await closeDrawioRenderer()
  }

  savePublishState({lastPublished: now, pages: newPages})
  log.endProcess(`codoc.lock mis à jour (${Object.keys(newPages).length} entrée(s)).`)
}
