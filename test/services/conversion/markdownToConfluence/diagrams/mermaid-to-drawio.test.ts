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

  describe('classDiagram', () => {
    it('rend une classe (nom en gras + champs) et une association avec cardinalités des deux côtés', () => {
      const {xml, warnings} = mermaidToDrawio(
        'classDiagram\nclass A{\n ID Id\n LIBELLE_100 Nom\n}\nclass B{\n ID Id\n}\nA "1" --> "0..*" B\n',
      )
      assert.deepEqual(warnings, [])
      assert.match(xml, /&lt;b&gt;A&lt;\/b&gt;&lt;br\/&gt;ID Id&lt;br\/&gt;LIBELLE_100 Nom/)
      assert.match(xml, /value="1 → 0\.\.\*"[^>]*source="A" target="B"/)
    })

    it('reproduit le cas réel signalé (depositaires/model/doc/vente-mdd.md) : reconnu, plus de warning', () => {
      const {warnings} = mermaidToDrawio(
        'classDiagram\n' +
          'class HistoriqueGenerationFichierOptile{\n ID Id\n}\n' +
          'class StatutGeneration{\n ID Id\n}\n' +
          'HistoriqueGenerationFichierOptile "0..1" --> "0..*" StatutGeneration\n',
      )
      assert.deepEqual(warnings, [])
    })

    it('reconnaît le stéréotype <<Enum>> et sa forme HTML-échappée &lt;&lt;Enum&gt;&gt; (telle que pull la stocke)', () => {
      const {xml} = mermaidToDrawio('classDiagram\nclass A{\n<<Enum>>\n DEP Déposé\n}\nclass B{\n&lt;&lt;Enum&gt;&gt;\n ERR Erreur\n}\n')
      assert.match(xml, /«Enum»&lt;br\/&gt;DEP Déposé/)
      assert.match(xml, /«Enum»&lt;br\/&gt;ERR Erreur/)
    })

    it("reconnaît l'héritage (`A <|-- B`), sans label", () => {
      const {xml, warnings} = mermaidToDrawio('classDiagram\nclass A{\n ID Id\n}\nclass B{\n ID Id\n}\nA <|--  B\n')
      assert.deepEqual(warnings, [])
      const edgeLine = xml.split('\n').find((l) => l.includes('edge="1"'))
      assert.ok(edgeLine)
      assert.doesNotMatch(edgeLine!, /value=/)
      assert.match(edgeLine!, /source="A" target="B"/)
    })

    it("reconnaît `class Nom:::style` (référence sans corps vers une classe d'un autre diagramme) comme déclaration du nœud", () => {
      const {xml, warnings} = mermaidToDrawio(
        'classDiagram\nclass A{\n ID Id\n}\nA "1" --> "0..*" B\nclass B:::fileReference\n',
      )
      assert.deepEqual(warnings, [])
      assert.match(xml, /source="A" target="B"/)
    })

    it('avertit (au lieu de l’ignorer en silence) sur une relation référençant une classe jamais déclarée', () => {
      const {warnings} = mermaidToDrawio('classDiagram\nclass A{\n ID Id\n}\nA "1" --> "0..*" B\n')
      assert.strictEqual(warnings.length, 1)
      assert.match(warnings[0], /"A --> B"/)
      assert.match(warnings[0], /B/)
    })

    it('avertit sur un type de relation non supporté (composition `*--`) au lieu de le faire disparaître', () => {
      const {xml, warnings} = mermaidToDrawio('classDiagram\nclass A{\n ID Id\n}\nclass B{\n ID Id\n}\nA "1" *-- "0..*" B\n')
      assert.strictEqual(warnings.length, 1)
      assert.doesNotMatch(xml, /source="A" target="B"/)
    })
  })

  describe('classDef / style : dashed (stroke-dasharray)', () => {
    const nodeLineFor = (xml: string, id: string) => xml.split('\n').find((l) => l.includes(`id="${id}"`))

    it('classDef avec fill+stroke+stroke-dasharray → dashed=1 sur le nœud, fill/stroke toujours corrects', () => {
      const {xml} = mermaidToDrawio(
        'flowchart LR\n  A["a"]\n  class A domainRef\n  classDef domainRef fill:#eee,stroke:#999,stroke-dasharray:5,5;\n',
      )
      const line = nodeLineFor(xml, 'A')
      assert.ok(line)
      assert.match(line!, /fillColor=#eee/)
      assert.match(line!, /strokeColor=#999/)
      assert.match(line!, /dashed=1/)
    })

    it('fill/stroke sans stroke-dasharray → pas de dashed (pas de faux positif)', () => {
      const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  style A fill:#fff,stroke:#333;\n')
      const line = nodeLineFor(xml, 'A')
      assert.ok(line)
      assert.doesNotMatch(line!, /dashed=1/)
    })

    it('stroke-dasharray seul (sans fill) → dashed=1 malgré l’absence de couleur', () => {
      const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  style A stroke-dasharray:4,2;\n')
      const line = nodeLineFor(xml, 'A')
      assert.ok(line)
      assert.match(line!, /dashed=1/)
      assert.doesNotMatch(line!, /fillColor=/)
    })

    it("un style inline sans mention de dasharray n'annule pas le dashed hérité de la classDef (précédence)", () => {
      const {xml} = mermaidToDrawio(
        'flowchart LR\n  A["a"]\n  class A domainRef\n  classDef domainRef stroke-dasharray:5,5;\n  style A fill:#fff;\n',
      )
      const line = nodeLineFor(xml, 'A')
      assert.ok(line)
      assert.match(line!, /dashed=1/)
      assert.match(line!, /fillColor=#fff/)
    })
  })

  describe('flèche en pointillés (-.->), ex. renvoi inter-domaines comu-tools', () => {
    const edgeLineFor = (xml: string, source: string, target: string) =>
      xml.split('\n').find((l) => l.includes(`source="${source}" target="${target}"`))

    it('reconnaît `A -.-> B` comme une arête valide, sans avertissement', () => {
      const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -.-> B\n')
      assert.deepEqual(warnings, [])
      assert.match(xml, /source="A" target="B"/)
    })

    it('rend la ligne de la flèche en pointillés (dashed=1 sur la cellule edge)', () => {
      const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -.-> B\n')
      const line = edgeLineFor(xml, 'A', 'B')
      assert.ok(line)
      assert.match(line!, /dashed=1/)
    })

    it("une arête pleine ordinaire n'a pas dashed=1 (pas de faux positif)", () => {
      const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A --> B\n')
      const line = edgeLineFor(xml, 'A', 'B')
      assert.ok(line)
      assert.doesNotMatch(line!, /dashed=1/)
    })

    it('un diagramme mêlant flèche pleine et pointillée style chacune indépendamment (pas de contamination croisée)', () => {
      const {xml} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  C["c"]\n  A --> B\n  B -.-> C\n')
      assert.doesNotMatch(edgeLineFor(xml, 'A', 'B') ?? '', /dashed=1/)
      assert.match(edgeLineFor(xml, 'B', 'C') ?? '', /dashed=1/)
    })

    it('avertit (au lieu de l’ignorer en silence) sur une flèche pointillée référençant un nœud jamais déclaré', () => {
      const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  A -.-> B\n')
      assert.strictEqual(warnings.length, 1)
      assert.doesNotMatch(xml, /source="A" target="B"/)
    })

    it("avertit sur une variante pointillée avec libellé (\"-. texte .->\", non supportée) au lieu de la perdre en silence", () => {
      const {xml, warnings} = mermaidToDrawio('flowchart LR\n  A["a"]\n  B["b"]\n  A -. Oui .-> B\n')
      assert.strictEqual(warnings.length, 1)
      assert.match(warnings[0], /non reconnue/)
      assert.doesNotMatch(xml, /source="A" target="B"/)
    })
  })
})
