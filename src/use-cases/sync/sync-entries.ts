// Construction des SyncEntry (une par entrée `docs:` du yaml, env/parent/titre résolus).
// Type d'entrée déterminé par le suffixe du `path` : `/**` dossier, `/*` glob plat, sinon page.

import path from 'path'

import {resolveDocEnvironment} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {AppConfig, ConfluenceConfig, MaintainedIn} from '../../types/codoc-types.js'

export type SyncEntryKind = 'page' | 'glob' | 'folder'

// Type d'entrée d'après le suffixe du chemin yaml.
// Ex. `"docs/**"` → `"folder"`
export function entryKind(docPath: string): SyncEntryKind {
  if (docPath.endsWith('/**')) return 'folder'
  if (docPath.endsWith('/*')) return 'glob'
  if (docPath.endsWith('/')) return 'folder'
  return 'page'
}

/** Une entrée yaml résolue (env, parent, titre), prête pour le sync. */
export interface SyncEntry {
  codocId?: string
  kind: SyncEntryKind
  path: string
  localPath: string
  relPath: string
  maintainedIn: MaintainedIn
  env: ConfluenceConfig
  parentPageId?: string
  title?: string
  titlePrefix?: string
  imagesDir?: string
}

// Retire le suffixe glob/dossier (`/**`, `/*`, `/`) d'un chemin yaml.
// Ex. `"docs/**"` → `"docs"`
export function cleanDocPath(docPath: string): string {
  return docPath
    .replace(/\/\*\*$/, '')
    .replace(/\/\*$/, '')
    .replace(/\/$/, '')
}

// Construit une SyncEntry par entrée `docs:` du yaml (env/parent/titre résolus).
export function buildSyncEntries(config: AppConfig): SyncEntry[] {
  return config.docs.map((doc) => {
    const env = resolveDocEnvironment(config, doc)
    const relPath = cleanDocPath(doc.path)
    return {
      codocId: doc.codocId,
      kind: entryKind(doc.path),
      path: doc.path,
      localPath: path.resolve(PROJECT_ROOT, relPath),
      relPath,
      maintainedIn: doc.maintainedIn,
      env,
      parentPageId: doc.confluence.parentPageId ?? env.defaultParentPageId,
      title: doc.confluence.title,
      titlePrefix: doc.confluence.titlePrefix,
      imagesDir: doc.imagesDir,
    }
  })
}
