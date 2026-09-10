import fs from 'fs/promises'
import path from 'path'

import {getCodocConfig, resolveDocEnvironment} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {findLockedRef, loadPublishState, PublishState} from '../../services/lock/lock-file.js'
import {log} from '../../services/log/logger.js'
import {slugify} from '../../services/slugify.js'
import {collectFiles, readFile, toPosixPath} from '../../services/files-service.js'
import {ConfluenceConfig, DocEntryConfig, MaintainedIn} from '../../types/codoc-types.js'

// Markdown → texte du premier titre H1, s'il existe.
// Ex. `extractH1("# Titre du doc\n\ntexte")` → `"Titre du doc"`
export function extractH1(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

// Nom de fichier → titre de repli avec majuscule initiale.
// Ex. `capitalizeFirst("glossaire-cu")` → `"Glossaire-cu"`
function capitalizeFirst(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Vrai si le chemin yaml désigne un dossier/glob (`/**`, `/*` ou `/` final). */
function isFolderPath(docPath: string): boolean {
  return /\/\*\*?$/.test(docPath) || docPath.endsWith('/')
}

// Chemin yaml → chemin nettoyé + indicateur dossier, en séparant le marqueur (`/**`, `/*`, `/` final).
// Ex. `normalizeDocPath("doc/bl/**")` → `{cleanPath: "doc/bl", isFolder: true}`
function normalizeDocPath(docPath: string): {
  cleanPath: string
  isFolder: boolean
} {
  return {
    cleanPath: docPath.replace(/\/\*\*?$/, '').replace(/\/$/, ''),
    isFolder: isFolderPath(docPath),
  }
}

async function collectMarkdownFiles(docPath: string): Promise<string[]> {
  const {cleanPath, isFolder} = normalizeDocPath(docPath)
  const absPath = path.resolve(PROJECT_ROOT, cleanPath)

  let stat
  try {
    stat = await fs.stat(absPath)
  } catch {
    log.warning0(`Chemin introuvable : ${absPath}`)
    return []
  }

  return isFolder || stat.isDirectory() ? collectFiles(absPath, ['.md']) : [absPath]
}

/** Métadonnées d'une page Confluence planifiée (avant conversion). */
export interface DocTarget {
  codocId?: string
  sourceFile: string
  markdown: string
  id: string
  title: string
  parentPageId?: string
  imagesDir?: string
  maintainedIn: MaintainedIn
  env: ConfluenceConfig
  isFolder?: boolean
  parentFolderKey?: string
  keywords?: string[]
  generateSummary: boolean
}

// `sourceFile` + `overridePath` → vrai si le fichier est exactement ou sous ce chemin.
// Ex. `matchesOverridePath("doc/bl/sous/fichier.md", "doc/bl/sous")` → `true`
function matchesOverridePath(sourceFile: string, overridePath: string): boolean {
  const file = sourceFile.replace(/\.md$/, '')
  const override = overridePath.replace(/^\.\//, '').replace(/\.md$/, '').replace(/\/$/, '')
  return file === override || file.startsWith(`${override}/`)
}

// Entrée `docs:` + fichier → mots-clés du `keywordOverrides` le plus spécifique qui matche, sinon `keywords`.
// Ex. `resolveKeywords({keywords: ["bl"], keywordOverrides: [{path: "doc/bl/sous", keywords: ["bl","sous"]}]}, "doc/bl/sous/fichier.md")` → `["bl","sous"]`
function resolveKeywords(doc: DocEntryConfig, sourceFile: string): string[] | undefined {
  const matches = (doc.keywordOverrides ?? []).filter((o) => matchesOverridePath(sourceFile, o.path))
  if (!matches.length) return doc.keywords
  return matches.reduce((best, cur) => (cur.path.length > best.path.length ? cur : best)).keywords
}

/** Dérive les métadonnées (titre, id) d'une page à partir d'un fichier + son entrée de config. */
function deriveTarget(
  filePath: string,
  markdown: string,
  doc: DocEntryConfig,
  isSingleFile: boolean,
  env: ConfluenceConfig,
  lock: PublishState,
): DocTarget {
  const filenameWithoutExt = path.basename(filePath, '.md')
  const conf = doc.confluence
  const sourceFile = toPosixPath(path.relative(PROJECT_ROOT, filePath))

  // Pour `confluence`, le vrai titre vient du lock (dernier pull) - le H1 local peut être absent ou trompeur.
  const lockedTitle = doc.maintainedIn === 'confluence' ? findLockedRef(lock, env.key, sourceFile)?.title : undefined

  const baseTitle =
    (isSingleFile ? conf.title : undefined) ?? lockedTitle ?? extractH1(markdown) ?? capitalizeFirst(filenameWithoutExt)
  const title = `${conf.titlePrefix ?? ''}${baseTitle}${conf.titleSuffix ?? ''}`

  const id = slugify(filenameWithoutExt)

  return {
    codocId: doc.codocId,
    sourceFile,
    markdown,
    id,
    title,
    // Repli sur le parent par défaut de l'environnement cible.
    parentPageId: conf.parentPageId ?? env.defaultParentPageId,
    imagesDir: doc.imagesDir,
    maintainedIn: doc.maintainedIn,
    env,
    keywords: resolveKeywords(doc, sourceFile),
    generateSummary: doc.generateSummary,
  }
}

/** Génère les DocTarget "dossier" pour chaque sous-dossier intermédiaire (parents avant enfants) et mappe filePath → lockKey du parent. */
function buildFolderHierarchy(
  baseDirAbs: string,
  baseDirRel: string,
  files: string[],
  doc: DocEntryConfig,
  env: ConfluenceConfig,
): {folderTargets: DocTarget[]; fileParentKey: Map<string, string | undefined>} {
  const subdirs = new Set<string>()
  for (const file of files) {
    const rel = toPosixPath(path.relative(baseDirAbs, path.dirname(file)))
    if (!rel || rel === '.') continue
    const parts = rel.split('/')
    for (let i = 1; i <= parts.length; i++) subdirs.add(parts.slice(0, i).join('/'))
  }

  const sorted = [...subdirs].sort((a, b) => {
    const d = a.split('/').length - b.split('/').length
    return d !== 0 ? d : a.localeCompare(b)
  })

  const folderTargets: DocTarget[] = []
  const relDirToKey = new Map<string, string>()

  for (const relDir of sorted) {
    const dirRelFromProject = path.posix.join(baseDirRel, relDir)
    const folderName = relDir.split('/').pop()!
    const id = `folder:${slugify(dirRelFromProject)}`
    const fKey = `${env.key}:${id}`
    relDirToKey.set(relDir, fKey)

    const parentRelDir = relDir.includes('/') ? relDir.slice(0, relDir.lastIndexOf('/')) : undefined
    const parentFolderKey = parentRelDir ? relDirToKey.get(parentRelDir) : undefined

    const baseFolderTitle = capitalizeFirst(folderName)
    const folderTitle = `${doc.confluence.titlePrefix ?? ''}${baseFolderTitle}${doc.confluence.titleSuffix ?? ''}`

    folderTargets.push({
      codocId: doc.codocId,
      sourceFile: dirRelFromProject,
      markdown: '',
      id,
      title: folderTitle,
      parentPageId: doc.confluence.parentPageId ?? env.defaultParentPageId,
      imagesDir: undefined,
      maintainedIn: doc.maintainedIn,
      env,
      isFolder: true,
      parentFolderKey,
      keywords: resolveKeywords(doc, dirRelFromProject),
      generateSummary: doc.generateSummary,
    })
  }

  const fileParentKey = new Map<string, string | undefined>()
  for (const file of files) {
    const relToBase = toPosixPath(path.relative(baseDirAbs, file))
    const relDir = relToBase.includes('/') ? relToBase.slice(0, relToBase.lastIndexOf('/')) : '.'
    fileParentKey.set(file, relDir === '.' ? undefined : relDirToKey.get(relDir))
  }

  return {folderTargets, fileParentKey}
}

/** Énumère toutes les pages de codoc.yaml avec leurs métadonnées dérivées (sert au sync et à docsTree). */
export async function listDocumentTargets(): Promise<DocTarget[]> {
  const config = getCodocConfig()
  const lock = loadPublishState()
  const targets: DocTarget[] = []
  for (const doc of config.docs) {
    targets.push(...(await expandDocEntry(doc, resolveDocEnvironment(config, doc), lock)))
  }
  return targets
}

/** Étend UNE entrée `docs:` en ses cibles Confluence (1 pour un fichier ; dossiers + fichiers pour un glob). */
export async function expandDocEntry(
  doc: DocEntryConfig,
  env: ConfluenceConfig,
  lock: PublishState = loadPublishState(),
): Promise<DocTarget[]> {
  const targets: DocTarget[] = []

  if (doc.maintainedIn === 'confluence') {
    if (isFolderPath(doc.path)) {
      // Dossier confluence : glob des .md locaux écrits par le pull, même reconstruction de sous-dossiers que pour `code`.
      const files = await collectMarkdownFiles(doc.path)
      targets.push(...(await expandFolderGlobTargets(doc, env, files, lock)))
    } else {
      // Fichier unique : crée une cible même si le .md n'existe pas encore.
      const filePath = path.resolve(PROJECT_ROOT, normalizeDocPath(doc.path).cleanPath)
      let markdown = ''
      try {
        markdown = readFile(filePath)
      } catch {
        /* pas encore tiré depuis Confluence - le titre vient de la config */
      }
      targets.push(deriveTarget(filePath, markdown, doc, true, env, lock))
    }
    return targets
  }

  const files = await collectMarkdownFiles(doc.path)
  if (!files.length) return targets
  const isFolderGlob = isFolderPath(doc.path)
  const isSingleFile = !isFolderGlob && files.length === 1

  if (isFolderGlob) {
    targets.push(...(await expandFolderGlobTargets(doc, env, files, lock)))
  } else {
    for (const filePath of files) {
      targets.push(deriveTarget(filePath, readFile(filePath), doc, isSingleFile, env, lock))
    }
  }

  return targets
}

/** Étend un dossier (glob) en DocTarget "dossier" puis "fichier", chacun rattaché à son dossier local via `parentFolderKey`. */
async function expandFolderGlobTargets(
  doc: DocEntryConfig,
  env: ConfluenceConfig,
  files: string[],
  lock: PublishState,
): Promise<DocTarget[]> {
  const {cleanPath: baseDirRel} = normalizeDocPath(doc.path)
  const baseDirAbs = path.resolve(PROJECT_ROOT, baseDirRel)
  const {folderTargets, fileParentKey} = buildFolderHierarchy(baseDirAbs, baseDirRel, files, doc, env)

  const targets: DocTarget[] = [...folderTargets]
  for (const filePath of files) {
    const t = deriveTarget(filePath, readFile(filePath), doc, false, env, lock)
    targets.push({...t, parentFolderKey: fileParentKey.get(filePath)})
  }
  return targets
}
