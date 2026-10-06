import dagre from '@dagrejs/dagre'

import {escapeAttr} from '../../shared/xml-escaping.js'

// Mermaid (graph/flowchart, ou classDiagram) → XML draw.io. 3 étapes : parse → layout (positions) → rendu.
// Layout : colonnes par subgraph si présents, sinon dagre (même moteur de layout par rangs que
// Mermaid utilise lui-même en interne) - aucun réglage requis pour un résultat correct.
// classDiagram (parseClassDiagram) produit le même ParsedGraph qu'un flowchart (parseFlowchart) -
// layout et rendu ci-dessous sont entièrement partagés entre les deux.

// ════════════════════════════ Modèle ════════════════════════════

interface Node {
  id: string
  label: string // HTML (peut contenir <b>, <br/>, <a>)
  shape: 'rect' | 'stadium'
  group: number // index de subgraph (-1 si aucun)
  link?: string // URL (directive click)
  fill?: string // couleur de remplissage (directive style)
  stroke?: string
  dashed?: boolean // bordure en pointillés (directive style/classDef `stroke-dasharray`)
  size?: {width: number; height: number} // estimé depuis le texte (mode dagre uniquement) - voir estimateNodeSize
}

interface Group {
  id: string
  title: string
}

interface Edge {
  from: string
  to: string
  label?: string
  dashed?: boolean // ligne en pointillés (flèche mermaid `-.->`, ex. renvoi inter-domaines comu-tools)
}

interface ParsedGraph {
  groups: Group[]
  nodes: Node[]
  edges: Edge[]
  direction: string // LR | RL | TB | TD | BT
  droppedEdges: string[]
}

// ════════════════════════════ Parse ════════════════════════════

const RE_DIRECTION = /^(?:graph|flowchart)\s+(LR|RL|TB|TD|BT)/
const RE_SUBGRAPH = /^subgraph\s+(\w+)(?:\["([^"]*)"\])?/
const RE_NODE_STADIUM = /^(\w+)\(\["([\s\S]*)"\]\)$/
const RE_NODE_RECT = /^(\w+)\["([\s\S]*)"\]$/
const RE_EDGE = /^(\w+)\s*-->\s*(\w+)$/
const RE_EDGE_PIPE_LABEL = /^(\w+)\s*-->\s*\|([^|]*)\|\s*(\w+)$/
const RE_EDGE_MID_LABEL = /^(\w+)\s*--(?!>)\s*(.+?)\s*-->\s*(\w+)$/
// Flèche en pointillés (ex. renvoi inter-domaines comu-tools) - sans libellé, seule variante émise à ce jour.
const RE_EDGE_DASHED = /^(\w+)\s*-\.->\s*(\w+)$/
const RE_CLICK = /^click\s+(\w+)\s+href\s+"([^"]+)"/
const RE_STYLE = /^style\s+(\w+)\s+(.+)$/
const RE_CLASS_DEF = /^classDef\s+(\w+)\s+(.+)$/
const RE_CLASS = /^class\s+([\w,\s]+)\s+(\w+)\s*;?$/

// classDiagram (UML) - syntaxe Mermaid distincte de graph/flowchart ci-dessus (`class Nom{…}` en
// bloc multi-lignes, relations avec cardinalités entre guillemets). Sans rapport avec RE_CLASS_DEF/
// RE_CLASS ci-dessus, qui sont des directives de style flowchart (`classDef`/`class A,B style`).
const RE_CLASSDIAGRAM_HEADER = /^classDiagram\b/
const RE_UML_CLASS_START = /^class\s+(\w+)\s*\{$/
// `class Nom:::styleName` : référence à une classe sans corps (typiquement une classe définie dans
// un autre diagramme/fichier) - déclare le nœud (sans champs), le nom du style est ignoré en
// l'absence de `classDef` correspondant dans ces diagrammes.
const RE_UML_CLASS_CSS_REF = /^class\s+(\w+):::\w+$/
const RE_UML_STEREOTYPE = /^(?:<<(\w+)>>|&lt;&lt;(\w+)&gt;&gt;)$/
const RE_UML_ASSOC = /^(\w+)\s+"([^"]*)"\s*-->\s*"([^"]*)"\s*(\w+)$/
const RE_UML_INHERIT = /^(\w+)\s*<\|--\s*(\w+)$/

interface FillStroke {fill?: string; stroke?: string; dashed?: boolean}

/** Extrait `fill`, `stroke` et `stroke-dasharray` d'une chaîne de directive style (`fill:#xxx,stroke:#yyy,…`). */
function parseFillStroke(directive: string): FillStroke {
  return {
    fill: directive.match(/fill:\s*([^,;]+)/)?.[1]?.trim(),
    stroke: directive.match(/stroke:\s*([^,;]+)/)?.[1]?.trim(),
    // `|| undefined` important, pas cosmétique : sans lui, un style qui NE mentionne PAS
    // stroke-dasharray renverrait `dashed: false` (pas `undefined`), ce qui casserait la priorité
    // `inline?.dashed ?? fromClass?.dashed` ci-dessous (un style inline sans rapport avec le
    // pointillé écraserait silencieusement un `dashed: true` hérité d'un classDef).
    dashed: /stroke-dasharray\s*:/.test(directive) || undefined,
  }
}

/** Dispatch selon le type de diagramme, détecté sur sa première ligne significative. */
function parseMermaid(mermaid: string): ParsedGraph {
  const firstLine = mermaid
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('%%'))
  return firstLine && RE_CLASSDIAGRAM_HEADER.test(firstLine) ? parseClassDiagram(mermaid) : parseFlowchart(mermaid)
}

/** Cardinalités d'une association (`"0..1" --> "0..*"`) → libellé unique au milieu de l'arête. */
function classAssocLabel(fromMult: string, toMult: string): string | undefined {
  if (fromMult && toMult) return `${fromMult} → ${toMult}`
  return fromMult || toMult || undefined
}

/** Nœuds effectivement déclarés → arêtes valides (source ET cible connues) ; partagé flowchart/classDiagram. */
function splitValidEdges(nodes: Node[], edges: Edge[]): {known: Set<string>; validEdges: Edge[]; edgesMissingNodes: Edge[]} {
  const known = new Set(nodes.map((n) => n.id))
  return {
    known,
    validEdges: edges.filter((e) => known.has(e.from) && known.has(e.to)),
    edgesMissingNodes: edges.filter((e) => !(known.has(e.from) && known.has(e.to))),
  }
}

/**
 * `classDiagram` : classes (`class Nom{ … }`, bloc multi-lignes) → nœuds dont le libellé HTML liste
 * le nom (gras) puis chaque ligne du corps (stéréotype `<<Enum>>`/`&lt;&lt;Enum&gt;&gt;` en «Enum»,
 * champs tels quels). Relations reconnues : association avec cardinalités (`A "m1" --> "m2" B`) et
 * héritage (`A <|-- B`). Toute autre ligne évoquant une relation (`--`/`..`) est signalée plutôt que
 * silencieusement ignorée, comme pour un flowchart.
 */
function parseClassDiagram(mermaid: string): ParsedGraph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const unparsedEdgeLines: string[] = []
  let current: {id: string; parts: string[]} | undefined

  const flushCurrentClass = (): void => {
    if (!current) return
    nodes.push({id: current.id, label: current.parts.join('<br/>'), shape: 'rect', group: -1})
    current = undefined
  }

  for (const raw of mermaid.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('```') || line.startsWith('%%')) continue
    if (RE_CLASSDIAGRAM_HEADER.test(line) || line.startsWith('direction ')) continue

    if (current) {
      if (line === '}') {
        flushCurrentClass()
      } else {
        const stereotype = line.match(RE_UML_STEREOTYPE)
        current.parts.push(stereotype ? `«${stereotype[1] ?? stereotype[2]}»` : line)
      }
      continue
    }

    const classStart = line.match(RE_UML_CLASS_START)
    if (classStart) {
      current = {id: classStart[1], parts: [`<b>${classStart[1]}</b>`]}
      continue
    }

    const cssRef = line.match(RE_UML_CLASS_CSS_REF)
    if (cssRef) {
      nodes.push({id: cssRef[1], label: `<b>${cssRef[1]}</b>`, shape: 'rect', group: -1})
      continue
    }

    const assoc = line.match(RE_UML_ASSOC)
    if (assoc) {
      edges.push({from: assoc[1], to: assoc[4], label: classAssocLabel(assoc[2], assoc[3])})
      continue
    }

    const inherit = line.match(RE_UML_INHERIT)
    if (inherit) {
      edges.push({from: inherit[1], to: inherit[2]})
      continue
    }

    if (line.includes('--') || line.includes('..')) {
      unparsedEdgeLines.push(line)
    }
  }
  flushCurrentClass() // filet de sécurité si un bloc `class{` n'a jamais été refermé.

  const {known, validEdges, edgesMissingNodes} = splitValidEdges(nodes, edges)
  const droppedEdges = [
    ...edgesMissingNodes.map((e) => {
      const missing = [e.from, e.to].filter((id) => !known.has(id))
      return `relation "${e.from} --> ${e.to}" ignorée : classe(s) non déclarée(s) (${missing.join(', ')})`
    }),
    ...unparsedEdgeLines.map((line) => `ligne ignorée (syntaxe de relation non reconnue) : "${line}"`),
  ]

  return {groups: [], nodes, edges: validEdges, direction: 'LR', droppedEdges}
}

function parseFlowchart(mermaid: string): ParsedGraph {
  const groups: Group[] = []
  const nodes: Node[] = []
  const edges: Edge[] = []
  const unparsedEdgeLines: string[] = []
  const links = new Map<string, string>()
  const styles = new Map<string, FillStroke>()
  const classDefs = new Map<string, FillStroke>()
  const nodeClasses = new Map<string, string>() // nodeId → className
  const nodeById = new Map<string, Node>()
  let direction = 'LR'
  let currentGroup = -1

  for (const raw of mermaid.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('```') || line.startsWith('%%')) continue
    if (line.startsWith('direction ')) continue

    const dir = line.match(RE_DIRECTION)
    if (dir) {
      direction = dir[1]
      continue
    }
    if (line.startsWith('graph ') || line.startsWith('flowchart ')) continue

    const sg = line.match(RE_SUBGRAPH)
    if (sg) {
      currentGroup = groups.length
      groups.push({id: sg[1], title: sg[2] ?? sg[1]})
      continue
    }
    if (line === 'end') {
      currentGroup = -1
      continue
    }

    const click = line.match(RE_CLICK)
    if (click) {
      links.set(click[1], click[2])
      continue
    }

    // `classDef name fill:#xxx,stroke:#yyy,…` → mémorise la classe.
    const cdef = line.match(RE_CLASS_DEF)
    if (cdef) {
      classDefs.set(cdef[1], parseFillStroke(cdef[2]))
      continue
    }

    // `class A,B,C name` → associe les nœuds A, B, C à la classe `name`.
    const cls = line.match(RE_CLASS)
    if (cls) {
      const className = cls[2]
      for (const id of cls[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        nodeClasses.set(id, className)
      }
      continue
    }

    const st = line.match(RE_STYLE)
    if (st) {
      styles.set(st[1], parseFillStroke(st[2]))
      continue
    }

    const pipeLabel = line.match(RE_EDGE_PIPE_LABEL)
    const midLabel = pipeLabel ? null : line.match(RE_EDGE_MID_LABEL)
    const labelled = pipeLabel ?? midLabel
    if (labelled) {
      edges.push({from: labelled[1], to: labelled[3], label: labelled[2].trim() || undefined})
      continue
    }

    const edge = line.match(RE_EDGE)
    if (edge) {
      edges.push({from: edge[1], to: edge[2]})
      continue
    }

    const dashedEdge = line.match(RE_EDGE_DASHED)
    if (dashedEdge) {
      edges.push({from: dashedEdge[1], to: dashedEdge[2], dashed: true})
      continue
    }

    const stadium = line.match(RE_NODE_STADIUM)
    const rect = stadium ? null : line.match(RE_NODE_RECT)
    const m = stadium ?? rect
    if (m) {
      const node: Node = {id: m[1], label: m[2], shape: stadium ? 'stadium' : 'rect', group: currentGroup}
      nodes.push(node)
      nodeById.set(node.id, node)
      continue
    }

    // `.->` couvre aussi une variante pointillée avec libellé (ex. `A -. texte .-> B`), non supportée à ce
    // jour (aucun usage actuel) - signalée plutôt que silencieusement perdue, comme les autres arêtes non
    // reconnues ci-dessous.
    if (line.includes('-->') || line.includes('.->')) {
      unparsedEdgeLines.push(line)
    }
  }

  for (const [id, url] of links) {
    const n = nodeById.get(id)
    if (n) n.link = url
  }
  // Couleurs : priorité à `style A fill:…` (par-nœud), sinon classe via `class A name`.
  for (const n of nodes) {
    const inline = styles.get(n.id)
    const className = nodeClasses.get(n.id)
    const fromClass = className ? classDefs.get(className) : undefined
    n.fill = inline?.fill ?? fromClass?.fill
    n.stroke = inline?.stroke ?? fromClass?.stroke
    n.dashed = inline?.dashed ?? fromClass?.dashed
  }

  const {known, validEdges, edgesMissingNodes} = splitValidEdges(nodes, edges)
  const droppedEdges = [
    ...edgesMissingNodes.map((e) => {
      const missing = [e.from, e.to].filter((id) => !known.has(id))
      return `arête "${e.from} --> ${e.to}" ignorée : nœud(s) non déclaré(s) (${missing.join(', ')}) - déclarez-les avec ${missing[0]}["label"]`
    }),
    ...unparsedEdgeLines.map((line) => `ligne ignorée (syntaxe d'arête non reconnue, ex. arêtes chaînées ou label avec "|") : "${line}"`),
  ]

  return {groups, nodes, edges: validEdges, direction, droppedEdges}
}

// ════════════════════════════ Layout ════════════════════════════

interface DrawioLayout {
  /** Pas horizontal (px) : entre colonnes de subgraphs, et espacement entre rangs dagre (`ranksep`). */
  colWidth: number
  /** Pas vertical (px) : entre cases empilées d'un subgraph, et espacement entre nœuds d'un même rang dagre (`nodesep`). */
  rowStep: number
  /** Taille par défaut - mode subgraphs uniquement (le mode dagre dimensionne chaque nœud selon son texte, voir estimateNodeSize). */
  nodeWidth: number
  nodeHeight: number
}

const DEFAULT_LAYOUT: DrawioLayout = {
  colWidth: 70,
  rowStep: 30,
  nodeWidth: 280,
  nodeHeight: 60,
}

const TITLE_HEIGHT = 30
const MARGIN = 40

type Pos = {x: number; y: number}

/** Mode subgraphs : une colonne par subgraph, cases empilées dans l'ordre. */
function columnPositions(nodes: Node[], lo: DrawioLayout): Map<string, Pos> {
  const positions = new Map<string, Pos>()
  const rowInGroup = new Map<number, number>()
  for (const node of nodes) {
    const gi = node.group >= 0 ? node.group : 0
    const row = rowInGroup.get(gi) ?? 0
    rowInGroup.set(gi, row + 1)
    positions.set(node.id, {x: MARGIN + gi * lo.colWidth, y: TITLE_HEIGHT + MARGIN + row * lo.rowStep})
  }
  return positions
}

/**
 * Estime largeur/hauteur d'une boîte à partir de son texte HTML (`<br/>` = saut de ligne, balises
 * ignorées) - dagre a besoin d'une taille par nœud pour espacer correctement. Pas de vraie mesure de
 * police (aucun navigateur ici) : approximation proportionnelle au texte, plafonnée en largeur (le
 * nœud reste en `whiteSpace=wrap` - voir styleFor - donc un texte très long se réenroule plutôt que
 * de déborder ou de gonfler la boîte à l'infini).
 */
function estimateNodeSize(label: string): {width: number; height: number} {
  const CHAR_WIDTH = 6.5
  const LINE_HEIGHT = 18
  const PAD_X = 24
  const PAD_Y = 16
  const MIN_WIDTH = 120
  const MAX_WIDTH = 320
  const MIN_HEIGHT = 40

  const rawLines = label.split(/<br\s*\/?>/i).map((l) => l.replace(/<[^>]+>/g, ''))
  const longest = Math.max(0, ...rawLines.map((l) => l.length))
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(longest * CHAR_WIDTH) + PAD_X))

  const usableWidth = width - PAD_X
  const wrappedLines = rawLines.reduce((sum, l) => sum + Math.max(1, Math.ceil((l.length * CHAR_WIDTH) / usableWidth)), 0)
  const height = Math.max(MIN_HEIGHT, wrappedLines * LINE_HEIGHT + PAD_Y)

  return {width, height}
}

/** Mermaid `TD` est un synonyme historique de `TB` ; direction absente/invalide → `LR` (défaut Mermaid). */
function dagreRankDir(direction: string): 'TB' | 'BT' | 'LR' | 'RL' {
  if (direction === 'TD') return 'TB'
  return direction === 'TB' || direction === 'BT' || direction === 'LR' || direction === 'RL' ? direction : 'LR'
}

/**
 * Mode cascade (pas de subgraphs) : layout automatique via dagre - le même moteur de layout par
 * rangs que Mermaid utilise lui-même en interne pour flowchart/classDiagram, d'où un résultat
 * nettement plus proche de l'esthétique Mermaid que l'ancien placement fait main (BFS + tri
 * barycentrique par niveaux). Dimensionne aussi chaque `node.size` au passage (repris par nodeCell -
 * dagre a besoin d'une taille par nœud EN ENTRÉE du layout, donc calculée ici plutôt qu'au rendu).
 */
function dagreLevelPositions(nodes: Node[], edges: Edge[], direction: string, lo: DrawioLayout): Map<string, Pos> {
  if (!nodes.length) return new Map()

  const g = new dagre.graphlib.Graph()
  g.setGraph({rankdir: dagreRankDir(direction), ranksep: lo.colWidth, nodesep: lo.rowStep, marginx: MARGIN, marginy: MARGIN})
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    node.size = estimateNodeSize(node.label)
    g.setNode(node.id, {width: node.size.width, height: node.size.height})
  }
  // `edges` vient toujours de parseMermaid() (validEdges, déjà filtré par splitValidEdges) - pas
  // besoin de revérifier ici que source/cible sont des nœuds connus.
  for (const e of edges) g.setEdge(e.from, e.to)

  dagre.layout(g)

  const positions = new Map<string, Pos>()
  for (const node of nodes) {
    const gn = g.node(node.id)
    // dagre positionne par centre ; nodeCell (rendu) attend le coin haut-gauche.
    positions.set(node.id, {x: gn.x - gn.width / 2, y: gn.y - gn.height / 2})
  }
  return positions
}

// ════════════════════════════ Rendu ════════════════════════════

/** Tracé (routage) de la flèche : orthogonal arrondi, le plus proche de l'esthétique Mermaid. */
function edgeRouting(): string {
  return 'edgeStyle=orthogonalEdgeStyle;curved=1;html=1;endArrow=block;orthogonalLoop=1;jettySize=auto;'
}

/** Points d'ancrage sortie/entrée, alignés au flux (inversés en RL/BT). */
function edgeAnchorStyle(direction: string): string {
  const horizontal = direction === 'LR' || direction === 'RL'
  const reverse = direction === 'RL' || direction === 'BT'
  let exit: [number, number]
  let entry: [number, number]
  if (horizontal) {
    exit = reverse ? [0, 0.5] : [1, 0.5]
    entry = reverse ? [1, 0.5] : [0, 0.5]
  } else {
    exit = reverse ? [0.5, 0] : [0.5, 1]
    entry = reverse ? [0.5, 1] : [0.5, 0]
  }
  return `exitX=${exit[0]};exitY=${exit[1]};exitPerimeter=0;entryX=${entry[0]};entryY=${entry[1]};entryPerimeter=0;`
}

// Couleur du `style`/`classDef` mermaid source → fillColor, sinon défaut draw.io neutre.
function styleFor(node: Node): string {
  const base = 'whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=11;'
  const rounded = node.shape === 'stadium' ? 'rounded=1;arcSize=50;' : 'rounded=0;'
  const dash = node.dashed ? 'dashed=1;' : ''
  if (node.fill) return `${rounded}${base}fillColor=${node.fill};strokeColor=${node.stroke ?? '#666666'};${dash}`
  return `${rounded}${base}${dash}` // pas de couleur déclarée → couleurs draw.io par défaut
}

function nodeCell(node: Node, pos: Pos, lo: DrawioLayout): string {
  const width = node.size?.width ?? lo.nodeWidth
  const height = node.size?.height ?? lo.nodeHeight
  const geo = `<mxGeometry x="${pos.x}" y="${pos.y}" width="${width}" height="${height}" as="geometry" />`
  const style = styleFor(node)
  const label = escapeAttr(node.label)

  if (node.link) {
    return [
      `        <UserObject label="${label}" link="${escapeAttr(node.link)}" id="${node.id}">`,
      `          <mxCell style="${style}" vertex="1" parent="1">`,
      `            ${geo}`,
      `          </mxCell>`,
      `        </UserObject>`,
    ].join('\n')
  }
  return [
    `        <mxCell id="${node.id}" value="${label}" style="${style}" vertex="1" parent="1">`,
    `          ${geo}`,
    `        </mxCell>`,
  ].join('\n')
}

function titleCell(group: Group, gi: number, lo: DrawioLayout): string {
  return [
    `        <mxCell id="title_${group.id}" value="${escapeAttr(group.title)}" style="text;html=1;fontStyle=1;fontSize=14;align=center;verticalAlign=middle;" vertex="1" parent="1">`,
    `          <mxGeometry x="${MARGIN + gi * lo.colWidth}" y="0" width="${lo.nodeWidth}" height="${TITLE_HEIGHT}" as="geometry" />`,
    `        </mxCell>`,
  ].join('\n')
}

function edgeCell(source: string, target: string, i: number, style: string, label?: string): string {
  const value = label ? ` value="${escapeAttr(label)}"` : ''
  return [
    `        <mxCell id="e${i}"${value} style="${style}" edge="1" parent="1" source="${source}" target="${target}">`,
    `          <mxGeometry relative="1" as="geometry" />`,
    `        </mxCell>`,
  ].join('\n')
}

export interface MermaidToDrawioResult {
  xml: string
  warnings: string[]
}

export function mermaidToDrawio(mermaid: string, diagramName = 'diagram'): MermaidToDrawioResult {
  const lo = DEFAULT_LAYOUT
  const {groups, nodes, edges, direction, droppedEdges} = parseMermaid(mermaid)

  // Subgraphs → colonnes par groupe (+ titres) ; sinon → layout dagre.
  const positions = groups.length ? columnPositions(nodes, lo) : dagreLevelPositions(nodes, edges, direction, lo)

  const cells: string[] = []
  if (groups.length) groups.forEach((g, gi) => cells.push(titleCell(g, gi, lo)))
  for (const node of nodes) {
    cells.push(nodeCell(node, positions.get(node.id) ?? {x: MARGIN, y: MARGIN}, lo))
  }
  const baseEdgeStyle = edgeRouting() + edgeAnchorStyle(direction)
  edges.forEach((e, i) => cells.push(edgeCell(e.from, e.to, i, e.dashed ? `${baseEdgeStyle}dashed=1;` : baseEdgeStyle, e.label)))

  const xml = [
    `<mxfile host="app.diagrams.net" type="device">`,
    `  <diagram id="${escapeAttr(diagramName)}" name="${escapeAttr(diagramName)}">`,
    `    <mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">`,
    `      <root>`,
    `        <mxCell id="0" />`,
    `        <mxCell id="1" parent="0" />`,
    cells.join('\n'),
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
    `</mxfile>`,
  ].join('\n')

  return {xml, warnings: droppedEdges}
}
