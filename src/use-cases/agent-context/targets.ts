export type AgentContextTargetKey = 'copilot' | 'agent' | 'claude' | 'kiro'

export interface AgentContextTarget {
  key: AgentContextTargetKey
  label: string
  description: string
  relPath: string
  strategy: 'block' | 'dedicated'
}

/** Ordre déclaré ici = ordre du flag `--target` (options), du prompt interactif, et de la doc. */
export const AGENT_CONTEXT_TARGETS: AgentContextTarget[] = [
  {
    key: 'copilot',
    label: 'Copilot instructions',
    description: "Copilot Chat / agent de code GitHub - fichier d'instructions partagé du dépôt",
    relPath: '.github/copilot-instructions.md',
    strategy: 'block',
  },
  {
    key: 'agent',
    label: 'VSCode agent',
    description: 'Fichier agent dédié pour VS Code / Copilot',
    relPath: '.github/agents/codoc-agent.md',
    strategy: 'dedicated',
  },
  {
    key: 'claude',
    label: 'Claude',
    description: 'Contexte projet pour Claude Code',
    relPath: 'CLAUDE.md',
    strategy: 'block',
  },
  {
    key: 'kiro',
    label: 'Kiro',
    description: "Fichier de steering pour l'IDE Kiro (AWS)",
    relPath: '.kiro/steering/codoc.md',
    strategy: 'dedicated',
  },
]

export const AGENT_CONTEXT_TARGET_KEYS = AGENT_CONTEXT_TARGETS.map((t) => t.key)

export function isAgentContextTargetKey(v: string): v is AgentContextTargetKey {
  return (AGENT_CONTEXT_TARGET_KEYS as string[]).includes(v)
}

/** Le registre est exhaustif par construction (AgentContextTargetKey n'a que ces 4 valeurs). */
export function findTarget(key: AgentContextTargetKey): AgentContextTarget {
  return AGENT_CONTEXT_TARGETS.find((t) => t.key === key)!
}
