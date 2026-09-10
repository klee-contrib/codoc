import {marked} from 'marked'

import {DrawioConfig, JiraLinkConfig} from '../../../types/codoc-types.js'
import {structuredMacro} from '../shared/confluence-macro-builder.js'
import {escapeXml} from '../shared/xml-escaping.js'
import {renderTokens} from './render/blocks.js'
import {ConversionOptions, beginConversion, endConversion} from './conversion-state.js'
import {DrawioAttachment, manageMermaidsInMarkdownFile} from './diagrams/mermaid-diagrams.js'
import {buildConfluencePage} from './render/page.js'

export type {ConversionOptions} from './conversion-state.js'
export type {DrawioAttachment} from './diagrams/mermaid-diagrams.js'

/** 📅 YYYY-MM-DD → <time datetime="YYYY-MM-DD"/>. */
function restoreSpecialElements(xml: string): string {
  return xml.replace(/📅\s*(\d{4}-\d{2}-\d{2})/g, (_, date: string) => `<time datetime="${date}"/>`)
}

// <span data-confluence-status> → macro status native (post-traitement global, une fois le <span> réassemblé).
function restoreStatusMacros(xml: string): string {
  return xml.replace(
    /<span[^>]*\sdata-confluence-status="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi,
    (_, colour: string, inner: string) => {
      const title = inner.replace(/<[^>]+>/g, '').trim()
      return structuredMacro('status', {
        schemaVersion: true,
        params: [
          ['title', escapeXml(title)],
          ['colour', escapeXml(colour)],
        ],
      })
    },
  )
}

function cleanup(xml: string): string {
  return xml
    .replace(/[ \t]+\n/g, '\n') // espaces de fin de ligne
    .replace(/\n{3,}/g, '\n\n') // lignes vides multiples
    .replace(/<p>\s*<\/p>/g, '') // paragraphes vides
    .trim()
}

export function convertMarkdownToConfluence(markdown: string, options?: ConversionOptions): string {
  beginConversion(options ?? {})
  try {
    const tokens = marked.lexer(markdown, {gfm: true})
    return restoreSpecialElements(restoreStatusMacros(cleanup(renderTokens(tokens))))
  } finally {
    endConversion()
  }
}

export interface ConfluencePageOptions {
  /** Nom de base des pièces jointes .drawio générées (typiquement le nom du fichier sans extension). */
  diagramBaseName: string
  drawio: DrawioConfig
  /** Chemin relatif du .md source (réécriture des liens relatifs en URLs GitLab). */
  sourceFile: string
  jira?: JiraLinkConfig
  /** baseUrl + branche résolue par l'appelant (cf. `getDefaultBranch()`). */
  gitlab?: {baseUrl?: string; branch?: string}
  /** Horodatage ISO affiché dans le bandeau « Généré le … ». */
  generatedAt: string
  /** Génère le sommaire (macro toc) en haut de page (défaut : true). */
  generateSummary?: boolean
}

/** Sens publish : Markdown → page Confluence (Storage Format + pièces jointes). */
export function renderConfluencePage(
  markdown: string,
  options: ConfluencePageOptions,
): {xml: string; attachments: DrawioAttachment[]} {
  const {markdown: processed, attachments} = manageMermaidsInMarkdownFile(
    markdown,
    options.diagramBaseName,
    options.drawio,
    options.sourceFile,
    options.gitlab,
  )
  const body = convertMarkdownToConfluence(processed, {
    sourceFile: options.sourceFile,
    jira: options.jira,
    gitlab: options.gitlab,
  })
  return {xml: buildConfluencePage(body, options.generatedAt, options.generateSummary), attachments}
}
