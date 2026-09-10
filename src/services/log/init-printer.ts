import {AgentMdResult} from '../../use-cases/init/init.js'
import {ansi, log} from './logger.js'

export function printInitSummary(created: string[], skipped: string[], warnings: string[], docRelPath: string): void {
  log.startProcess('Initialisation de codoc')

  if (created.length) {
    log.info0('Fichiers générés :')
    for (const f of created) log.success2(`[CREATED] ${f}`)
  }
  if (skipped.length) {
    log.blank()
    log.info0('Déjà présents (non modifiés) :')
    for (const f of skipped) log.info2(`[UNCHANGED] ${f}`)
  }
  if (warnings.length) {
    log.blank()
    log.warning0('À regarder :')
    for (const w of warnings) log.warning2(w)
  }

  log.blank()
  log.info0(ansi.bold('Prochaines étapes :'))
  log.blank()
  log.raw(`  ${ansi.bold('1.')} Remplis ${ansi.cyan('codoc.yaml')}`)
  log.raw('       • atlassian.environments.<key>.baseUrl + spaceKey + defaultParentPageId')
  log.raw('       • gitlab.baseUrl / jira.serverId+server (optionnels - liens code et tickets dans les pages publiées)')
  log.blank()
  log.raw(`  ${ansi.bold('2.')} Renseigne tes identifiants dans ${ansi.cyan('.env-codoc')} (déjà ignoré par git si tu as un .gitignore standard)`)
  log.raw("       • CONFLUENCE_<CLÉ>_USERNAME, CONFLUENCE_<CLÉ>_API_TOKEN (préfixées par la clé de l'env, ex. CONFLUENCE_DEFAULT_USERNAME)")
  log.blank()
  log.raw(`  ${ansi.bold('3.')} Publie ton premier document :`)
  log.raw(`       ${ansi.dim('$')} codoc sync`)
  log.raw(`       → publie ${ansi.cyan(docRelPath)} sur Confluence`)
  log.blank()
  log.info0(ansi.dim(`Guide complet généré dans ${docRelPath}`))
  log.blank()
}

export function printAgentMdSummary(result: AgentMdResult): void {
  log.startProcess("Génération de l'agent-md")

  if (result.created.length) {
    log.info0('Fichier généré :')
    for (const f of result.created) log.success2(`[CREATED] ${f}`)
  }
  if (result.warnings.length) {
    log.blank()
    log.warning0('À regarder :')
    for (const w of result.warnings) log.warning2(w)
  }

  log.blank()
}
