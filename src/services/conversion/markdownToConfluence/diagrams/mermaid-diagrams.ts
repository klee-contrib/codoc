import {DrawioConfig} from '../../../../types/codoc-types.js'
import {log} from '../../../log/logger.js'
import {preserveAsSentinel} from '../../shared/preserved-macros.js'
import {structuredMacro} from '../../shared/confluence-macro-builder.js'
import {toGitlabFileUrl} from '../../shared/gitlab-url.js'
import {escapeXml} from '../../shared/xml-escaping.js'
import {mermaidToDrawio} from './mermaid-to-drawio.js'

/** Macro draw.io référençant `filename` - diagramName ET attachment doivent porter le nom exact, sinon « fichier introuvable ». */
function buildDrawioMacro(filename: string, cfg: DrawioConfig): string {
  const params: Array<[string, string]> = [
    ['diagramName', escapeXml(filename)],
    ['attachment', escapeXml(filename)],
    ['pageSize', 'false'],
  ]
  if (cfg.width) params.push(['width', String(cfg.width)])
  return structuredMacro(cfg.macroName, {schemaVersion: true, params})
}

export interface DrawioAttachment {
  filename: string
  content: string
}

/** Blocs ```mermaid → macro draw.io (sentinelle) dans le markdown + fichiers .drawio à uploader. */
export function manageMermaidsInMarkdownFile(
  markdown: string,
  diagramBaseName: string,
  cfg: DrawioConfig,
  sourceFile: string,
  gitlab?: {baseUrl?: string; branch?: string},
): {markdown: string; attachments: DrawioAttachment[]} {
  const matches = [...markdown.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)]
  if (!matches.length) return {markdown, attachments: []}

  const attachments: DrawioAttachment[] = []
  const parts: string[] = []
  let last = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const diagramName = matches.length === 1 ? diagramBaseName : `${diagramBaseName}-${i + 1}`
    const filename = `${diagramName}.drawio`
    // Liens relatifs des nœuds réécrits en URLs GitLab (draw.io publié ne peut pas les résoudre).
    const mermaidSrc = m[1].replace(
      /<a href='([^']*)'>/g,
      (_full, href: string) => `<a href='${toGitlabFileUrl(href, sourceFile, gitlab)}'>`,
    )
    const {xml: content, warnings} = mermaidToDrawio(mermaidSrc, diagramName, {
      edgeStyle: cfg.edgeStyle,
      edgeAnchor: cfg.edgeAnchor,
      colWidth: cfg.colWidth,
      rowStep: cfg.rowStep,
    })
    for (const w of warnings) log.warning2(`${sourceFile} (${diagramName}) : ${w}`)
    attachments.push({filename, content})

    const sentinel = preserveAsSentinel(buildDrawioMacro(filename, cfg))
    parts.push(markdown.slice(last, m.index), `\n\n${sentinel}\n\n`)
    last = m.index! + m[0].length
  }
  parts.push(markdown.slice(last))
  return {markdown: parts.join(''), attachments}
}
