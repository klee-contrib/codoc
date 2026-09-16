import {structuredMacro} from '../shared/confluence-macro-builder.js'
import {preserveRichContentAsSentinel} from '../shared/preserved-macros.js'
import {escapeXml} from '../shared/xml-escaping.js'

const RE_EXCERPT = /<!--\s*excerpt(?::([\w-]+))?\s*-->\r?\n?([\s\S]*?)<!--\s*\/excerpt\s*-->/g

/** Blocs `<!-- excerpt -->…<!-- /excerpt -->` → macro Confluence des extraits de page. */
export function manageExcerptsInMarkdown(markdown: string, renderFragment: (markdown: string) => string): string {
  return markdown.replace(RE_EXCERPT, (_full, name: string | undefined, inner: string) => {
    const body = renderFragment(inner.trim())
    const params: Array<[string, string]> = name ? [['name', escapeXml(name)]] : []
    const macro = structuredMacro('excerpt', {schemaVersion: true, params, richTextBody: body})
    return `\n\n${preserveRichContentAsSentinel(macro)}\n\n`
  })
}
