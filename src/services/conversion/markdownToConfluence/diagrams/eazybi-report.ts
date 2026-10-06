import {structuredMacro} from '../../shared/confluence-macro-builder.js'
import {preserveAsSentinel} from '../../shared/preserved-macros.js'
import {escapeAttr} from '../../shared/xml-escaping.js'

/** Config d'un bloc ```eazybi-report - seuls accountId/reportId sont requis, le reste a des défauts d'affichage. */
export interface EazybiReportConfig {
  accountId: string
  reportId: string
  /** Filtres de dimension "page" eazyBI, ex. `["[Project].[Dépositaires]"]` - voir l'export API eazyBI. */
  selectedPages?: string[]
  height?: number
  showHeader?: boolean
  showBorder?: boolean
  enableExport?: boolean
  collapsed?: boolean
  disableActions?: boolean
  allowedActions?: string
}

/**
 * Macro `jira-report-gadget` intégrant un rapport eazyBI EN DIRECT (pas une image figée) - mêmes
 * paramètres que ceux posés par l'éditeur Confluence quand on insère `{eazybi` manuellement (macro
 * native du gadget Jira/eazyBI, cf. reverse-engineering d'une page publiée existante).
 */
function buildEazybiReportMacro(config: EazybiReportConfig): string {
  const params = {
    account_id: config.accountId,
    report_id: config.reportId,
    height: String(config.height ?? 450),
    show_header: String(config.showHeader ?? true),
    show_border: String(config.showBorder ?? true),
    enable_export: String(config.enableExport ?? false),
    collapsed: String(config.collapsed ?? false),
    disable_actions: String(config.disableActions ?? false),
    allowed_actions: config.allowedActions ?? '',
    selected_pages: (config.selectedPages ?? []).join(','),
  }
  // escapeAttr (pas escapeXml) pour retrouver le même échappement des guillemets (&quot;) que Confluence
  // lui-même produit pour ce paramètre - cf. page de référence inspectée manuellement.
  return structuredMacro('jira-report-gadget', {
    schemaVersion: true,
    params: [['params', escapeAttr(JSON.stringify(params))]],
  })
}

// Le marqueur <!-- eazybi-preview --> déclare explicitement "l'image qui suit est un secours
// visuel local pour le rapport ci-dessous" - sans lui, une image collée par coïncidence avant un
// bloc ```eazybi-report ne serait jamais touchée (pas de règle de proximité implicite/fragile).
// `\s*` (pas `\r?\n+`) : couvre espaces/LF/CRLF indifféremment - une ligne vide en CRLF s'écrit
// `\r\n\r\n`, pas `\r\n\n`, et `\s` matche déjà `\r` et `\n` un par un sans construction dédiée.
const re = /(?:<!--\s*eazybi-preview\s*-->\s*!\[[^\]]*\]\([^)]*\)\s*)?```eazybi-report\r?\n([\s\S]*?)```/g

/** Blocs ```eazybi-report → macro `jira-report-gadget` (sentinelle) - rapport eazyBI vivant, pas une image. */
export function manageEazybiReportsInMarkdown(markdown: string): string {
  return markdown.replace(re, (full, jsonBlock: string) => {
    let config: Partial<EazybiReportConfig>
    try {
      config = JSON.parse(jsonBlock)
    } catch {
      return full // JSON invalide - on laisse le bloc (et l'image éventuelle) tel quel plutôt que de faire échouer tout le sync
    }

    if (!config.accountId || !config.reportId) return full

    return `\n\n${preserveAsSentinel(buildEazybiReportMacro(config as EazybiReportConfig))}\n\n`
  })
}
