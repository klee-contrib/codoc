import {Args, Command, Flags} from '@oclif/core'

import {confluenceEnvRequirements} from '../config/codoc-config-atlassian.js'
import {loadRawConfig} from '../config/codoc-config-raw.js'
import {ensureEnvVars} from '../services/ensure-env.js'
import {publish} from '../use-cases/publish/publish.js'

export default class Publish extends Command {
  static description =
    'Publie une doc locale (fichier ou dossier) vers Confluence, avec ajout optionnel à codoc.yaml. ' +
    'Toute information non fournie en flag (ni déjà présente dans codoc.yaml) est demandée en console.'

  static args = {
    path: Args.string({
      description: 'Chemin local relatif de la doc .md ou du dossier à publier',
      required: false,
    }),
  }

  static flags = {
    env: Flags.string({
      description: 'Environnement Confluence cible (clé). Par défaut : celui de la config existante, sinon auto/prompt.',
    }),
    'in-config': Flags.boolean({
      allowNo: true,
      description:
        "Ajoute (ou met à jour) l'entrée codoc.yaml de cette doc. --no-in-config publie sans toucher ni à " +
        'codoc.yaml ni à codoc.lock (publication ponctuelle, non suivie par `codoc sync`). ' +
        'Non fourni : demande en fin de commande.',
    }),
    'parent-page-id': Flags.string({
      description: 'parentPageId Confluence cible. Par défaut : celui de la config existante ou defaultParentPageId de l’env.',
    }),
    title: Flags.string({
      description: 'Titre de la page Confluence (fichier unique uniquement). Par défaut : celui de la config existante, sinon le H1 du fichier.',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(Publish)

    await ensureEnvVars(confluenceEnvRequirements(loadRawConfig().atlassian?.environments))

    await publish(args.path ?? '', {
      env: flags.env,
      inConfig: flags['in-config'],
      parentPageId: flags['parent-page-id'],
      title: flags.title,
    })
  }
}
