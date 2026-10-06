import {Command, Flags} from '@oclif/core'

import {loadRawConfig} from '../config/codoc-config-raw.js'
import {confluenceAccessInputs} from '../config/codoc-inputs.js'
import {requestAll, resolveInputs} from '../services/resolve-inputs.js'
import {sync} from '../use-cases/sync/sync.js'

export default class Sync extends Command {
  static description = 'Synchronise chaque doc locale et Confluence'

  static flags = {
    env: Flags.string({
      description: 'Ne synchronise que cet environnement Confluence (clé). Par défaut : tous.',
    }),
    confirm: Flags.boolean({
      char: 'f',
      allowNo: true,
      description:
        'Répond automatiquement aux suppressions de pages et adoptions de page en conflit de titre : ' +
        '--confirm accepte tout (CI), --no-confirm refuse tout (rien de risqué ne se fait). ' +
        'Non fourni : demande à chaque cas, comme en local.',
    }),
  }

  async run() {
    const {flags} = await this.parse(Sync)

    const access = confluenceAccessInputs(loadRawConfig().atlassian?.environments)
    await resolveInputs(access, requestAll(access))

    await sync({
      env: flags.env,
      confirm: flags.confirm,
    })
  }
}
