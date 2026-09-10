import type {AppConfig, DocEntryConfig} from '../../types/codoc-types.js'

interface RoutingRule {
  keywords: string[]
  location: string
}

function docRules(d: DocEntryConfig): RoutingRule[] {
  const overrides = (d.keywordOverrides ?? []).map((o) => ({keywords: o.keywords, location: o.path}))
  const baseKeywords = d.keywords?.length ? d.keywords : [d.confluence.title ?? d.path]
  return [...overrides, {keywords: baseKeywords, location: d.path}]
}

function renderRule(r: RoutingRule): string {
  const contains = r.keywords.map((k) => JSON.stringify(k)).join(', ')
  return `- when:\n    contains_any: [${contains}]\n  use: "${r.location}"`
}

export function agentMdContent(config: AppConfig): string {
  const rules = config.docs.flatMap(docRules)

  const routing = rules.length
    ? rules.map(renderRule).join('\n\n')
    : '# (aucune documentation indexée pour ce projet)'

  const hasConfluenceDocs = config.docs.some((d) => d.maintainedIn === 'confluence')

  const envsLines = config.atlassian.environments.length
    ? config.atlassian.environments
        .map((e) => `- \`${e.key}\` → baseUrl \`${e.baseUrl}\`, espace \`${e.spaceKey}\``)
        .join('\n')
    : '_Aucun environnement Confluence configuré._'

  const confluenceSection = hasConfluenceDocs
    ? `
## CONFLUENCE

${envsLines}

Pour une doc \`confluence\`, la page fait foi et \`codoc.lock\` (racine du projet) donne son URL :
1. Cherche l'entrée dont \`sourceFile\` correspond au fichier \`use\` de la règle appliquée.
2. \`confluenceUrl\` présent → lien direct.
3. Absent (page pas encore publiée) → reconstruit avec \`{baseUrl}/wiki/spaces/{spaceKey}/pages/{confluencePageId}\`.
`
    : ''

  return `# Documentation du projet - index pour agents IA

## RÈGLES OBLIGATOIRES

1. Avant de répondre, de proposer du code, ou de décrire un comportement existant : vérifie la section ROUTAGE.
2. Une règle \`contains_any\` correspond au sujet → base ta réponse sur le fichier \`use\`, jamais sur ta mémoire générale ni une recherche libre dans le code. Plusieurs règles correspondent → privilégie celle dont le \`use\` est le plus spécifique (chemin le plus précis).
3. Aucune règle ne correspond → dis-le explicitement, ne présume pas d'une source, puis appuie-toi sur une lecture directe du code.
4. N'invente jamais un fichier ou une page Confluence absent de ce document.
5. Termine toujours ta réponse au format défini dans FORMAT DE RÉPONSE.

## ROUTAGE

\`\`\`yaml
${routing}
\`\`\`
${confluenceSection}
## FORMAT DE RÉPONSE

\`\`\`
SOURCE: <fichier, code direct et/ou page Confluence associée dans le lock>
RÉPONSE: <ta réponse>
\`\`\`
`
}
