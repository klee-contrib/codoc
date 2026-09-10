import {Command, Flags} from '@oclif/core'

import {confluenceEnvRequirements} from '../config/codoc-config-atlassian.js'
import {loadRawConfig} from '../config/codoc-config-raw.js'
import {ensureEnvVars} from '../services/ensure-env.js'
import {printDocsTree} from '../use-cases/tree/docs-tree.js'

export default class Tree extends Command {
  static description = 'Affiche l’arborescence des documents'

  static flags = {
    env: Flags.string({
      description: 'N’affiche que cet environnement Confluence (clé). Par défaut : tous.',
    }),
  }

  async run() {
    const {flags} = await this.parse(Tree)

    await ensureEnvVars(confluenceEnvRequirements(loadRawConfig().atlassian?.environments))

    await printDocsTree({env: flags.env})
  }
}
