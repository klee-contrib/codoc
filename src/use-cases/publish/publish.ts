// publish - Publie une doc locale (fichier ou dossier) vers Confluence et l'ajoute à codoc.yaml (symétrique de `pull`).

import path from 'path'

import {input} from '@inquirer/prompts'

import {getCodocConfigOrEmpty, onlySingleEnv} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {generateRandomCodocId} from '../../services/codoc-id.js'
import {loadPublishState, savePublishState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {fileExists, isDirectory, readFile, toPosixPath} from '../../services/files-service.js'
import {getDefaultBranch} from '../../services/git/default-branch.js'
import {ask, createRl, resolveConfirm, resolveValue, Rl} from '../../services/prompt.js'
import {AppConfig, ConfluenceConfig, DocEntryConfig, MaintainedIn} from '../../types/codoc-types.js'
import {expandDocEntry, extractH1} from '../shared/list-documents.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {appendToDocsConfig, buildYamlEntry, removeDocsConfigEntries} from '../shared/codoc-yaml.js'
import {matchEnvByDomain, pickEnvInteractive, selectEnvs} from '../shared/env-select.js'
import {AdHocEnv, confirmPersistAdHocEnvOrSkip, resolveAdHocEnv} from '../shared/ad-hoc-env.js'
import {SyncCtx} from '../sync/sync-actions.js'
import {cleanDocPath, SyncEntry} from '../sync/sync-entries.js'
import {syncMatched, syncNew} from '../sync/sync-handlers.js'
import {parsePageUrl} from '../shared/parse-page-url.js'

async function askAdHocBaseUrl(): Promise<string> {
  const raw = await input({message: '  Aucun environnement configuré : URL de base Confluence cible (ex. https://votreorg.atlassian.net) :'})
  if (!raw) throw new Error("URL de base Confluence requise en l'absence de tout environnement configuré.")
  try {
    return new URL(raw).hostname
  } catch {
    throw new Error(`URL invalide : "${raw}".`)
  }
}

export interface PublishFlags {
  inConfig?: boolean
  keepExisting?: boolean
  parentPage?: string
  title?: string
  maintainedIn?: string
}

interface PublishInput {
  env: ConfluenceConfig
  codocId: string
  existingDoc?: DocEntryConfig
  keepExisting: boolean
  relPath: string
  yamlPath: string
  abs: string
  isDir: boolean
  parentPageId?: string
  title?: string
  maintainedIn: MaintainedIn
  entry: SyncEntry
  syntheticDoc: DocEntryConfig
}

interface ParentAndEnv {
  env: ConfluenceConfig
  parentPageId: string
}

/** Depuis une URL brute (ou "" = aucun parent) : extrait le pageId et déduit l'env de son domaine. */
async function envAndParentFromRaw(rl: Rl, config: AppConfig, raw: string): Promise<ParentAndEnv> {
  if (!raw) return {env: await pickEnvInteractive(rl, config), parentPageId: ''}

  const {pageId, domain} = parsePageUrl(raw)
  const match = matchEnvByDomain(config.atlassian.environments, domain)
  if (match) return {env: match, parentPageId: pageId}

  log.blank()
  log.warning1(`Le domaine "${domain}" ne correspond à aucun environnement - sélection manuelle…`)
  return {env: await pickEnvInteractive(rl, config), parentPageId: pageId}
}

/**
 * Résout la page parente cible ET l'environnement en une seule étape : flag (URL) → config
 * conservée (--keep-existing) → prompt (URL, pré-rempli seulement si un unique environnement est
 * configuré). L'environnement se déduit du domaine de l'URL - sauf en cas de config conservée, où
 * il reste figé à celui déjà suivi (ne doit jamais changer silencieusement au gré d'une URL resaisie).
 */
async function resolveParentAndEnv(
  rl: Rl,
  config: AppConfig,
  flagParentPage: string | undefined,
  kept: DocEntryConfig | undefined,
  adHocEnv: ConfluenceConfig | undefined,
): Promise<ParentAndEnv> {
  if (adHocEnv) {
    if (flagParentPage !== undefined) {
      return {env: adHocEnv, parentPageId: flagParentPage ? parsePageUrl(flagParentPage).pageId : ''}
    }
    if (kept?.confluence.parentPageId !== undefined) return {env: adHocEnv, parentPageId: kept.confluence.parentPageId}
    const raw = await resolveValue(rl, {
      prompt: 'URL de la page Confluence parente ("" pour aucun parent) :',
      promptDefault: adHocEnv.defaultParentPageId,
    })
    return {env: adHocEnv, parentPageId: raw ? parsePageUrl(raw).pageId : ''}
  }

  // 1. Flag explicite : priorité absolue.
  if (flagParentPage !== undefined) return envAndParentFromRaw(rl, config, flagParentPage)

  // 2. Config conservée : l'env suit toujours kept.env, jamais une URL resaisie.
  if (kept) {
    const env = kept.env ? selectEnvs(config, kept.env)[0] : await pickEnvInteractive(rl, config)
    const keptParentPageId = kept.confluence.parentPageId
    if (keptParentPageId !== undefined) return {env, parentPageId: keptParentPageId}

    const raw = await resolveValue(rl, {
      prompt: 'URL de la page Confluence parente :',
      promptDefault: env.defaultParentPageId,
    })
    return {env, parentPageId: raw ? parsePageUrl(raw).pageId : raw}
  }

  // 3. Ni flag ni config conservée : prompt, pré-rempli seulement si un unique environnement existe.
  const singleEnv = onlySingleEnv(config.atlassian.environments)
  const raw = await resolveValue(rl, {
    prompt: 'URL de la page Confluence parente :',
    promptDefault: singleEnv?.defaultParentPageId,
  })
  return envAndParentFromRaw(rl, config, raw)
}

/** Lit la cible (fichier ou dossier), valide, et résout chaque information (flag → config → prompt). */
async function collectPublishInput(
  rl: Rl,
  config: AppConfig,
  inputPath: string,
  flags: PublishFlags,
  adHocEnv: ConfluenceConfig | undefined,
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
  let keepExisting = false
  if (existingDoc) {
    log.warning1(`Une entrée codoc.yaml existe déjà pour "${existingDoc.path}".`)
    log.info4(`Titre        : ${existingDoc.confluence.title ?? '(aucun)'}`)
    log.info4(`parentPageId : ${existingDoc.confluence.parentPageId ?? '(aucun)'}`)
    log.info4(`maintainedIn : ${existingDoc.maintainedIn}`)
    keepExisting = await resolveConfirm(rl, {
      flag: flags.keepExisting,
      question: 'Garder la config existante (les valeurs ci-dessous serviront de défaut) ?',
      default: true,
    })
    if (!keepExisting) {
      log.warning1("L'existant est conservé ; une nouvelle entrée séparée est créée.")
    }
  }
  const kept = keepExisting ? existingDoc : undefined

  const codocId = kept?.codocId ?? generateRandomCodocId()

  const {env, parentPageId: rawParentPageId} = await resolveParentAndEnv(rl, config, flags.parentPage, kept, adHocEnv)
  const parentPageId = rawParentPageId || undefined

  let title: string | undefined
  if (!isDir) {
    const h1 = extractH1(readFile(abs))
    title = await resolveValue(rl, {
      flag: flags.title,
      config: kept?.confluence.title,
      prompt: 'Titre de la page Confluence :',
      promptDefault: h1 ?? path.basename(abs, '.md'),
    })
  }

  // code → le .md local fait foi ; confluence → la page fait foi (source de vérité pour les
  // prochains `codoc sync` - n'affecte pas la publication en cours, toujours code → Confluence).
  const maintainedInRaw = await resolveValue(rl, {
    flag: flags.maintainedIn,
    config: kept?.maintainedIn,
    prompt: 'Maintenue côté code ou confluence pour les prochains sync ? (code/confluence) :',
    promptDefault: 'code',
  })
  const maintainedIn: MaintainedIn = maintainedInRaw.trim().toLowerCase() === 'confluence' ? 'confluence' : 'code'

  const syntheticDoc: DocEntryConfig = {
    codocId,
    path: yamlPath,
    maintainedIn,
    env: env.key,
    generateSummary: kept?.generateSummary ?? true,
    confluence: {title, parentPageId},
  }

  // entry.maintainedIn reste 'code' en dur, INDÉPENDAMMENT du maintainedIn résolu ci-dessus :
  // syncMatched/syncNew (sync-handlers.ts) lisent ce champ pour choisir la direction de sync
  // (code === push vers Confluence, confluence === rapatrie et écrase le fichier local). L'action
  // de `publish` est toujours un envoi local → Confluence ; seule l'entrée yaml persistée (et
  // syntheticDoc, pour l'expansion des cibles) enregistre la source de vérité pour les prochains sync.
  const entry: SyncEntry = {
    codocId,
    kind,
    path: yamlPath,
    localPath: abs,
    relPath,
    maintainedIn: 'code',
    env,
    parentPageId,
    title,
  }

  return {env, codocId, existingDoc, keepExisting, relPath, yamlPath, abs, isDir, parentPageId, title, maintainedIn, entry, syntheticDoc}
}

/** Écrit/met à jour l'entrée yaml correspondant à la publication. */
async function persistYamlEntry(input: PublishInput, isReplacement: boolean): Promise<void> {
  const yamlEntry = buildYamlEntry({
    localPath: input.yamlPath,
    title: input.title,
    parentPageId: input.parentPageId,
    maintainedIn: input.maintainedIn,
    env: input.env.key,
    codocId: input.codocId,
  })

  if (isReplacement && input.existingDoc) {
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
async function maybePersistYamlEntry(
  rl: Rl,
  input: PublishInput,
  inConfigFlag: boolean | undefined,
  adHoc: AdHocEnv | undefined,
): Promise<boolean> {
  if (!(await confirmPersistAdHocEnvOrSkip(rl, adHoc))) return false

  const isReplacement = input.keepExisting && Boolean(input.existingDoc)
  const question = isReplacement
    ? 'Mettre à jour la config codoc.yaml existante pour cette doc ?'
    : "Ajouter cette doc à codoc.yaml (pour qu'elle soit synchronisée par `codoc sync`) ?"
  const addToConfig = await resolveConfirm(rl, {flag: inConfigFlag, question, default: true})
  if (addToConfig) {
    await persistYamlEntry(input, isReplacement)
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
  const config = getCodocConfigOrEmpty()

  let adHoc: AdHocEnv | undefined
  if (config.atlassian.environments.length === 0) {
    const parsedParent = flags.parentPage ? parsePageUrl(flags.parentPage) : undefined
    const domain = parsedParent?.domain ?? (await askAdHocBaseUrl())
    adHoc = await resolveAdHocEnv(domain, [], true, parsedParent?.spaceKey)
  }

  const rl = createRl()

  try {
    log.startProcess('Publication local → Confluence')

    // 2. Validation + résolution des informations (flag → config → prompt)
    const input = await collectPublishInput(rl, config, inputPath, flags, adHoc?.env)

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
    const addToConfig = await maybePersistYamlEntry(rl, input, flags.inConfig, adHoc)
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
