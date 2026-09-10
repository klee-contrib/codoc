import {EnvRequirement} from '../services/ensure-env.js'
import {AppConfig, ConfluenceConfig, DocEntryConfig, DrawioConfig, JiraLinkConfig} from '../types/codoc-types.js'
import {RawAtlassianEnv, RawCodocConfig, RawDrawio, RawJira} from './codoc-config-raw.js'

const ATLASSIAN_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'
const KADOC_REQUEST_URL = 'https://kleegroup.atlassian.net/servicedesk/customer/portal/27/group/230'
/** Noms des variables d'env portant les identifiants Confluence d'un environnement donné. */
function confluenceEnvVarNames(key: string): {tokenVar: string; userVar: string} {
  const suffix = key.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return {userVar: `CONFLUENCE_${suffix}_USERNAME`, tokenVar: `CONFLUENCE_${suffix}_API_TOKEN`}
}

export function confluenceEnvRequirements(envs: Record<string, RawAtlassianEnv> | undefined): EnvRequirement[] {
  const keys = Object.keys(envs ?? {})

  return keys.flatMap((key) => {
    const {userVar, tokenVar} = confluenceEnvVarNames(key)
    return [
      {
        name: userVar,
        secret: false,
        hint: `Identifiant Atlassian (email) pour l'environnement Confluence "${key}".`,
      },
      {
        name: tokenVar,
        hint: `Token API Atlassian pour l'environnement Confluence "${key}".`,
        generateUrl: KADOC_REQUEST_URL + ' -> Demande d\'utilisation clé API -> ' + ATLASSIAN_TOKEN_URL + ' -> Créer un jeton d\'API',
      },
    ]
  })
}

/** Retourne l'environnement s'il n'y en a qu'un seul, sinon `undefined`. */
export function onlySingleEnv(envs: ConfluenceConfig[]): ConfluenceConfig | undefined {
  return envs.length === 1 ? envs[0] : undefined
}

/** Sous-ensemble de `jira:` utile à codoc (macro Jira Confluence) - un seul jeu de valeurs pour tous les environnements. */
function parseJiraLink(raw: RawJira | undefined): JiraLinkConfig {
  return {serverId: raw?.serverId?.toString(), server: raw?.server?.toString()}
}

function parseDrawio(raw: RawDrawio | undefined): DrawioConfig {
  return {
    macroName: raw?.macroName ?? 'drawio',
    width: raw?.width,
    edgeStyle: raw?.edgeStyle,
    edgeAnchor: raw?.edgeAnchor,
    colWidth: raw?.colWidth,
    rowStep: raw?.rowStep,
  }
}

function resolveAtlassianEnvironment(
  key: string,
  envYaml: RawAtlassianEnv | undefined,
  missing: string[],
  jira: JiraLinkConfig,
  drawio: DrawioConfig,
): ConfluenceConfig {
  const baseUrl = envYaml?.baseUrl
  const spaceKey = envYaml?.spaceKey

  const userVar = `CONFLUENCE_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_USERNAME`
  const tokenVar = `CONFLUENCE_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_TOKEN`
  const username = process.env[userVar]
  const apiToken = process.env[tokenVar]

  if (!baseUrl) missing.push(`atlassian.environments.${key}.baseUrl   → codoc.yaml`)
  if (!spaceKey) missing.push(`atlassian.environments.${key}.spaceKey  → codoc.yaml`)
  if (!username) missing.push(`${userVar} → .env-codoc`)
  if (!apiToken) missing.push(`${tokenVar} → .env-codoc`)

  return {
    key,
    baseUrl: baseUrl!,
    username: username!,
    apiToken: apiToken!,
    spaceKey: spaceKey!,
    defaultParentPageId: envYaml?.defaultParentPageId?.toString(),
    jira,
    drawio,
  }
}

export function parseAtlassianEnvironments(raw: RawCodocConfig): ConfluenceConfig[] {
  const missing: string[] = []
  const jira = parseJiraLink(raw.jira)
  const drawio = parseDrawio(raw.drawio)

  const envs = raw.atlassian?.environments
  if (!envs || !Object.keys(envs).length) {
    throw new Error(
      'Aucun environnement Atlassian défini : ajoute une section `atlassian.environments:` dans codoc.yaml.',
    )
  }

  const resolved = Object.entries(envs).map(([key, envYaml]) =>
    resolveAtlassianEnvironment(key, envYaml, missing, jira, drawio),
  )

  if (missing.length) {
    throw new Error(
      'Configuration Atlassian incomplète - valeurs manquantes :\n\n' + missing.map((m) => `  ${m}`).join('\n') + '\n',
    )
  }

  return resolved
}
export function resolveDocEnvironmentByKey(config: AppConfig, doc: DocEntryConfig): ConfluenceConfig {
  const envs = config.atlassian.environments
  if (doc.env) {
    const env = envs.find((e) => e.key === doc.env)
    if (!env) {
      throw new Error(
        `Document "${doc.path}" : environnement "${doc.env}" inconnu. ` +
          `Environnements définis : ${envs.map((e) => e.key).join(', ')}.`,
      )
    }
    return env
  }

  const onlyEnv = onlySingleEnv(envs)
  if (onlyEnv) return onlyEnv

  throw new Error(
    `Document "${doc.path}" : champ "env" requis (plusieurs environnements définis : ` +
      `${envs.map((e) => e.key).join(', ')}).`,
  )
}
