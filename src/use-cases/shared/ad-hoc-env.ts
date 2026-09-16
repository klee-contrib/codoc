import {input} from '@inquirer/prompts'

import {apiTokenGenerateUrl, confluenceEnvVarNames} from '../../config/codoc-config-atlassian.js'
import {ensureEnvVar} from '../../services/ensure-env.js'
import {log} from '../../services/log/logger.js'
import {resolveConfirm, Rl} from '../../services/prompt.js'
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

  let spaceKey = knownSpaceKey?.trim() ?? ''
  if (spaceKey) {
    log.info1(`spaceKey "${spaceKey}" déduit de l'URL.`)
  } else {
    const spaceKeyRaw = await input({
      message: requireSpaceKey
        ? "  Clé de l'espace Confluence cible (spaceKey) :"
        : "  Clé de l'espace Confluence (spaceKey) - optionnel pour un import isolé, Entrée pour ignorer :",
    })
    spaceKey = spaceKeyRaw.trim()
  }
  if (requireSpaceKey && !spaceKey) {
    throw new Error('spaceKey requis pour publier sur un environnement non déclaré dans codoc.yaml.')
  }

  const {userVar, tokenVar} = confluenceEnvVarNames(key)
  const envNote = `Environnement "${key}" (${baseUrl}) absent de codoc.yaml : sauvegardé dans .env-codoc si tu confirmes, ` +
    `mais restera inutilisable tant que \`atlassian.environments.${key}\` n'est pas aussi déclaré (on te le proposera après).`

  const username = await ensureEnvVar(userVar, {secret: false, hint: `Identifiant Atlassian (email) pour "${baseUrl}". ${envNote}`})
  if (!username) throw new Error(`${userVar} requis pour interroger un environnement non déclaré dans codoc.yaml.`)

  const apiToken = await ensureEnvVar(tokenVar, {hint: `Token API Atlassian pour "${baseUrl}". ${envNote}`, generateUrl: apiTokenGenerateUrl()})
  if (!apiToken) throw new Error(`${tokenVar} requis pour interroger un environnement non déclaré dans codoc.yaml.`)

  return {
    key,
    spaceKey,
    env: {key, baseUrl, username, apiToken, spaceKey, jira: {}, drawio: {macroName: 'drawio'}},
  }
}

export async function offerPersistAdHocEnv(rl: Rl, adHoc: AdHocEnv): Promise<boolean> {
  const {key, env, spaceKey} = adHoc

  const add = await resolveConfirm(rl, {
    question: `Ajouter l'environnement "${key}" (${env.baseUrl}) à codoc.yaml, pour réutiliser ces identifiants la prochaine fois ?`,
    default: true,
  })

  const manualHint =
    `atlassian.environments.${key} : baseUrl: ${env.baseUrl}` + (spaceKey ? `, spaceKey: ${spaceKey}` : ', spaceKey: <à renseigner>')

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
    log.warning1(`Un environnement "${key}" existe déjà dans codoc.yaml - rien n'a été modifié. Vérifie qu'il correspond bien à ${env.baseUrl}.`)
    return false
  }

  log.success1(`[${result === 'created' ? 'CRÉÉ' : 'UPDATED'}] codoc.yaml : environnement "${key}" ajouté.`)
  if (!spaceKey) {
    log.warning2("spaceKey non renseigné - complète-le dans codoc.yaml avant un futur `codoc publish`/`codoc sync` sur cet environnement.")
  }
  return true
}

/** Si un environnement ad-hoc est en jeu, propose de le persister ; renvoie false (à propager comme
 * un skip de l'intégration codoc.yaml) s'il n'a pas été persisté. */
export async function confirmPersistAdHocEnvOrSkip(rl: Rl, adHoc: AdHocEnv | undefined): Promise<boolean> {
  if (!adHoc) return true

  const persisted = await offerPersistAdHocEnv(rl, adHoc)
  if (!persisted) {
    log.warning1("[SKIPPED] Doc non ajoutée à codoc.yaml : son environnement n'y est pas déclaré.")
    return false
  }
  return true
}
