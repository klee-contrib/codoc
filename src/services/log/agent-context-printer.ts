import {AgentContextResult} from '../../use-cases/agent-context/agent-context.js'
import {log} from './logger.js'

export function printAgentContextSummary(result: AgentContextResult): void {
  log.startProcess('Génération du contexte agent')

  if (result.created.length) {
    log.info0('Fichiers générés :')
    for (const f of result.created) log.success2(`[CREATED] ${f}`)
  }
  if (result.warnings.length) {
    log.blank()
    log.warning0('À regarder :')
    for (const w of result.warnings) log.warning2(w)
  }
  if (!result.created.length && !result.warnings.length) {
    log.info0('Aucune cible sélectionnée.')
  }

  log.blank()
}
