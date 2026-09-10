import {PageState} from '../../services/lock/lock-file.js'
import {SyncEntry} from './sync-entries.js'

interface Association<T> {
  matched: Array<{entry: T; codocId: string; lock: PageState}>
  lockOrphans: Array<{codocId: string; lock: PageState}>
  yamlNew: T[]
}

/** Associe entrées yaml et entrées de lock par `codocId` (lock indexé directement par codocId). */
export function associateByCodocId<T extends {codocId?: string}>(
  lockPages: Record<string, PageState>,
  entries: T[],
): Association<T> {
  const entryIds = new Set<string>()
  const matched: Association<T>['matched'] = []
  const yamlNew: T[] = []

  for (const entry of entries) {
    if (!entry.codocId) {
      yamlNew.push(entry)
      continue
    }
    entryIds.add(entry.codocId)
    const lock = lockPages[entry.codocId]
    if (lock) matched.push({entry, codocId: entry.codocId, lock})
    else yamlNew.push(entry)
  }

  const lockOrphans = Object.entries(lockPages)
    .filter(([codocId]) => !entryIds.has(codocId))
    .map(([codocId, lock]) => ({codocId, lock}))

  return {matched, lockOrphans, yamlNew}
}

/** Valide AVANT toute mutation que chaque entrée yaml a un codocId (évite une mauvaise association silencieuse). */
export function validateCodocIds(entries: SyncEntry[]): void {
  const missing = entries.filter((e) => !e.codocId).map((e) => e.path)
  if (missing.length) {
    throw new Error(
      'codocId manquant dans codoc.yaml pour :\n' +
        missing.map((p) => `  - ${p}`).join('\n') +
        '\n→ Ajoute un codocId unique à chaque entrée `docs:`.',
    )
  }

  // Doublons dans le yaml - le lock, lui, est unique par construction (clés d'objet).
  const seen = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.codocId!)) {
      throw new Error(`codocId en double dans codoc.yaml : "${e.codocId}".`)
    }
    seen.add(e.codocId!)
  }
}
