import path from 'path'

import {ConfluencePage} from '../../clients/confluence/clients/pages-client.js'
import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {pageUrl} from '../../clients/confluence/utils/confluence-url.js'
import {getCodocConfig, onlySingleEnv} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {generateRandomCodocId} from '../../services/codoc-id.js'
import {
  loadPublishState,
  makePageState,
  PublishState,
  savePublishState,
} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {slugify} from '../../services/slugify.js'
import {toPosixPath} from '../../services/files-service.js'
import {askWithDefault, createRl, resolveConfirm, resolveValue, Rl} from '../../services/prompt.js'
import {AppConfig, ConfluenceConfig, MaintainedIn} from '../../types/codoc-types.js'
import {EnvRegistry} from '../shared/confluence-client-registry.js'
import {appendToDocsConfig, buildYamlEntry, removeDocsConfigEntries} from '../shared/codoc-yaml.js'
import {selectEnvs} from '../shared/env-select.js'
import {closeDrawioRenderer} from '../../services/conversion/confluenceToMarkdown/diagrams/drawio-to-image.js'
import {fetchPageOrUndefined} from '../shared/fetch-page.js'
import {fetchFolderDescendants, pulledPagesToChildren, pullFolderToLocal} from '../shared/pull-folder.js'
import {renderRemotePageToLocal} from '../shared/render-remote-page.js'
import {cleanDocPath} from '../sync/sync-entries.js'
import {parsePageInput} from './parse-page-input.js'

export interface PullFlags {
  page?: string
  env?: string
  asFolder?: boolean
  keepExisting?: boolean
  inConfig?: boolean
  localPath?: string
  title?: string
  parentPageId?: string
  maintainedIn?: string
  imagesDir?: string
}

interface ExistingImport {
  codocId: string
  sourceFile: string
  title: string
  pageId: string
  matchedBy: 'id' | 'titre' | 'config'
  parentPageId?: string
  maintainedIn?: MaintainedIn
  imagesDir?: string
}

/**
 * Cherche un import existant pour cette page : d'abord dans le lock (par ID Confluence puis par titre),
 * sinon dans le yaml (par titre) - couvre le cas d'une entrée déjà configurée mais jamais encore synchronisée.
 */
function findExistingImport(
  config: AppConfig,
  state: PublishState,
  pageId: string,
  title: string,
): ExistingImport | undefined {
  const entries = Object.entries(state.pages)
  const byId = entries.find(([, p]) => p.confluencePageId === pageId)
  const lockMatch = byId ?? entries.find(([, p]) => p.title === title)

  const codocId = lockMatch?.[0] ?? config.docs.find((d) => d.confluence.title === title)?.codocId
  if (!codocId) return undefined

  const doc = config.docs.find((d) => d.codocId === codocId)
  const lockPage = lockMatch?.[1]

  return {
    codocId,
    sourceFile: doc ? cleanDocPath(doc.path) : lockPage!.sourceFile,
    title: doc?.confluence.title ?? lockPage?.title ?? title,
    pageId: lockPage?.confluencePageId ?? pageId,
    matchedBy: byId ? 'id' : lockMatch ? 'titre' : 'config',
    parentPageId: doc?.confluence.parentPageId,
    maintainedIn: doc?.maintainedIn ?? lockPage?.maintainedIn,
    imagesDir: doc?.imagesDir,
  }
}

interface ImportAnswers {
  localPath: string
  title: string
  parentPageId: string
  maintainedIn: MaintainedIn
  imagesDir?: string
}

/** Résout les informations d'import (chemin, titre, parent, maintien, images) : flag → config
 * (import existant si remplacement) → prompt. */
async function collectImportAnswers(
  rl: Rl,
  page: ConfluencePage,
  confluence: {defaultParentPageId?: string},
  existing: ExistingImport | undefined,
  replaceExisting: boolean,
  flags: PullFlags,
): Promise<ImportAnswers> {
  // En remplacement, la config existante (yaml) fait foi pour les défauts - pas seulement le chemin.
  const kept = replaceExisting ? existing : undefined

  const localPath = await resolveValue(rl, {
    flag: flags.localPath,
    config: kept?.sourceFile,
    prompt: 'Chemin local du fichier .md :',
    promptDefault: `doc/${slugify(page.title)}.md`,
  })
  if (!localPath.endsWith('.md')) throw new Error('Le chemin doit se terminer par .md')

  const title = await resolveValue(rl, {
    flag: flags.title,
    config: kept?.title,
    prompt: 'Titre de la page Confluence :',
    promptDefault: page.title,
  })

  const parentPageId = await resolveValue(rl, {
    flag: flags.parentPageId,
    config: kept?.parentPageId,
    prompt: 'parentPageId Confluence :',
    promptDefault: page.parentId ?? confluence.defaultParentPageId ?? '',
  })

  // code → le .md local fait foi ; confluence → la page Confluence fait foi.
  const maintainedInRaw = await resolveValue(rl, {
    flag: flags.maintainedIn,
    config: kept?.maintainedIn,
    prompt: 'Maintenue côté code ou confluence ? (code/confluence) :',
    promptDefault: 'confluence',
  })
  const maintainedIn: MaintainedIn = maintainedInRaw.trim().toLowerCase() === 'code' ? 'code' : 'confluence'

  // Toujours résolu (vide → ignore) : le téléchargeur ne fait rien si le XML n'en référence aucune.
  const imagesDirRaw = await resolveValue(rl, {
    flag: flags.imagesDir,
    config: kept?.imagesDir,
    prompt: 'Dossier local pour les images (vide pour ignorer) :',
    promptDefault: 'doc/img',
  })
  const imagesDir = imagesDirRaw.trim() || undefined

  return {localPath, title, parentPageId, maintainedIn, imagesDir}
}

/** Détermine l'environnement où se trouve la page (flag → URL → env unique → sonde chaque env). */
async function resolveEnvAndPage(
  rl: Rl,
  config: AppConfig,
  registry: EnvRegistry,
  domain: string | undefined,
  pageId: string,
  flagEnv: string | undefined,
): Promise<{env: ConfluenceConfig; page: ConfluencePage}> {
  const envs = config.atlassian.environments

  const fromEnv = async (e: ConfluenceConfig) => {
    const page = await fetchPageOrUndefined(registry.raw(e), pageId)
    if (!page) {
      throw new Error(`Page ${pageId} introuvable sur l'environnement "${e.key}" (${e.baseUrl}).`)
    }
    return {env: e, page}
  }

  // 0. Flag explicite : priorité absolue.
  if (flagEnv) return fromEnv(selectEnvs(config, flagEnv)[0])

  // 1. URL : l'environnement est donné par le domaine.
  if (domain) {
    const match = envs.find((e) => {
      try {
        return new URL(e.baseUrl).hostname === domain
      } catch {
        return false
      }
    })
    if (match) return fromEnv(match)
    log.blank()
    log.warning1(`Le domaine "${domain}" ne correspond à aucun environnement - détection automatique…`)
  }

  // 2. Un seul environnement → pas d'ambiguïté.
  const onlyEnv = onlySingleEnv(envs)
  if (onlyEnv) return fromEnv(onlyEnv)

  // 3. Multi-env : on cherche où la page existe réellement.
  log.info0(`Recherche de la page dans : ${envs.map((e) => e.key).join(', ')}…`)
  const found: Array<{env: ConfluenceConfig; page: ConfluencePage}> = []
  for (const e of envs) {
    const page = await fetchPageOrUndefined(registry.raw(e), pageId)
    if (page) found.push({env: e, page})
  }

  if (found.length === 0) {
    throw new Error(`Page ${pageId} introuvable dans aucun environnement (${envs.map((e) => e.key).join(', ')}).`)
  }
  if (found.length === 1) {
    log.success1(`Trouvée dans l'environnement "${found[0].env.key}".`)
    return found[0]
  }

  // Même ID présent dans plusieurs instances → on tranche par un prompt.
  log.warning1(`Page présente dans plusieurs environnements : ${found.map((f) => f.env.key).join(', ')}.`)
  const key = await askWithDefault(rl, 'Lequel ?', found[0].env.key)
  return found.find((f) => f.env.key === key) ?? found[0]
}

/** Import d'un dossier Confluence complet : chaque descendant en .md local, une seule entrée `path: folder/*` en yaml. */
async function pullFolder(
  rl: Rl,
  client: ConfluenceClient,
  rootPage: ConfluencePage,
  rootType: 'folder' | 'page',
  flags: PullFlags,
): Promise<void> {
  const rawFolder = await resolveValue(rl, {
    flag: flags.localPath,
    prompt: 'Dossier local de destination :',
    promptDefault: `doc/${slugify(rootPage.title)}/`,
  })
  const localFolder = toPosixPath(rawFolder).replace(/\/?$/, '/')

  const parentPageId = await resolveValue(rl, {
    flag: flags.parentPageId,
    prompt: 'parentPageId Confluence (page parente du dossier) :',
    promptDefault: rootPage.parentId ?? client.configuration.defaultParentPageId ?? '',
  })

  const maintainedInRaw = await resolveValue(rl, {
    flag: flags.maintainedIn,
    prompt: 'Maintenue côté code ou confluence ? (code/confluence) :',
    promptDefault: 'confluence',
  })
  const maintainedIn: MaintainedIn = maintainedInRaw.trim().toLowerCase() === 'code' ? 'code' : 'confluence'

  const imagesDirRaw = await resolveValue(rl, {
    flag: flags.imagesDir,
    prompt: 'Dossier local pour les images (vide pour ignorer) :',
    promptDefault: 'doc/img',
  })
  const imagesDir = imagesDirRaw.trim() || undefined

  log.blank()
  log.step1('Récupération des sous-pages')
  const descendants = await fetchFolderDescendants(client, rootPage.id, rootType)
  const pages = descendants.filter((d) => d.type !== 'folder')
  log.info1(`${pages.length} page(s) trouvée(s) sous "${rootPage.title}"`)

  if (!pages.length) {
    log.warning1("Aucune sous-page - utilise l'import simple à la place.")
    return
  }

  const now = new Date().toISOString()
  const written = await pullFolderToLocal({
    confluenceClient: client,
    rootId: rootPage.id,
    rootType,
    localDir: localFolder,
    imagesDir,
    onPage: (page, index, total) => {
      log.blank()
      log.progress(index, total, page.title)
      log.success3(`[PULL] → ${page.localPath}`)
    },
    onPageError: ({title}, err, index, total) => {
      log.blank()
      log.progress(index, total, title)
      log.error3(`Échec "${title}" : ${(err as Error)?.message ?? err}`)
    },
  })

  // Le dossier est une UNITÉ : une entrée de lock (codocId + id racine) + `children` par page pullée (identité = id Confluence, pas le nom).
  const codocId = generateRandomCodocId()
  const folderDir = localFolder.replace(/\/$/, '')
  const state = loadPublishState()

  // Intégration dans codoc.yaml + codoc.lock : flag --in-config → prompt unique. Sur refus, les
  // fichiers locaux existent déjà sur disque mais rien n'est tracé (ni yaml ni lock) - usage
  // "utilitaire" volontairement hors suivi, sans comparaison future par ID.
  const addToConfig = await resolveConfirm(rl, {
    flag: flags.inConfig,
    question: "Ajouter ce dossier à codoc.yaml (pour qu'il soit synchronisé par `codoc sync`) ?",
    default: true,
  })
  if (addToConfig) {
    state.pages[codocId] = {
      ...makePageState({
        pageId: rootPage.id,
        environment: client.configuration.key,
        title: rootPage.title,
        url: pageUrl(client.configuration.baseUrl, client.configuration.spaceKey, rootPage.id),
        sourceFile: folderDir,
        maintainedIn,
        publishedAt: now,
        isFolder: true,
      }),
      children: pulledPagesToChildren(written, client.configuration.baseUrl, client.configuration.spaceKey),
    }
    state.lastPublished = state.lastPublished || now
    savePublishState(state)

    const yamlEntry = buildYamlEntry({
      localPath: `${localFolder}**`,
      title: rootPage.title,
      parentPageId,
      imagesDir,
      maintainedIn,
      env: client.configuration.key,
      codocId,
    })
    await appendToDocsConfig(yamlEntry)
  } else {
    log.warning1(
      '[SKIPPED] codoc.yaml et codoc.lock non modifiés - import ponctuel, hors suivi ' +
        '(pas de comparaison future par ID).',
    )
  }

  log.finalBanner('Import dossier terminé', {
    'Dossier local': localFolder,
    'Pages importées': `${written.length} / ${descendants.length}`,
    'Page racine': `${rootPage.id} - "${rootPage.title}"`,
    'Prochaine étape': addToConfig ? 'codoc sync' : '(hors suivi - codoc.yaml et codoc.lock non modifiés)',
  })
}

export async function pull(flags: PullFlags = {}): Promise<void> {
  // 1. Config + state (chargés une seule fois)
  const config = getCodocConfig()
  const state = loadPublishState()
  const registry = new EnvRegistry()
  const rl = createRl()

  try {
    log.startProcess('Import Confluence → local')

    // 2. URL ou ID Confluence : flag/arg → prompt
    const rawInput = await resolveValue(rl, {flag: flags.page, prompt: 'URL ou ID de la page Confluence :'})
    if (!rawInput) throw new Error('URL ou ID requis.')

    const parsed = parsePageInput(rawInput)
    const pageId = parsed.pageId

    // 3. Résolution env + récupération page (client testé une fois)
    log.blank()
    log.step1('Récupération de la page')

    const {env, page} = await resolveEnvAndPage(rl, config, registry, parsed.domain, pageId, flags.env)
    const client = await registry.connect(env)

    log.field('Environnement', `${env.key} (${env.baseUrl})`)
    log.blank()
    log.field('Titre    ', page.title)
    log.field('Parent ID', page.parentId ?? '(racine)')
    if (page.hasImages) log.field('Images   ', 'oui')

    // 4. Cas dossier - URL /folder/ direct (vrai dossier v2) ou proposition si sous-pages (page-dossier v1)
    if (parsed.isFolder) {
      await pullFolder(rl, client, page, 'folder', flags)
      return
    }
    // `page` est ici confirmée comme une page v1 (fetchPageOrUndefined a réussi) - ses sous-pages se listent
    // via l'API v1 (`pages`), et ses éventuels sous-dossiers via CQL (`folders.childrenFolders`) : l'API v1
    // de listage des enfants d'une page ne renvoie jamais de dossiers (v2), même si la page en contient un.
    const [subPages, subFolders] = await Promise.all([
      client.pages.fetchChildren(pageId),
      client.folders.childrenFolders(pageId),
    ])
    const childCount = subPages.length + subFolders.length
    if (childCount > 0) {
      log.blank()
      log.info1(`Cette page contient ${childCount} sous-élément(s) (${subPages.length} page(s), ${subFolders.length} dossier(s)).`)
      const asFolder = await resolveConfirm(rl, {
        flag: flags.asFolder,
        question: 'Importer tout le dossier (toutes les sous-pages/sous-dossiers) ?',
        default: true,
      })
      if (asFolder) {
        await pullFolder(rl, client, page, 'page', flags)
        return
      }
    }

    // 5. Détection doublon (même ID/titre dans le lock, ou déjà configuré dans le yaml) → propose de garder la config existante
    const existing = findExistingImport(config, state, pageId, page.title)
    let replaceExisting = false
    if (existing) {
      const matchLabel =
        existing.matchedBy === 'id' ? 'même ID Confluence' : existing.matchedBy === 'titre' ? 'même titre' : 'déjà dans codoc.yaml'
      log.blank()
      log.warning1(`Cette page semble déjà importée (${matchLabel}) :`)
      log.info4(`Fichier : ${existing.sourceFile}`)
      log.info4(`Titre   : ${existing.title}`)
      log.info4(`Page ID : ${existing.pageId}`)
      replaceExisting = await resolveConfirm(rl, {
        flag: flags.keepExisting,
        question: 'Garder la config existante (les valeurs ci-dessous serviront de défaut) ?',
        default: true,
      })
      if (!replaceExisting) {
        log.warning1("L'existant est conservé ; un nouvel import séparé est créé.")
      }
    }

    // 6. Saisies finales (chemin local, titre, maintenance, imagesDir)
    const {localPath, title, parentPageId, maintainedIn, imagesDir} = await collectImportAnswers(
      rl,
      page,
      env,
      existing,
      replaceExisting,
      flags,
    )

    // 7. Conversion + écriture .md
    log.blank()
    log.step1('Conversion en Markdown')

    await renderRemotePageToLocal(client, page, localPath, imagesDir)
    log.success1(`[PULL] Fichier sauvegardé : ${path.resolve(PROJECT_ROOT, localPath)}`)

    // 8. Intégration dans codoc.yaml + codoc.lock : flag --in-config → prompt unique en fin de
    // commande, que ce soit un remplacement ou un ajout. Sur refus, l'import a quand même eu lieu
    // (fichier local sur disque) mais rien n'est tracé nulle part (ni yaml ni lock) - usage
    // "utilitaire" volontairement hors suivi, sans comparaison future par ID. codocId réutilisé si
    // remplacement.
    const codocId = (replaceExisting && existing?.codocId) || generateRandomCodocId()
    const isReplacement = replaceExisting && Boolean(existing)

    const question = isReplacement
      ? 'Mettre à jour la config codoc.yaml existante pour cette doc ?'
      : "Ajouter cette doc à codoc.yaml (pour qu'elle soit synchronisée par `codoc sync`) ?"
    const addToConfig = await resolveConfirm(rl, {flag: flags.inConfig, question, default: true})

    if (addToConfig) {
      const entry = buildYamlEntry({localPath, title, parentPageId, imagesDir, maintainedIn, env: env.key, codocId})
      if (isReplacement && existing) {
        // Remplacement : retire l'ancienne entrée (et une éventuelle entrée au nouveau chemin) avant de réécrire.
        await removeDocsConfigEntries([existing.sourceFile, localPath])
        await appendToDocsConfig(entry)
        log.success1('[UPDATED] codoc.yaml : entrée remplacée')
      } else {
        await appendToDocsConfig(entry)
        log.success1('[UPDATED] codoc.yaml mis à jour')
      }

      // Remplacement avec changement de codocId → on retire l'ancienne entrée orpheline (lock uniquement).
      if (isReplacement && existing && existing.codocId !== codocId) {
        delete state.pages[existing.codocId]
      }
      const now = new Date().toISOString()
      state.pages[codocId] = makePageState({
        pageId,
        environment: env.key,
        title,
        url: pageUrl(env.baseUrl, env.spaceKey, pageId),
        sourceFile: localPath,
        maintainedIn,
        publishedAt: now,
      })
      state.lastPublished = state.lastPublished || now
      savePublishState(state)
      log.success1('[UPDATED] codoc.lock mis à jour')
    } else {
      log.warning1(
        '[SKIPPED] codoc.yaml et codoc.lock non modifiés - import ponctuel, hors suivi ' +
          '(pas de comparaison future par ID).',
      )
    }

    const maintainedHint =
      maintainedIn === 'confluence'
        ? `${maintainedIn} (Confluence fait foi → sync régénère le .md local)`
        : `${maintainedIn} (le code fait foi → sync régénère la page Confluence)`
    const nextSteps = addToConfig
      ? `1. Révise le Markdown généré dans ${localPath}\n2. Lance codoc sync pour re-synchroniser`
      : `1. Révise le Markdown généré dans ${localPath}\n2. Import hors suivi - codoc.yaml et codoc.lock non modifiés`
    log.finalBanner('Import terminé', {
      'Fichier local': localPath,
      'Page Confluence': `${pageId} - "${title}"`,
      Maintien: maintainedHint,
      'Prochaines étapes': nextSteps,
    })
  } finally {
    rl.close()
    await closeDrawioRenderer()
  }
}
