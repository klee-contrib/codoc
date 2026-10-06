import {structuredMacro} from '../../shared/confluence-macro-builder.js'
import {preserveAsSentinel} from '../../shared/preserved-macros.js'
import {escapeXml} from '../../shared/xml-escaping.js'

/** Config d'un bloc ```jira-chart - seuls jql/serverId sont requis, le reste a les défauts du graphique "Créés vs résolus". */
export interface JiraChartConfig {
  jql: string
  /** Identifiant du lien d'application Confluence -> Jira (paramètre `serverId` de la macro, propre au site). */
  serverId: string
  server?: string
  chartType?: string
  periodName?: string
  daysprevious?: number
  isCumulative?: boolean
  showUnresolvedTrend?: boolean
  versionLabel?: string
  border?: boolean
  showinfor?: boolean
}

/**
 * Macro `jirachart` intégrant un graphique Jira EN DIRECT (pas une image figée) - mêmes paramètres,
 * dans le même ordre, que ceux posés par l'éditeur Confluence (cf. page de référence inspectée).
 * La JQL est encodée comme le fait Confluence (`encodeURIComponent`).
 */
function buildJiraChartMacro(config: JiraChartConfig): string {
  return structuredMacro('jirachart', {
    schemaVersion: true,
    params: [
      ['border', String(config.border ?? false)],
      ['server', escapeXml(config.server ?? 'System Jira')],
      ['jql', encodeURIComponent(config.jql)],
      ['showUnresolvedTrend', String(config.showUnresolvedTrend ?? true)],
      ['periodName', escapeXml(config.periodName ?? 'monthly')],
      ['isAuthenticated', 'true'],
      ['serverId', escapeXml(config.serverId)],
      ['showinfor', String(config.showinfor ?? true)],
      ['versionLabel', escapeXml(config.versionLabel ?? 'all')],
      ['isCumulative', String(config.isCumulative ?? true)],
      ['chartType', escapeXml(config.chartType ?? 'createdvsresolved')],
      ['daysprevious', String(config.daysprevious ?? 180)],
    ],
  })
}

// Même contrat que ```eazybi-report : le marqueur <!-- jira-chart-preview --> déclare explicitement
// "l'image qui suit est l'aperçu local du graphique ci-dessous" - elle est retirée à la publication,
// jamais une image non marquée. `\s*` couvre espaces/LF/CRLF.
const re = /(?:<!--\s*jira-chart-preview\s*-->\s*!\[[^\]]*\]\([^)]*\)\s*)?```jira-chart\r?\n([\s\S]*?)```/g

/** Blocs ```jira-chart → macro `jirachart` (sentinelle) - graphique Jira vivant, pas une image. */
export function manageJiraChartsInMarkdown(markdown: string): string {
  return markdown.replace(re, (full, jsonBlock: string) => {
    let config: Partial<JiraChartConfig>
    try {
      config = JSON.parse(jsonBlock)
    } catch {
      return full // JSON invalide - on laisse le bloc (et l'image éventuelle) tel quel plutôt que de faire échouer tout le sync
    }

    if (!config.jql || !config.serverId) return full

    return `\n\n${preserveAsSentinel(buildJiraChartMacro(config as JiraChartConfig))}\n\n`
  })
}
