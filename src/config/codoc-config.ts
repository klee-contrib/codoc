import {
  AppConfig,
  DocEntryConfig,
  GitLabConfig,
} from '../types/codoc-types.js'
import {hasNoAtlassianEnvironments, parseAtlassianEnvironments} from './codoc-config-atlassian.js'
import {
  asStringList,
  loadRawConfig,
  RawDocEntry,
  RawGitLab,
  RawKeywordOverride,
} from './codoc-config-raw.js'

export {onlySingleEnv, resolveDocEnvironmentByKey as resolveDocEnvironment} from './codoc-config-atlassian.js'

let cache: AppConfig | undefined

function parseGitlab(raw: RawGitLab | undefined): GitLabConfig {
  return {baseUrl: raw?.baseUrl, defaultBranch: raw?.defaultBranch}
}

/** Ignore les overrides sans `path`, ou dont les `keywords` sont vides une fois normalisés. */
function parseKeywordOverrides(raw: RawKeywordOverride[] | undefined): DocEntryConfig['keywordOverrides'] {
  return (raw ?? [])
    .map((o) => ({path: o.path, keywords: asStringList(o.keywords)}))
    .filter((o): o is {path: string; keywords: string[]} => Boolean(o.path) && o.keywords.length > 0)
}

function parseDocs(raw: RawDocEntry[] | undefined): DocEntryConfig[] {
  return (raw ?? []).map((doc) => ({
    codocId: doc.codocId?.toString(),
    path: doc.path,
    maintainedIn: doc.maintainedIn === 'confluence' ? 'confluence' : 'code',
    env: doc.env,
    imagesDir: doc.imagesDir,
    keywords: asStringList(doc.keywords),
    keywordOverrides: parseKeywordOverrides(doc.keywordOverrides),
    generateSummary: doc.generateSummary ?? true,
    confluence: {
      title: doc.confluence?.title,
      parentPageId: doc.confluence?.parentPageId?.toString(),
      titlePrefix: doc.confluence?.titlePrefix,
    },
  }))
}

export function getGitlabConfig(): GitLabConfig {
  return parseGitlab(loadRawConfig().gitlab)
}

export function getCodocConfig(): AppConfig {
  if (cache) return cache

  const raw = loadRawConfig({required: true})

  cache = {
    atlassian: {environments: parseAtlassianEnvironments(raw)},
    gitlab: parseGitlab(raw.gitlab),
    docs: parseDocs(raw.docs),
  }

  return cache
}

export function getCodocConfigOrEmpty(): AppConfig {
  const raw = loadRawConfig()
  if (hasNoAtlassianEnvironments(raw)) {
    return {atlassian: {environments: []}, gitlab: parseGitlab(raw.gitlab), docs: parseDocs(raw.docs)}
  }
  return getCodocConfig()
}

/** À appeler après toute écriture de codoc.yaml en cours de process (ex. ajout d'un environnement ad-hoc),
 * pour qu'un prochain appel relise le fichier au lieu de servir l'état pré-écriture. */
export function resetCodocConfigCache(): void {
  cache = undefined
}
