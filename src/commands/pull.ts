import {Args, Command, Flags} from '@oclif/core'

import {confluenceEnvRequirements} from '../config/codoc-config-atlassian.js'
import {loadRawConfig} from '../config/codoc-config-raw.js'
import {ensureEnvVars} from '../services/ensure-env.js'
import {pull} from '../use-cases/pull/pull.js'

export default class Pull extends Command {
  static description =
    'Importe une page Confluence en local, avec ajout optionnel à codoc.yaml. ' +
    'Toute information non fournie en flag (ni déjà présente dans codoc.yaml) est demandée en console.'

  static args = {
    page: Args.string({
      description: 'URL de la page Confluence à importer',
      required: false,
    }),
  }

  static flags = {
    'as-folder': Flags.boolean({
      allowNo: true,
      description:
        "Si la page a des sous-pages/sous-dossiers, importe tout le dossier (--as-folder) ou seulement " +
        'la page (--no-as-folder). Sans sous-élément, ignoré. Non fourni : demande le cas échéant.',
    }),
    'keep-existing': Flags.boolean({
      allowNo: true,
      description:
        'Si un import précédent est détecté (même ID/titre/config), le remplace (--keep-existing, ' +
        'valeurs existantes comme défauts) ou crée un import séparé (--no-keep-existing). Non fourni : demande le cas échéant.',
    }),
    'in-config': Flags.boolean({
      allowNo: true,
      description:
        "Ajoute l'entrée codoc.yaml de cette doc. --no-in-config importe sans toucher ni à " +
        'codoc.yaml ni à codoc.lock (import ponctuel, non suivi par `codoc sync`). ' +
        'Non fourni : demande en fin de commande.',
    }),
    'local-path': Flags.string({
      description: 'Chemin local du fichier .md (page unique) ou du dossier de destination (import dossier).',
    }),
    title: Flags.string({
      description: 'Titre de la page Confluence (page unique). Par défaut : celui de la config existante, sinon le titre Confluence.',
    }),
    'maintained-in': Flags.string({
      options: ['code', 'confluence'],
      description: 'code → le .md local fait foi ; confluence → la page Confluence fait foi. Par défaut : confluence.',
    }),
    'images-dir': Flags.string({
      description: 'Dossier local pour les images ("" pour désactiver). Par défaut : doc/img.',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(Pull)

    await ensureEnvVars(confluenceEnvRequirements(loadRawConfig().atlassian?.environments))

    await pull({
      page: args.page,
      asFolder: flags['as-folder'],
      keepExisting: flags['keep-existing'],
      inConfig: flags['in-config'],
      localPath: flags['local-path'],
      title: flags.title,
      maintainedIn: flags['maintained-in'],
      imagesDir: flags['images-dir'],
    })
  }
}
