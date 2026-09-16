import path from 'node:path'

import {getCodocConfig} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {agentMdContent} from '../../services/init-templates/agent-md-init.js'
import {ensureDir, fileExists, readFile, removePath, writeFile} from '../../services/files-service.js'
import {selectMultiple} from '../../services/prompt.js'
import {
  AGENT_CONTEXT_TARGETS,
  AgentContextTarget,
  AgentContextTargetKey,
  findTarget,
  isAgentContextTargetKey,
} from './targets.js'

const LEGACY_AGENT_MD_REL = path.join('.github', 'codoc-agent.md')
export const BLOCK_START = '<!-- codoc-agent:start -->'
export const BLOCK_END = '<!-- codoc-agent:end -->'

export interface AgentContextResult {
  created: string[]
  warnings: string[]
}

/** `codoc agent-context` : génère le contexte agent IA pour une ou plusieurs cibles. */
export async function agentContext(
  targetsFlag: string[] | undefined,
  projectRoot: string = PROJECT_ROOT,
): Promise<AgentContextResult> {
  const created: string[] = []
  const warnings: string[] = []
  const keys = await resolveAgentContextTargets(targetsFlag, projectRoot)
  for (const key of keys) generateTarget(findTarget(key), projectRoot, created, warnings)
  return {created, warnings}
}

/**
 * Flag (liste explicite, validée) → cibles déjà générées sur le disque (silencieux, toutes celles
 * qui existent déjà) → prompt interactif multi-sélection (uniquement si le flag est absent ET
 * qu'aucune cible n'existe encore). `promptFn` est injectable pour les tests.
 */
export async function resolveAgentContextTargets(
  targetsFlag: string[] | undefined,
  projectRoot: string = PROJECT_ROOT,
  promptFn: (targets: AgentContextTarget[]) => Promise<AgentContextTargetKey[]> = promptForTargets,
): Promise<AgentContextTargetKey[]> {
  if (targetsFlag !== undefined) {
    const invalid = targetsFlag.filter((t) => !isAgentContextTargetKey(t))
    if (invalid.length) {
      throw new Error(
        `Cible(s) "${invalid.join(', ')}" inconnue(s). Valeurs possibles : ${AGENT_CONTEXT_TARGETS.map((t) => t.key).join(', ')}.`,
      )
    }

    return [...new Set(targetsFlag as AgentContextTargetKey[])]
  }

  const existing = AGENT_CONTEXT_TARGETS.filter((t) => fileExists(path.join(projectRoot, t.relPath))).map((t) => t.key)
  if (existing.length) return existing

  try {
    return await promptFn(AGENT_CONTEXT_TARGETS)
  } catch {
    // Ctrl+C (ExitPromptError) ou stdin non interactif : traité comme "aucune cible", pas un crash.
    return []
  }
}

async function promptForTargets(targets: AgentContextTarget[]): Promise<AgentContextTargetKey[]> {
  return selectMultiple(
    'Générer le contexte agent pour quelle(s) cible(s) ?',
    targets.map((t) => ({value: t.key, label: t.label, description: t.description})),
  )
}

function generateTarget(target: AgentContextTarget, projectRoot: string, created: string[], warnings: string[]): void {
  try {
    const config = getCodocConfig()
    const body = agentMdContent(config)
    const content = target.key === 'kiro' ? kiroSteeringContent(body) : body
    const absPath = path.join(projectRoot, target.relPath)
    const legacyAbsPath = path.join(projectRoot, LEGACY_AGENT_MD_REL)
    const hadLegacy = target.key === 'agent' && fileExists(legacyAbsPath)

    const status = target.strategy === 'block' ? writeBlock(absPath, content) : writeDedicated(absPath, content)

    if (hadLegacy) removePath(legacyAbsPath)
    created.push(`${target.label} (${target.relPath}) : ${hadLegacy ? 'déplacé depuis .github/codoc-agent.md' : status}`)
  } catch (err) {
    warnings.push(
      `${target.label} (${target.relPath}) : impossible de générer - ${
        (err as Error).message.split('\n')[0]
      }. Remplis codoc.yaml puis relance \`codoc agent-context\`.`,
    )
  }
}

/** Frontmatter Kiro : doit être la toute première chose du fichier (https://kiro.dev/docs/steering/). */
export function kiroSteeringContent(body: string): string {
  return `---\ninclusion: always\n---\n\n${body}`
}

/** Fichier dédié et entièrement possédé par codoc : contenu remplacé intégralement. */
export function writeDedicated(absPath: string, content: string): 'créé' | 'regénéré' {
  const existed = fileExists(absPath)
  writeFile(absPath, content)
  return existed ? 'regénéré' : 'créé'
}

/** Fichier potentiellement partagé avec d'autres instructions : injection idempotente par bloc balisé. */
export function writeBlock(absPath: string, content: string): 'créé' | 'regénéré' {
  const block = `${BLOCK_START}\n${content.trim()}\n${BLOCK_END}`

  if (!fileExists(absPath)) {
    ensureDir(path.dirname(absPath))
    writeFile(absPath, `${block}\n`)
    return 'créé'
  }

  const existing = readFile(absPath)
  const blockRe = new RegExp(`${escapeRegex(BLOCK_START)}[\\s\\S]*?${escapeRegex(BLOCK_END)}`)
  if (blockRe.test(existing)) {
    writeFile(absPath, existing.replace(blockRe, block))
    return 'regénéré'
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  writeFile(absPath, `${existing}${separator}${block}\n`)
  return 'créé'
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
