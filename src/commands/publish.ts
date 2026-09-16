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
    'in-config': Flags.boolean({
      allowNo: true,
      description:
        "Ajoute l'entrée codoc.yaml de cette doc. --no-in-config publie sans toucher ni à " +
        'codoc.yaml ni à codoc.lock (publication ponctuelle, non suivie par `codoc sync`). ' +
        'Non fourni : demande en fin de commande.',
    }),
    'keep-existing': Flags.boolean({
      allowNo: true,
      description:
        "Si une entrée codoc.yaml existe déjà pour ce chemin, la met à jour en place (--keep-existing, " +
        'valeurs existantes comme défauts) ou en crée une séparée (--no-keep-existing). ' +
        'Non fourni : demande le cas échéant.',
    }),
    'parent-page': Flags.string({
      description:
        'URL de la page Confluence parente cible ("" pour aucun parent). Par défaut : celle de la config ' +
        'existante, sinon prompt. L’environnement est déduit de son domaine.',
    }),
    title: Flags.string({
      description: 'Titre de la page Confluence (fichier unique uniquement). Par défaut : celui de la config existante, sinon le H1 du fichier.',
    }),
    'maintained-in': Flags.string({
      options: ['code', 'confluence'],
      description:
        'Source de vérité enregistrée pour les prochains `codoc sync` : code → le .md local fait foi ; ' +
        'confluence → la page fait foi. Par défaut : code. N’affecte pas cette publication elle-même ' +
        '(toujours un envoi local → Confluence).',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(Publish)

    await ensureEnvVars(confluenceEnvRequirements(loadRawConfig().atlassian?.environments))

    await publish(args.path ?? '', {
      inConfig: flags['in-config'],
      keepExisting: flags['keep-existing'],
      parentPage: flags['parent-page'],
      title: flags.title,
      maintainedIn: flags['maintained-in'],
    })
  }
}
