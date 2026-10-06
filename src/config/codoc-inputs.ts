import {ConfirmInput, InputSpec} from '../services/resolve-inputs.js'
import {parsePageUrl} from '../use-cases/shared/parse-page-url.js'
import {confluenceEnvVarNames} from './codoc-config-atlassian.js'
import {RawAtlassianEnv} from './codoc-config-raw.js'

const ATLASSIAN_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'
const KADOC_REQUEST_URL = 'https://kleegroup.atlassian.net/servicedesk/customer/portal/27/group/230'
const ATLASSIAN_TOKEN_STEPS = `Pour les membres de KleeGroup : ${KADOC_REQUEST_URL} -> Demande d'utilisation clé API -> ${ATLASSIAN_TOKEN_URL} -> Créer un jeton d'API`
const SYNC_CONFIRM_FIX = '--confirm ou --no-confirm'

function checkUrl(raw: string): string {
  if (!URL.canParse(raw)) throw new Error(`URL invalide : "${raw}".`)
  return raw
}

function checkPageUrl(raw: string): string {
  parsePageUrl(raw)
  return raw
}

export const INPUTS = {
  docPath: {
    kind: 'text',
    label: 'Chemin local de la doc',
    message: 'Chemin local de la doc (.md) ou du dossier :',
    fix: 'codoc publish <chemin>',
  },
  pageUrl: {
    kind: 'text',
    label: 'URL de la page Confluence',
    message: 'URL de la page Confluence :',
    fix: 'codoc pull <url>',
    parse: checkPageUrl,
  },
  adHocBaseUrl: {
    kind: 'text',
    label: 'URL de base Confluence',
    message: 'Aucun environnement configuré : URL de base Confluence cible (ex. https://votreorg.atlassian.net) :',
    fix: '--parent-page <url>, ou atlassian.environments dans codoc.yaml',
    parse: checkUrl,
  },
  parentPage: {
    kind: 'text',
    label: 'Page parente',
    message: 'URL de la page Confluence parente (vide pour aucun parent) :',
    fix: '--parent-page <url>',
    parse: checkPageUrl,
  },
  targetEnv: {
    kind: 'select',
    label: 'Environnement Confluence cible',
    message: 'Environnement Confluence cible :',
    fix: '--parent-page <url>',
  },
  pageEnv: {
    kind: 'select',
    label: 'Environnement de la page',
    message: 'Lequel ?',
    fix: 'codoc pull <url>',
  },
  keepExisting: {
    kind: 'confirm',
    label: 'Config existante',
    message: 'Garder la config existante (les valeurs ci-dessous serviront de défaut) ?',
    fix: '--keep-existing ou --no-keep-existing',
  },
  asFolder: {
    kind: 'confirm',
    label: 'Import du dossier',
    message: 'Importer tout le dossier (toutes les sous-pages/sous-dossiers) ?',
    fix: '--as-folder ou --no-as-folder',
  },
  title: {
    kind: 'text',
    label: 'Titre de la page Confluence',
    message: 'Titre de la page Confluence :',
    fix: '--title <titre>',
  },
  prefix: {
    kind: 'text',
    label: 'Préfixe du titre',
    message: 'Préfixe du titre de la page Confluence (optionnel) :',
    fix: '--prefix <préfixe>',
  },
  maintainedIn: {
    kind: 'select',
    label: 'maintainedIn',
    message: 'Maintenue côté code ou confluence pour les prochains sync ?',
    fix: '--maintained-in <code|confluence>',
    choices: [
      {name: 'code - le .md local fait foi', value: 'code'},
      {name: 'confluence - la page Confluence fait foi', value: 'confluence'},
    ],
  },
  localPath: {
    kind: 'text',
    label: 'Chemin local du fichier .md',
    message: 'Chemin local du fichier .md :',
    fix: '--local-path <chemin>',
  },
  localFolder: {
    kind: 'text',
    label: 'Dossier local de destination',
    message: 'Dossier local de destination :',
    fix: '--local-path <dossier>',
  },
  parentPageId: {
    kind: 'text',
    label: 'parentPageId',
    message: 'parentPageId Confluence :',
    fix: 'à saisir en console',
  },
  folderParentPageId: {
    kind: 'text',
    label: 'parentPageId',
    message: 'parentPageId Confluence (page parente du dossier) :',
    fix: 'à saisir en console',
  },
  imagesDir: {
    kind: 'text',
    label: 'Dossier des images',
    message: 'Dossier local pour les images (vide pour ignorer) :',
    fix: '--images-dir <chemin>',
  },
  agentTargets: {
    kind: 'checklist',
    label: 'Cible(s)',
    message: 'Générer le contexte agent pour quelle(s) cible(s) ?',
    fix: '--target <clé>',
  },
} satisfies Record<string, InputSpec>

function credentialInputs(envKey: string, userHint: string, tokenHint: string) {
  const {userVar, tokenVar} = confluenceEnvVarNames(envKey)
  return {
    username: {kind: 'text', label: userVar, env: [userVar], hint: userHint, fix: '.env-codoc'},
    apiToken: {
      kind: 'secret',
      label: tokenVar,
      env: [tokenVar],
      hint: tokenHint,
      generateUrl: ATLASSIAN_TOKEN_STEPS,
      fix: '.env-codoc',
    },
  } satisfies Record<string, InputSpec>
}

export function confluenceInputs(envKey: string) {
  const envPath = ['atlassian', 'environments', envKey]
  return {
    baseUrl: {
      kind: 'text',
      label: `atlassian.environments.${envKey}.baseUrl`,
      config: [...envPath, 'baseUrl'],
      hint: `URL du site Confluence de l'environnement "${envKey}", ex. https://votreorg.atlassian.net`,
      fix: 'codoc.yaml',
    },
    spaceKey: {
      kind: 'text',
      label: `atlassian.environments.${envKey}.spaceKey`,
      config: [...envPath, 'spaceKey'],
      hint: `Clé de l'espace Confluence de l'environnement "${envKey}".`,
      fix: 'codoc.yaml',
    },
    ...credentialInputs(
      envKey,
      `Identifiant Atlassian (email) pour l'environnement Confluence "${envKey}".`,
      `Token API Atlassian pour l'environnement Confluence "${envKey}".`,
    ),
  } satisfies Record<string, InputSpec>
}

export function confluenceAccessInputs(envs: Record<string, RawAtlassianEnv> | undefined): Record<string, InputSpec> {
  return Object.fromEntries(
    Object.keys(envs ?? {}).flatMap((envKey) =>
      Object.entries(confluenceInputs(envKey)).map(([id, spec]) => [`${envKey}.${id}`, spec]),
    ),
  )
}

export function adHocEnvInputs(envKey: string, baseUrl: string) {
  const envNote =
    `Environnement "${envKey}" (${baseUrl}) absent de codoc.yaml : sauvegardé dans .env-codoc si tu confirmes, ` +
    `mais restera inutilisable tant que \`atlassian.environments.${envKey}\` n'est pas aussi déclaré (on te le proposera après).`
  const spaceKeyFix = '--parent-page au format https://…/wiki/spaces/<clé>/pages/<id>'
  return {
    spaceKey: {
      kind: 'text',
      label: 'spaceKey',
      message: "Clé de l'espace Confluence cible (spaceKey) :",
      fix: spaceKeyFix,
    },
    isolatedSpaceKey: {
      kind: 'text',
      label: 'spaceKey',
      message: "Clé de l'espace Confluence (spaceKey) - optionnel pour un import isolé, Entrée pour ignorer :",
      fix: spaceKeyFix,
    },
    ...credentialInputs(
      envKey,
      `Identifiant Atlassian (email) pour "${baseUrl}". ${envNote}`,
      `Token API Atlassian pour "${baseUrl}". ${envNote}`,
    ),
    persist: {
      kind: 'confirm',
      label: `atlassian.environments.${envKey}`,
      message: `Ajouter l'environnement "${envKey}" (${baseUrl}) à codoc.yaml, pour réutiliser ces identifiants la prochaine fois ?`,
      fix: 'codoc.yaml',
    },
  } satisfies Record<string, InputSpec>
}

export function inConfigInputs(target: 'page' | 'replacement' | 'folder') {
  const messages = {
    page: "Ajouter cette doc à codoc.yaml (pour qu'elle soit synchronisée par `codoc sync`) ?",
    replacement: 'Mettre à jour la config codoc.yaml existante pour cette doc ?',
    folder: "Ajouter ce dossier à codoc.yaml (pour qu'il soit synchronisé par `codoc sync`) ?",
  }
  return {
    inConfig: {
      kind: 'confirm',
      label: 'Entrée codoc.yaml',
      message: messages[target],
      fix: '--in-config ou --no-in-config',
    },
  } satisfies Record<string, InputSpec>
}

export const syncDecisions = {
  deleteLocalDoc: (title: string, sourceFile: string): ConfirmInput => ({
    kind: 'confirm',
    label: `Suppression de ${sourceFile}`,
    message: `⚠️  "${title}" : page Confluence introuvable ET retirée de la config. Supprimer la doc locale "${sourceFile}" ? (perte définitive possible)`,
    fix: SYNC_CONFIRM_FIX,
  }),
  deleteRemotePage: (title: string, localMissing: boolean): ConfirmInput => ({
    kind: 'confirm',
    label: `Suppression de la page "${title}"`,
    message: `[DELETE] "${title}" retirée de la config. Supprimer la page Confluence distante${localMissing ? ' (doc locale absente - perte définitive possible)' : ''} ?`,
    fix: SYNC_CONFIRM_FIX,
  }),
  adoptPage: (title: string, url: string): ConfirmInput => ({
    kind: 'confirm',
    label: `Adoption de la page "${title}"`,
    message:
      `⚠️  Une page "${title}" existe déjà (hors de l'arborescence suivie dans codoc.lock) : ${url}\n` +
      `   L'adopter et écraser son contenu par celui généré localement ?`,
    fix: SYNC_CONFIRM_FIX,
  }),
}
