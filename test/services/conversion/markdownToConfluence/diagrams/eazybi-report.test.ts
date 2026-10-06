import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {manageEazybiReportsInMarkdown} from '../../../../../src/services/conversion/markdownToConfluence/diagrams/eazybi-report.js'

describe('manageEazybiReportsInMarkdown', () => {
  it("détecte un bloc ```eazybi-report et le remplace par une sentinelle de macro préservée", () => {
    const md =
      '# Titre\n\n```eazybi-report\n{"accountId": "61396", "reportId": "4501556", "selectedPages": ["[Project].[Dépositaires]"]}\n```\n'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(result, /data-confluence-macro-preserved="1"/)
    assert.match(result, /jira-report-gadget/)
    assert.match(result, /61396/)
    assert.match(result, /4501556/)
    assert.doesNotMatch(result, /```eazybi-report/)
  })

  it("retire l'image markdown locale marquée <!-- eazybi-preview --> juste avant le bloc (secours visuel local, jamais publié en double)", () => {
    const md =
      '### Dépositaires\n\n<!-- eazybi-preview -->\n![QDVTMA - Dépositaires](img/qdvtma-depositaires.png)\n\n```eazybi-report\n{"accountId": "61396", "reportId": "4501556"}\n```\n'

    const result = manageEazybiReportsInMarkdown(md)

    assert.doesNotMatch(result, /qdvtma-depositaires\.png/)
    assert.doesNotMatch(result, /!\[/)
    assert.doesNotMatch(result, /eazybi-preview/)
    assert.match(result, /### Dépositaires/)
    assert.match(result, /jira-report-gadget/)
  })

  it("retire l'image marquée même en CRLF (une ligne vide s'écrit \\r\\n\\r\\n, pas \\r\\n\\n - piège qui a fait échouer une première version de la regex)", () => {
    const md =
      '### Dépositaires\r\n\r\n<!-- eazybi-preview -->\r\n![QDVTMA - Dépositaires](img/qdvtma-depositaires.png)\r\n\r\n```eazybi-report\r\n{"accountId": "61396", "reportId": "4501556"}\r\n```\r\n'

    const result = manageEazybiReportsInMarkdown(md)

    assert.doesNotMatch(result, /qdvtma-depositaires\.png/)
    assert.doesNotMatch(result, /!\[/)
    assert.match(result, /jira-report-gadget/)
  })

  it("NE retire PAS une image collée juste avant le bloc si elle n'est pas précédée du marqueur <!-- eazybi-preview --> (pas de règle de proximité implicite - évite qu'une image sans rapport, collée par coïncidence, disparaisse par erreur)", () => {
    const md =
      '![Une image sans rapport](img/autre-chose.png)\n\n```eazybi-report\n{"accountId": "61396", "reportId": "4501556"}\n```\n'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(result, /autre-chose\.png/)
    assert.match(result, /jira-report-gadget/)
  })

  it("ne retire pas une image marquée s'il y a un paragraphe entre elle et le bloc (le marqueur doit rester collé)", () => {
    const md =
      '<!-- eazybi-preview -->\n![QDVTMA - Dépositaires](img/qdvtma-depositaires.png)\n\nUn paragraphe entre les deux.\n\n```eazybi-report\n{"accountId": "61396", "reportId": "4501556"}\n```\n'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(result, /qdvtma-depositaires\.png/)
  })

  it("applique les valeurs par défaut (height, show_header, ...) quand elles ne sont pas fournies", () => {
    const md = '```eazybi-report\n{"accountId": "61396", "reportId": "4501556"}\n```'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(result, /height&amp;quot;:&amp;quot;450/)
    assert.match(result, /show_header&amp;quot;:&amp;quot;true/)
    assert.match(result, /show_border&amp;quot;:&amp;quot;true/)
    assert.match(result, /enable_export&amp;quot;:&amp;quot;false/)
  })

  it('respecte les surcharges explicites (height, showHeader, ...)', () => {
    const md = '```eazybi-report\n{"accountId": "61396", "reportId": "4501556", "height": 600, "showHeader": false}\n```'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(result, /height&amp;quot;:&amp;quot;600/)
    assert.match(result, /show_header&amp;quot;:&amp;quot;false/)
  })

  it("joint plusieurs selectedPages par une virgule (même syntaxe que l'export API eazyBI)", () => {
    const md =
      '```eazybi-report\n{"accountId": "61396", "reportId": "4501556", "selectedPages": ["[Project].[X]", "[Affected Version Majeure].[26.1]"]}\n```'

    const result = manageEazybiReportsInMarkdown(md)

    assert.match(
      result,
      /selected_pages&amp;quot;:&amp;quot;\[Project\]\.\[X\],\[Affected Version Majeure\]\.\[26\.1\]/,
    )
  })

  it('laisse le bloc tel quel si accountId ou reportId manque', () => {
    const md = '```eazybi-report\n{"reportId": "4501556"}\n```'
    assert.strictEqual(manageEazybiReportsInMarkdown(md), md)
  })

  it("laisse le bloc tel quel si le JSON est invalide (ne fait pas planter le sync)", () => {
    const md = "```eazybi-report\nceci n'est pas du JSON\n```"
    assert.strictEqual(manageEazybiReportsInMarkdown(md), md)
  })

  it("ne fait rien si aucun bloc eazybi-report n'est présent", () => {
    const md = '# Titre\n\nRien à voir ici.\n'
    assert.strictEqual(manageEazybiReportsInMarkdown(md), md)
  })
})
