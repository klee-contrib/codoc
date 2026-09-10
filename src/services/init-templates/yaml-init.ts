export function yamlTemplate(docRelPath: string, codocId: string): string {
  return `# Configuration codoc - généré par codoc init
# Remplissez les champs marqués TODO puis lancez : codoc sync

# Environnements Atlassian (Confluence/Jira) cibles. Au moins un. Une seule clé = la
# référence par défaut côté docs. Identifiants toujours préfixés par la clé de l'env,
# CONFLUENCE_<KEY>_USERNAME / CONFLUENCE_<KEY>_API_TOKEN dans .env-codoc.
atlassian:
  environments:
    default:
      baseUrl: https://TODO.atlassian.net       # URL de l'instance Confluence Cloud
      spaceKey: TODO                            # Clé de l'espace Confluence cible (ex. DA)
      defaultParentPageId: "TODO"               # ID de la page parente par défaut (optionnel)

# Configuration draw.io (optionnel - blocs \`\`\`mermaid convertis en diagrammes). Un seul jeu de
# réglages, partagé par tous les environnements Atlassian ci-dessus.
# drawio:
#   macroName: drawio
#   width: 900
#   edgeStyle: curved    # tracé : curved | orthogonal | straight
#   edgeAnchor: side     # ancrage des flèches : side | auto (flottant)

# Configuration GitLab (optionnel - réécrit les liens vers du code en URLs GitLab dans les pages publiées)
# gitlab:
#   baseUrl: https://TODO/mon-groupe/mon-repo
#   defaultBranch: main         # branche cible des liens

# Identifiants Jira (optionnel - liens tickets cliquables dans les pages Confluence publiées, sous
# forme de macro Jira native).
# jira:
#   serverId: ec6d1637-f9d6-3ae4-9d5e-9dce283383ea
#   server: System Jira

docs:
  - codocId: ${codocId}        # identifiant stable (lien yaml ↔ codoc.lock) - unique, ne pas réutiliser
    path: ${docRelPath}
    maintainedIn: code          # code → .md publie sur Confluence | confluence → Confluence publie en local
    # generateSummary: false    # désactive le sommaire (macro toc) en haut de page - défaut : true (maintainedIn: code uniquement)
    keywords: ["codoc", "comment fonctionne la synchro Confluence"]  # mots-clés de routage - alimentent codoc-agent.md
    # Pour une entrée dossier/glob (path se terminant par /* ou /**), affine le routage par
    # sous-chemin - les keywords ci-dessus restent le repli pour tout le reste du dossier :
    # keywordOverrides:
    #   - path: doc/model/endpoints/clients
    #     keywords: ["clients", "endpoint clients", "API clients"]
    #   - path: doc/model/diagrammes/admin/compte
    #     keywords: ["compte", "diagramme compte"]
    confluence:
      title: Guide codoc
      # parentPageId: "TODO"   # surcharge defaultParentPageId pour cette page uniquement
      # titlePrefix: "[DRAFT] "
      # titleSuffix: " (auto)"
`
}
