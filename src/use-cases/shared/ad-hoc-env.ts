import {adHocEnvInputs} from '../../config/codoc-inputs.js'
import {log} from '../../services/log/logger.js'
import {resolveInputs} from '../../services/resolve-inputs.js'
import {ConfluenceConfig} from '../../types/codoc-types.js'
import {addAtlassianEnvironment} from './codoc-yaml.js'
import {envKeyFromDomain} from './env-select.js'

export interface AdHocEnv {
  env: ConfluenceConfig
  key: string
  spaceKey: string
}

export async function resolveAdHocEnv(
  domain: string,
  existingKeys: string[],
  requireSpaceKey: boolean,
  knownSpaceKey?: string,
): Promise<AdHocEnv> {
  const key = envKeyFromDomain(domain, existingKeys)
  const baseUrl = `https://${domain}`

  log.blank()
  log.warning1(`Environnement "${key}" (${baseUrl}) absent de codoc.yaml - saisie ponctuelle pour cette commande.`)

  const urlSpaceKey = knownSpaceKey?.trim() || undefined
  if (urlSpaceKey) log.info1(`spaceKey "${urlSpaceKey}" déduit de l'URL.`)

  const answers = await resolveInputs(adHocEnvInputs(key, baseUrl), {
    spaceKey: {flag: urlSpaceKey, when: requireSpaceKey},
    isolatedSpaceKey: {flag: urlSpaceKey, optional: true, when: !requireSpaceKey},
    username: {},
    apiToken: {},
  })
  const spaceKey = answers.spaceKey ?? answers.isolatedSpaceKey ?? ''

  return {
    key,
    spaceKey,
    env: {
      key,
      baseUrl,
      username: answers.username,
      apiToken: answers.apiToken,
      spaceKey,
      jira: {},
      drawio: {macroName: 'drawio'},
    },
  }
}

export async function offerPersistAdHocEnv(adHoc: AdHocEnv): Promise<boolean> {
  const {key, env, spaceKey} = adHoc

  const {persist: add} = await resolveInputs(adHocEnvInputs(key, env.baseUrl), {persist: {suggested: true}})

  const manualHint =
    `atlassian.environments.${key} : baseUrl: ${env.baseUrl}` +
    (spaceKey ? `, spaceKey: ${spaceKey}` : ', spaceKey: <à renseigner>')

  if (!add) {
    log.warning1(
      `[SKIPPED] codoc.yaml non modifié - les identifiants restent dans .env-codoc mais sont inutilisables tant que ` +
        `tu n'ajoutes pas toi-même : ${manualHint}.`,
    )
    return false
  }

  const result = await addAtlassianEnvironment(key, env.baseUrl, spaceKey)
  if (result === 'manual') {
    log.warning1(`Structure de codoc.yaml non reconnue automatiquement - ajoute toi-même : ${manualHint}.`)
    return false
  }
  if (result === 'exists') {
    log.warning1(
      `Un environnement "${key}" existe déjà dans codoc.yaml - rien n'a été modifié. Vérifie qu'il correspond bien à ${env.baseUrl}.`,
    )
    return false
  }

  log.success1(`[${result === 'created' ? 'CRÉÉ' : 'UPDATED'}] codoc.yaml : environnement "${key}" ajouté.`)
  if (!spaceKey) {
    log.warning2(
      'spaceKey non renseigné - complète-le dans codoc.yaml avant un futur `codoc publish`/`codoc sync` sur cet environnement.',
    )
  }
  return true
}

/** Si un environnement ad-hoc est en jeu, propose de le persister ; renvoie false (à propager comme
 * un skip de l'intégration codoc.yaml) s'il n'a pas été persisté. */
export async function confirmPersistAdHocEnvOrSkip(adHoc: AdHocEnv | undefined): Promise<boolean> {
  if (!adHoc) return true

  const persisted = await offerPersistAdHocEnv(adHoc)
  if (!persisted) {
    log.warning1("[SKIPPED] Doc non ajoutée à codoc.yaml : son environnement n'y est pas déclaré.")
    return false
  }
  return true
}
