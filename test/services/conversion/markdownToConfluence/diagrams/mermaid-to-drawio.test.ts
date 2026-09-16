import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {mermaidToDrawio} from '../../../../../src/services/conversion/markdownToConfluence/diagrams/mermaid-to-drawio.js'

describe('mermaidToDrawio', () => {
  it('relie deux nœuds déclarés par une arête nue, sans avertissement', () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A --> B\n')
    assert.deepEqual(warnings, [])
    assert.match(xml, /source="A" target="B"/)
  })

  it('préserve le label sur une arête `-->|label|` (forme pipe)', () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -->|Oui| B\n')
    assert.deepEqual(warnings, [])
    assert.match(xml, /value="Oui"[^>]*source="A" target="B"/)
  })

  it('préserve le label sur une arête `-- label -->` (forme médiane)', () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -- Oui --> B\n')
    assert.deepEqual(warnings, [])
    assert.match(xml, /value="Oui"[^>]*source="A" target="B"/)
  })

  it("avertit (au lieu de l'ignorer en silence) sur une arête référençant un nœud jamais déclaré", () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  A --> B\n')
    assert.strictEqual(warnings.length, 1)
    assert.match(warnings[0], /"A --> B"/)
    assert.match(warnings[0], /B/)
    assert.doesNotMatch(xml, /source="A" target="B"/)
  })

  it('ne rend que les arêtes valides quand un diagramme mélange arêtes connues et inconnues', () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A --> B\n  B --> C\n')
    assert.strictEqual(warnings.length, 1)
    assert.match(warnings[0], /"B --> C"/)
    assert.match(xml, /source="A" target="B"/)
    assert.doesNotMatch(xml, /target="C"/)
  })

  it("n'ajoute pas d'attribut value sur une arête sans label", () => {
    const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A --> B\n')
    const edgeLine = xml.split('\n').find((l) => l.includes('edge="1"'))
    assert.ok(edgeLine)
    assert.doesNotMatch(edgeLine!, /value=/)
  })

  it("avertit (au lieu de fabriquer une arête erronée) sur des arêtes chaînées sur une seule ligne (\"A --> B --> C\")", () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  C["c"]\n  A --> B --> C\n')
    assert.strictEqual(warnings.length, 1)
    assert.match(warnings[0], /"A --> B --> C"/)
    assert.doesNotMatch(xml, /source="A" target="C"/)
    assert.doesNotMatch(xml, /source="B" target="C"/)
    assert.doesNotMatch(xml, /source="A" target="B"/)
  })

  it("avertit sur un label contenant un \"|\" littéral au lieu de fabriquer une arête erronée", () => {
    const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -->|yes|no| B\n')
    assert.strictEqual(warnings.length, 1)
    assert.doesNotMatch(xml, /source="A" target="B"/)
  })
})
