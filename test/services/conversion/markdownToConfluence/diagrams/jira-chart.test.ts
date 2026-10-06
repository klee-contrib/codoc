import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {manageJiraChartsInMarkdown} from '../../../../../src/services/conversion/markdownToConfluence/diagrams/jira-chart.js'

const JQL =
  'type = Bug AND project = SIG AND ("catégorisation[dropdown]" IN ("Développement - Production") OR "Bug de production[Radio Buttons]" = Oui) AND "Référent Développement[User Picker (single user)]" IN membersOf("klee")'
// Valeur exacte du paramètre `jql` enregistrée par Confluence dans la page "CDA2 - Calcul STA" pour ce graphique.
const CONFLUENCE_ENCODED_JQL =
  'type%20%3D%20Bug%20AND%20project%20%3D%20SIG%20AND%20(%22cat%C3%A9gorisation%5Bdropdown%5D%22%20IN%20(%22D%C3%A9veloppement%20-%20Production%22)%20OR%20%22Bug%20de%20production%5BRadio%20Buttons%5D%22%20%3D%20Oui)%20AND%20%22R%C3%A9f%C3%A9rent%20D%C3%A9veloppement%5BUser%20Picker%20(single%20user)%5D%22%20IN%20membersOf(%22klee%22)'
const SERVER_ID = 'ec6d1637-f9d6-3ae4-9d5e-9dce283383ea'

const block = (config: object) => `\`\`\`jira-chart\n${JSON.stringify(config)}\n\`\`\``

describe('manageJiraChartsInMarkdown', () => {
  it('remplace un bloc ```jira-chart par une sentinelle de macro jirachart préservée', () => {
    const result = manageJiraChartsInMarkdown(`# Titre\n\n${block({jql: JQL, serverId: SERVER_ID})}\n`)

    assert.match(result, /data-confluence-macro-preserved="1"/)
    assert.match(result, /jirachart/)
    assert.match(result, new RegExp(SERVER_ID))
    assert.doesNotMatch(result, /```jira-chart/)
  })

  it('encode la JQL exactement comme Confluence la stocke', () => {
    const result = manageJiraChartsInMarkdown(block({jql: JQL, serverId: SERVER_ID}))
    assert.ok(result.includes(CONFLUENCE_ENCODED_JQL), 'JQL encodée différente de celle de la page de référence')
  })

  it('applique les défauts du graphique "Créés vs résolus" (mensuel, cumulé, tendance, 180 jours)', () => {
    const result = manageJiraChartsInMarkdown(block({jql: JQL, serverId: SERVER_ID}))
    for (const expected of ['createdvsresolved', 'monthly', 'System Jira']) assert.ok(result.includes(expected), expected)
    assert.match(result, /daysprevious&quot;&gt;180|daysprevious"&gt;180/)
  })

  it('respecte les surcharges explicites (daysprevious, isCumulative...)', () => {
    const result = manageJiraChartsInMarkdown(block({jql: JQL, serverId: SERVER_ID, daysprevious: 250, isCumulative: false}))
    assert.match(result, /daysprevious&quot;&gt;250|daysprevious"&gt;250/)
    assert.match(result, /isCumulative&quot;&gt;false|isCumulative"&gt;false/)
  })

  it("retire l'image d'aperçu locale marquée <!-- jira-chart-preview --> juste avant le bloc (jamais publiée en double)", () => {
    const md = `### STA SIG\n\n<!-- jira-chart-preview -->\n![STA SIG](img/sta-sig.png)\n\n${block({jql: JQL, serverId: SERVER_ID})}\n`
    const result = manageJiraChartsInMarkdown(md)

    assert.doesNotMatch(result, /sta-sig\.png/)
    assert.doesNotMatch(result, /jira-chart-preview/)
    assert.match(result, /### STA SIG/)
    assert.match(result, /jirachart/)
  })

  it("retire l'image marquée même en CRLF", () => {
    const md = `<!-- jira-chart-preview -->\r\n![STA SIG](img/sta-sig.png)\r\n\r\n\`\`\`jira-chart\r\n${JSON.stringify({jql: JQL, serverId: SERVER_ID})}\r\n\`\`\`\r\n`
    const result = manageJiraChartsInMarkdown(md)
    assert.doesNotMatch(result, /sta-sig\.png/)
    assert.match(result, /jirachart/)
  })

  it("NE retire PAS une image collée juste avant le bloc si elle n'est pas précédée du marqueur", () => {
    const result = manageJiraChartsInMarkdown(`![Une image sans rapport](img/autre.png)\n\n${block({jql: JQL, serverId: SERVER_ID})}\n`)
    assert.match(result, /autre\.png/)
    assert.match(result, /jirachart/)
  })

  it('laisse le bloc tel quel si jql ou serverId manque, ou si le JSON est invalide', () => {
    for (const md of [block({serverId: SERVER_ID}), block({jql: JQL}), "```jira-chart\npas du JSON\n```"]) {
      assert.strictEqual(manageJiraChartsInMarkdown(md), md)
    }
  })

  it("ne fait rien sans bloc jira-chart", () => {
    const md = '# Titre\n\nRien à voir ici.\n'
    assert.strictEqual(manageJiraChartsInMarkdown(md), md)
  })
})
