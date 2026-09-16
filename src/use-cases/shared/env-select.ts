import {onlySingleEnv} from '../../config/codoc-config.js'
import {askWithDefault, Rl} from '../../services/prompt.js'
import {AppConfig, ConfluenceConfig} from '../../types/codoc-types.js'

/** Filtre `config.atlassian.environments` par clé ; lève si la clé est fournie mais inconnue. */
export function selectEnvs(config: AppConfig, envKey?: string): ConfluenceConfig[] {
  const envs = config.atlassian.environments
  if (!envKey) return envs

  const matched = envs.filter((e) => e.key === envKey)
  if (!matched.length) {
    throw new Error(`Environnement Confluence "${envKey}" inconnu. Définis : ${envs.map((e) => e.key).join(', ')}.`)
  }
  return matched
}

/** Choisit l'environnement Confluence cible (l'unique, sinon demande). */
export async function pickEnvInteractive(rl: Rl, config: AppConfig): Promise<ConfluenceConfig> {
  const envs = config.atlassian.environments
  const onlyEnv = onlySingleEnv(envs)
  if (onlyEnv) return onlyEnv

  const keys = envs.map((e) => e.key)
  const answer = await askWithDefault(rl, `Environnement Confluence cible (${keys.join(', ')}) :`, keys[0])
  return envs.find((e) => e.key === answer.trim()) ?? envs[0]
}

/** Trouve l'environnement dont le baseUrl a le même hostname que `domain`, ou undefined si aucun ne correspond. */
export function matchEnvByDomain(envs: ConfluenceConfig[], domain: string): ConfluenceConfig | undefined {
  return envs.find((e) => {
    try {
      return new URL(e.baseUrl).hostname === domain
    } catch {
      return false
    }
  })
}

export function envKeyFromDomain(domain: string, existingKeys: string[] = []): string {
  const label = domain.split('.')[0] || domain
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default'

  const taken = new Set(existingKeys)
  if (!taken.has(base)) return base

  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
}
