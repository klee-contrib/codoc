import {Command, Flags} from '@oclif/core'

import {printAgentContextSummary} from '../services/log/agent-context-printer.js'
import {agentContext, resolveAgentContextTargets} from '../use-cases/agent-context/agent-context.js'
import {AGENT_CONTEXT_TARGET_KEYS} from '../use-cases/agent-context/targets.js'

export default class AgentContext extends Command {
  static description =
    'Génère le contexte agent IA (basé sur `codoc.yaml`, qui doit déjà exister et être rempli) ' +
    'pour une ou plusieurs cibles : Copilot, VSCode agent, Claude, Kiro - écrase le fichier existant ' +
    'le cas échéant. Sans --target : demande interactivement quelle(s) cible(s) générer.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --target claude',
    '<%= config.bin %> <%= command.id %> --target copilot --target claude',
    '<%= config.bin %> <%= command.id %> --target copilot,claude,kiro',
  ]

  static flags = {
    target: Flags.string({
      options: AGENT_CONTEXT_TARGET_KEYS,
      multiple: true,
      delimiter: ',',
      description:
        'Cible(s) à générer : `copilot` (.github/copilot-instructions.md, bloc partagé), `agent` ' +
        '(.github/agents/codoc-agent.md, dédié), `claude` (CLAUDE.md, bloc partagé), `kiro` ' +
        '(.kiro/steering/codoc.md, dédié). Répétable (--target a --target b) et/ou liste séparée ' +
        'par des virgules (--target a,b). Sans ce flag : sélection interactive (requis hors terminal interactif).',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(AgentContext)
    const targets = await resolveAgentContextTargets(flags.target)
    printAgentContextSummary(agentContext(targets))
  }
}
