import {Command, Flags} from '@oclif/core'

import {initAgentMdOnly, initCodoc} from '../use-cases/init/init.js'
import {printAgentMdSummary, printInitSummary} from '../services/log/init-printer.js'

export default class Init extends Command {
  static description =
    'Initialise la configuration codoc : codoc.yaml, .env-codoc, guide de démarrage. ' +
    'Avec --agent-md, ne génère que le guide agent IA (rien d\'autre).'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --agent-md',
  ]

  static flags = {
    'agent-md': Flags.boolean({
      default: false,
      description:
        'Ne génère QUE le guide agent IA basé sur `codoc.yaml` (qui doit déjà exister et être ' +
        'rempli) - au choix (via --agent-target, sinon celui déjà en place, sinon demandé) dans ' +
        '`.github/agents/codoc-agent.md` (fichier dédié) ou injecté en bloc dans ' +
        '`.github/copilot-instructions.md`. N\'affecte aucun autre fichier.',
    }),
    'agent-target': Flags.string({
      options: ['agent', 'copilot'],
      description:
        'Avec --agent-md : destination du guide (fichier dédié ou bloc copilot-instructions.md). ' +
        'Par défaut : celle déjà en place, sinon demandé.',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Init)

    if (flags['agent-md']) {
      printAgentMdSummary(await initAgentMdOnly(flags['agent-target']))
      return
    }

    const {docRelPath, created, skipped, warnings} = initCodoc()
    printInitSummary(created, skipped, warnings, docRelPath)
  }
}
