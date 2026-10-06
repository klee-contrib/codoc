import {DrawioConfig} from '../../../../types/codoc-types.js'
import {log} from '../../../log/logger.js'
import {preserveAsSentinel} from '../../shared/preserved-macros.js'
import {structuredMacro} from '../../shared/confluence-macro-builder.js'
import {toGitlabFileUrl} from '../../shared/gitlab-url.js'
import {MdLinkResolver, resolveConfluencePageLink} from '../../shared/confluence-page-link.js'
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
  resolveMdLink?: MdLinkResolver,
): {markdown: string; attachments: DrawioAttachment[]} {
  const re = /```mermaid\r?\n([\s\S]*?)```/g
  const total = [...markdown.matchAll(re)].length
  if (!total) return {markdown, attachments: []}

  const attachments: DrawioAttachment[] = []
  let i = 0

  const result = markdown.replace(re, (_full, mermaidBlock: string) => {
    const diagramName = total === 1 ? diagramBaseName : `${diagramBaseName}-${++i}`
    const filename = `${diagramName}.drawio`
    // Liens relatifs des nœuds réécrits en URL de la page Confluence cible (.md local publié) ou,
    // à défaut, en URL GitLab (draw.io publié ne peut résoudre ni l'un ni l'autre lui-même).
    const mermaidSrc = mermaidBlock.replace(
      /<a href='([^']*)'>/g,
      (_a, href: string) =>
        `<a href='${resolveConfluencePageLink(href, sourceFile, resolveMdLink) ?? toGitlabFileUrl(href, sourceFile, gitlab)}'>`,
    )
    const {xml: content, warnings} = mermaidToDrawio(mermaidSrc, diagramName)
    for (const w of warnings) log.warning2(`${sourceFile} (${diagramName}) : ${w}`)
    attachments.push({filename, content})

    return `\n\n${preserveAsSentinel(buildDrawioMacro(filename, cfg))}\n\n`
  })

  return {markdown: result, attachments}
}
