import {escapeAttr} from '../../shared/xml-escaping.js'

// Mermaid (graph/flowchart) → XML draw.io. 3 étapes : parse → layout (positions) → rendu.
// Layout : colonnes par subgraph si présents, sinon cascade par niveaux (parents → enfants).

// ════════════════════════════ Modèle ════════════════════════════

interface Node {
  id: string
  label: string // HTML (peut contenir <b>, <br/>, <a>)
  shape: 'rect' | 'stadium'
  group: number // index de subgraph (-1 si aucun)
  link?: string // URL (directive click)
  fill?: string // couleur de remplissage (directive style)
  stroke?: string
}

interface Group {
  id: string
  title: string
}

interface ParsedGraph {
  groups: Group[]
  nodes: Node[]
  edges: Array<[string, string]>
  direction: string // LR | RL | TB | TD | BT
}

// ════════════════════════════ Parse ════════════════════════════

const RE_DIRECTION = /^(?:graph|flowchart)\s+(LR|RL|TB|TD|BT)/
const RE_SUBGRAPH = /^subgraph\s+(\w+)(?:\["([^"]*)"\])?/
const RE_NODE_STADIUM = /^(\w+)\(\["([\s\S]*)"\]\)$/
const RE_NODE_RECT = /^(\w+)\["([\s\S]*)"\]$/
const RE_EDGE = /^(\w+)\s*-->\s*(\w+)$/
const RE_CLICK = /^click\s+(\w+)\s+href\s+"([^"]+)"/
const RE_STYLE = /^style\s+(\w+)\s+(.+)$/
const RE_CLASS_DEF = /^classDef\s+(\w+)\s+(.+)$/
const RE_CLASS = /^class\s+([\w,\s]+)\s+(\w+)\s*;?$/

interface FillStroke {fill?: string; stroke?: string}

/** Extrait `fill` et `stroke` d'une chaîne de directive style (`fill:#xxx,stroke:#yyy,…`). */
function parseFillStroke(directive: string): FillStroke {
  return {
    fill: directive.match(/fill:\s*([^,;]+)/)?.[1]?.trim(),
    stroke: directive.match(/stroke:\s*([^,;]+)/)?.[1]?.trim(),
  }
}

function parseMermaid(mermaid: string): ParsedGraph {
  const groups: Group[] = []
  const nodes: Node[] = []
  const edges: Array<[string, string]> = []
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

    const edge = line.match(RE_EDGE)
    if (edge) {
      edges.push([edge[1], edge[2]])
      continue
    }

    const stadium = line.match(RE_NODE_STADIUM)
    const rect = stadium ? null : line.match(RE_NODE_RECT)
    const m = stadium ?? rect
    if (m) {
      const node: Node = {id: m[1], label: m[2], shape: stadium ? 'stadium' : 'rect', group: currentGroup}
      nodes.push(node)
      nodeById.set(node.id, node)
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
  }

  const known = new Set(nodes.map((n) => n.id))
  const validEdges = edges.filter(([a, b]) => known.has(a) && known.has(b))

  return {groups, nodes, edges: validEdges, direction}
}

// ════════════════════════════ Layout ════════════════════════════

interface DrawioLayout {
  /** Pas horizontal (px) : entre colonnes/niveaux en LR. */
  colWidth: number
  /** Pas vertical (px) : entre cases empilées d'un même niveau en LR. */
  rowStep: number
  nodeWidth: number
  nodeHeight: number
  /** Tracé des flèches : courbe (défaut), angle droit arrondi, ou ligne droite. */
  edgeStyle: 'curved' | 'orthogonal' | 'straight'
  /** Ancrage des flèches : "side" = côtés alignés au flux (défaut), "auto" = flottant (choix draw.io). */
  edgeAnchor: 'auto' | 'side'
}

const DEFAULT_LAYOUT: DrawioLayout = {
  colWidth: 480,
  rowStep: 110,
  nodeWidth: 280,
  nodeHeight: 60,
  edgeStyle: 'curved',
  edgeAnchor: 'side',
}

const TITLE_HEIGHT = 30
const MARGIN = 40

type Pos = {x: number; y: number}
type Adjacency = Map<string, string[]>

/** Listes d'adjacence (parents / enfants) du graphe, restreintes aux nœuds connus. */
function buildAdjacency(nodes: Node[], edges: Array<[string, string]>): {preds: Adjacency; succs: Adjacency} {
  const idSet = new Set(nodes.map((n) => n.id))
  const preds: Adjacency = new Map(nodes.map((n) => [n.id, []]))
  const succs: Adjacency = new Map(nodes.map((n) => [n.id, []]))
  for (const [from, to] of edges) {
    if (!idSet.has(from) || !idSet.has(to)) continue
    succs.get(from)!.push(to)
    preds.get(to)!.push(from)
  }
  return {preds, succs}
}

/** Retire les clés `undefined` pour qu'elles n'écrasent pas les valeurs de DEFAULT_LAYOUT au merge. */
function cleanLayout(layout: Partial<DrawioLayout>): Partial<DrawioLayout> {
  return Object.fromEntries(Object.entries(layout).filter(([, v]) => v !== undefined)) as Partial<DrawioLayout>
}

/** Niveau de chaque nœud = max(niveaux parents)+1 (0 si racine). Cycles détectés par DFS et ignorés pour garder la cascade gauche→droite. */
function assignLevels(nodes: Node[], preds: Adjacency, succs: Adjacency): Map<string, number> {
  // 1. Repère les arêtes retour : `u → v` où v est un ancêtre encore dans la pile DFS.
  const backEdges = new Set<string>()
  const state = new Map<string, 0 | 1>() // 0 = en cours (dans la pile), 1 = terminé
  const visit = (u: string): void => {
    state.set(u, 0)
    for (const v of succs.get(u) ?? []) {
      const s = state.get(v)
      if (s === 0) backEdges.add(`${u}->${v}`)
      else if (s === undefined) visit(v)
    }
    state.set(u, 1)
  }
  const isRoot = (id: string) => (preds.get(id)?.length ?? 0) === 0
  for (const n of nodes) if (isRoot(n.id) && !state.has(n.id)) visit(n.id) // racines d'abord
  for (const n of nodes) if (!state.has(n.id)) visit(n.id) // composantes purement cycliques

  // 2. Plus long chemin sur le DAG privé des arêtes retour (mémoïsé, donc terminant).
  const level = new Map<string, number>()
  const levelOf = (id: string): number => {
    const cached = level.get(id)
    if (cached !== undefined) return cached
    let maxParent = -1
    for (const p of preds.get(id) ?? []) {
      if (backEdges.has(`${p}->${id}`)) continue // arête retour ignorée
      maxParent = Math.max(maxParent, levelOf(p))
    }
    const lv = maxParent + 1 // aucun parent « avant » → 0
    level.set(id, lv)
    return lv
  }
  for (const n of nodes) levelOf(n.id)
  return level
}

/** Ordonne verticalement chaque colonne pour limiter les croisements (méthode barycentrique, 2 passes aller-retour). */
function orderColumns(columns: string[][], preds: Adjacency, succs: Adjacency, level: Map<string, number>): void {
  const maxLevel = columns.length - 1
  const order = new Map<string, number>()
  columns.forEach((col) => col.forEach((id, i) => order.set(id, i)))

  // Position moyenne des voisins situés sur la couche `atLevel` (sinon : position actuelle).
  const barycenter = (id: string, neighbors: string[], atLevel: number): number => {
    const ns = neighbors.filter((n) => level.get(n) === atLevel)
    return ns.length ? ns.reduce((s, n) => s + order.get(n)!, 0) / ns.length : order.get(id)!
  }
  const sortColumn = (l: number, adjacency: Adjacency, atLevel: number): void => {
    columns[l].sort((a, b) => barycenter(a, adjacency.get(a)!, atLevel) - barycenter(b, adjacency.get(b)!, atLevel))
    columns[l].forEach((id, i) => order.set(id, i))
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let l = 1; l <= maxLevel; l++) sortColumn(l, preds, l - 1)
    for (let l = maxLevel - 1; l >= 0; l--) sortColumn(l, succs, l + 1)
  }
}

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

/** Mode cascade : placement par niveaux (parents à gauche, enfants à droite en LR). */
function levelPositions(
  nodes: Node[],
  edges: Array<[string, string]>,
  direction: string,
  lo: DrawioLayout,
): Map<string, Pos> {
  if (!nodes.length) return new Map()

  const {preds, succs} = buildAdjacency(nodes, edges)
  const level = assignLevels(nodes, preds, succs)
  const maxLevel = Math.max(0, ...level.values())

  // Colonnes par niveau (ordre d'insertion initial), puis tri anti-croisements.
  const columns: string[][] = Array.from({length: maxLevel + 1}, () => [])
  for (const n of nodes) columns[level.get(n.id)!].push(n.id)
  orderColumns(columns, preds, succs, level)

  // Axe "niveau" = horizontal en LR/RL, vertical en TB/BT ; RL/BT inversent le sens.
  const horizontal = direction === 'LR' || direction === 'RL'
  const reverse = direction === 'RL' || direction === 'BT'
  const mainStep = horizontal ? lo.colWidth : lo.rowStep
  const crossStep = horizontal ? lo.rowStep : lo.colWidth
  const crossCenter = horizontal ? 400 : 600

  const positions = new Map<string, Pos>()
  for (let l = 0; l <= maxLevel; l++) {
    const col = columns[l]
    const span = (col.length - 1) * crossStep
    const mainIdx = reverse ? maxLevel - l : l
    col.forEach((id, i) => {
      const main = MARGIN + mainIdx * mainStep
      const cross = crossCenter + i * crossStep - span / 2 // colonne centrée
      positions.set(id, horizontal ? {x: main, y: cross} : {x: cross, y: main})
    })
  }
  return positions
}

// ════════════════════════════ Rendu ════════════════════════════

/** Tracé (routage) de la flèche selon le style choisi. */
function edgeRouting(kind: DrawioLayout['edgeStyle']): string {
  const arrow = 'html=1;endArrow=block;orthogonalLoop=1;jettySize=auto;'
  switch (kind) {
    case 'straight':
      return arrow
    case 'orthogonal':
      return `edgeStyle=orthogonalEdgeStyle;rounded=1;${arrow}`
    case 'curved':
    default:
      return `edgeStyle=orthogonalEdgeStyle;curved=1;${arrow}`
  }
}

/** Points d'ancrage sortie/entrée : "auto" = flottant, "side" = côtés alignés au flux (inversé en RL/BT). */
function edgeAnchorStyle(anchor: DrawioLayout['edgeAnchor'], direction: string): string {
  if (anchor !== 'side') return ''
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
  if (node.fill) return `${rounded}${base}fillColor=${node.fill};strokeColor=${node.stroke ?? '#666666'};`
  return `${rounded}${base}` // pas de couleur déclarée → couleurs draw.io par défaut
}

function nodeCell(node: Node, pos: Pos, lo: DrawioLayout): string {
  const geo = `<mxGeometry x="${pos.x}" y="${pos.y}" width="${lo.nodeWidth}" height="${lo.nodeHeight}" as="geometry" />`
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

function edgeCell(source: string, target: string, i: number, style: string): string {
  return [
    `        <mxCell id="e${i}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">`,
    `          <mxGeometry relative="1" as="geometry" />`,
    `        </mxCell>`,
  ].join('\n')
}

export function mermaidToDrawio(mermaid: string, diagramName = 'diagram', layout: Partial<DrawioLayout> = {}): string {
  const lo: DrawioLayout = {
    ...DEFAULT_LAYOUT,
    ...cleanLayout(layout),
  }

  const {groups, nodes, edges, direction} = parseMermaid(mermaid)

  // Subgraphs → colonnes par groupe (+ titres) ; sinon → cascade par niveaux.
  const positions = groups.length ? columnPositions(nodes, lo) : levelPositions(nodes, edges, direction, lo)

  const cells: string[] = []
  if (groups.length) groups.forEach((g, gi) => cells.push(titleCell(g, gi, lo)))
  for (const node of nodes) {
    cells.push(nodeCell(node, positions.get(node.id) ?? {x: MARGIN, y: MARGIN}, lo))
  }
  const edgeStyle = edgeRouting(lo.edgeStyle) + edgeAnchorStyle(lo.edgeAnchor, direction)
  edges.forEach(([a, b], i) => cells.push(edgeCell(a, b, i, edgeStyle)))

  return [
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
}
