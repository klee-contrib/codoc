// publish - Publie une doc locale (fichier ou dossier) vers Confluence et l'ajoute à codoc.yaml (symétrique de `pull`).

import path from 'path'

import {getCodocConfig} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {generateRandomCodocId} from '../../services/codoc-id.js'
import {loadPublishState, savePublishState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {fileExists, isDirectory, readFile, toPosixPath} from '../../services/files-service.js'
import {getDefaultBranch} from '../../services/git/default-branch.js'
import {ask, createRl, resolveConfirm, resolveValue, Rl} from '../../services/prompt.js'
import {AppConfig, ConfluenceConfig, DocEntryConfig} from '../../types/codoc-types.js'
import {expandDocEntry, extractH1} from '../shared/list-documents.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {appendToDocsConfig, buildYamlEntry, removeDocsConfigEntries} from '../shared/codoc-yaml.js'
import {pickEnvInteractive, selectEnvs} from '../shared/env-select.js'
import {SyncCtx} from '../sync/sync-actions.js'
import {cleanDocPath, SyncEntry} from '../sync/sync-entries.js'
import {syncMatched, syncNew} from '../sync/sync-handlers.js'
import {parsePageInput} from '../pull/parse-page-input.js'

export interface PublishFlags {
  env?: string
  inConfig?: boolean
  parentPageId?: string
  title?: string
}

interface PublishInput {
  env: ConfluenceConfig
  codocId: string
  existingDoc?: DocEntryConfig
  relPath: string
  yamlPath: string
  abs: string
  isDir: boolean
  parentPageId?: string
  title?: string
  entry: SyncEntry
  syntheticDoc: DocEntryConfig
}

/** Environnement cible : flag → env de la config existante (si remplacement) → auto/prompt. */
async function resolveEnv(
  rl: Rl,
  config: AppConfig,
  flagEnv: string | undefined,
  existingDoc: DocEntryConfig | undefined,
): Promise<ConfluenceConfig> {
  const key = flagEnv || existingDoc?.env
  return key ? selectEnvs(config, key)[0] : pickEnvInteractive(rl, config)
}

/** Lit la cible (fichier ou dossier), valide, et résout chaque information (flag → config → prompt). */
async function collectPublishInput(
  rl: Rl,
  config: AppConfig,
  inputPath: string,
  flags: PublishFlags,
): Promise<PublishInput> {
  const raw = (inputPath || (await ask(rl, 'Chemin local de la doc (.md) ou du dossier :'))).trim()
  if (!raw) throw new Error('Chemin local requis.')

  const relPath = toPosixPath(raw).replace(/^\.\//, '').replace(/\/+$/, '')
  const abs = path.resolve(PROJECT_ROOT, relPath)
  if (!fileExists(abs)) throw new Error(`Introuvable : ${relPath}`)

  const isDir = isDirectory(abs)
  if (!isDir && !relPath.endsWith('.md')) {
    throw new Error('Le fichier doit être un .md (ou indique un dossier).')
  }
  const kind = isDir ? 'folder' : 'page'
  const yamlPath = isDir ? `${relPath}/**` : relPath

  const existingDoc = config.docs.find((d) => cleanDocPath(d.path) === relPath)
  if (existingDoc) log.warning1(`Une entrée codoc.yaml existe déjà pour "${existingDoc.path}".`)
  const codocId = existingDoc?.codocId ?? generateRandomCodocId()

  const env = await resolveEnv(rl, config, flags.env, existingDoc)

  const rawParentPageId = await resolveValue(rl, {
    flag: flags.parentPageId,
    config: existingDoc?.confluence.parentPageId,
    prompt: 'URL ou ID de la page Confluence parente :',
    promptDefault: env.defaultParentPageId ?? '',
  })
  const parentPageId = rawParentPageId ? parsePageInput(rawParentPageId).pageId : rawParentPageId

  let title: string | undefined
  if (!isDir) {
    const h1 = extractH1(readFile(abs))
    title = await resolveValue(rl, {
      flag: flags.title,
      config: existingDoc?.confluence.title,
      prompt: 'Titre de la page Confluence :',
      promptDefault: h1 ?? path.basename(abs, '.md'),
    })
  }

  const syntheticDoc: DocEntryConfig = {
    codocId,
    path: yamlPath,
    maintainedIn: 'code',
    env: env.key,
    generateSummary: existingDoc?.generateSummary ?? true,
    confluence: {title, parentPageId: parentPageId || undefined},
  }

  const entry: SyncEntry = {
    codocId,
    kind,
    path: yamlPath,
    localPath: abs,
    relPath,
    maintainedIn: 'code',
    env,
    parentPageId: parentPageId || undefined,
    title,
  }

  return {env, codocId, existingDoc, relPath, yamlPath, abs, isDir, parentPageId, title, entry, syntheticDoc}
}

/** Écrit/met à jour l'entrée yaml correspondant à la publication. */
async function persistYamlEntry(input: PublishInput): Promise<void> {
  const yamlEntry = buildYamlEntry({
    localPath: input.yamlPath,
    title: input.title,
    parentPageId: input.parentPageId,
    maintainedIn: 'code',
    env: input.env.key,
    codocId: input.codocId,
  })

  if (input.existingDoc) {
    await removeDocsConfigEntries([input.existingDoc.path])
    await appendToDocsConfig(yamlEntry)
    log.success1('[UPDATED] codoc.yaml : entrée mise à jour')
  } else {
    await appendToDocsConfig(yamlEntry)
    log.success1('[CREATED] codoc.yaml : entrée ajoutée')
  }
}

/** Intégration dans codoc.yaml : flag `--in-config` → prompt unique en fin de commande, que la doc
 * soit déjà suivie (mise à jour) ou nouvelle (ajout). Sur refus, la publication a quand même eu lieu -
 * ni l'entrée yaml ni le lock ne sont touchés (publication ponctuelle et "utilitaire", volontairement
 * hors suivi : aucune trace ne subsiste pour comparer un futur republish par ID). Retourne la décision
 * pour que l'appelant sache s'il doit aussi persister le lock. */
async function maybePersistYamlEntry(rl: Rl, input: PublishInput, inConfigFlag: boolean | undefined): Promise<boolean> {
  const question = input.existingDoc
    ? 'Mettre à jour la config codoc.yaml existante pour cette doc ?'
    : "Ajouter cette doc à codoc.yaml (pour qu'elle soit synchronisée par `codoc sync`) ?"
  const addToConfig = await resolveConfirm(rl, {flag: inConfigFlag, question, default: true})
  if (addToConfig) {
    await persistYamlEntry(input)
  } else {
    log.warning1(
      '[SKIPPED] codoc.yaml et codoc.lock non modifiés - publication ponctuelle, hors suivi ' +
        '(pas de comparaison future par ID).',
    )
  }
  return addToConfig
}

export async function publish(inputPath: string, flags: PublishFlags = {}): Promise<void> {
  // 1. Config
  const config = getCodocConfig()
  const rl = createRl()

  try {
    log.startProcess('Publication local → Confluence')

    // 2. Validation + résolution des informations (flag → config → prompt)
    const input = await collectPublishInput(rl, config, inputPath, flags)

    // 3. Expansion des cibles (fichier unique, ou dossiers + pages pour un glob).
    const targets = await expandDocEntry(input.syntheticDoc, input.env)
    if (!targets.length) throw new Error(`Aucun fichier .md à publier sous "${input.relPath}".`)

    // 4. State + registry (clients par env)
    const state = loadPublishState()
    const now = new Date().toISOString()
    const ctx: SyncCtx = {
      config,
      generatedAt: now,
      registry: new EnvRegistry(),
      envByKey: new Map(config.atlassian.environments.map((e) => [e.key, e])),
      now,
      confirm: () => Promise.resolve(true),
      codeTargetsByCodocId: new Map([[input.codocId, targets]]),
      defaultBranch: await getDefaultBranch(),
    }

    // 5. Publication (throw explicite si titre déjà pris ailleurs ; sinon màj/création).
    log.blank()
    log.step1('Publication')
    const lockHit = state.pages[input.codocId]
    const published = lockHit ? await syncMatched(ctx, input.entry, lockHit) : await syncNew(ctx, input.entry)
    if (!published) throw new Error(`Aucun fichier .md à publier sous "${input.relPath}".`)

    // 6. Persistance yaml (résolue via --in-config) + lock, uniquement si on garde une trace de cette doc.
    const addToConfig = await maybePersistYamlEntry(rl, input, flags.inConfig)
    if (addToConfig) {
      state.pages[input.codocId] = published
      state.lastPublished = state.lastPublished || now
      savePublishState(state)
      log.success1('[UPDATED] codoc.lock mis à jour')
    }

    log.finalBanner('Publication terminée', {
      'Doc locale': input.yamlPath,
      Environnement: input.env.key,
      ...(input.isDir ? {'Pages publiées': String(targets.filter((t) => !t.isFolder).length)} : {Page: input.title}),
    })
  } finally {
    rl.close()
  }
}
