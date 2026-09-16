export function docguideContent(id: string): string {
  return `> **Page d'exemple** - générée par \`codoc init\`. Supprime l'entrée de \`codoc.yaml\` puis relance \`codoc sync\` pour la retirer.

# Guide codoc - ${id}

## Rôle

\`codoc\` synchronise des \`.md\` locaux avec des pages Confluence, dans les deux sens.

Chaque doc déclarée dans \`codoc.yaml\` a une "source de vérité" mentionnée :

| \`maintainedIn\` | Source de vérité | Action de \`sync\` |
|---|---|---|
| \`code\` | Le \`.md\` local | Publie / met à jour la page Confluence |
| \`confluence\` | La page Confluence | Régénère le \`.md\` local |

## Commandes

Résolution des informations dans l'ordre **flag CLI** → **valeur déjà présente dans \`codoc.yaml\`** → **prompt console** (pas de mode CI détecté automatiquement - un pipeline doit fournir tout ce qu'il faut pour rester silencieux).

### \`codoc init\`

Génère la config initiale (codoc.yaml, .env-codoc, guide).

| Flag | Rôle |
|---|---|
| \`--agent-md\` | Ne génère QUE le guide agent IA (basé sur \`codoc.yaml\` déjà rempli) - rien d'autre |
| \`--agent-target <agent\\|copilot>\` | Avec \`--agent-md\` : destination du guide. Défaut : celle déjà en place, sinon demandé |

### \`codoc sync\`

Synchronise chaque doc dans les deux sens selon son \`maintainedIn\`.

| Flag | Rôle |
|---|---|
| \`--env <clé>\` | Ne synchronise que cet environnement Confluence. Défaut : tous |
| \`--confirm\` / \`--no-confirm\` | Répond automatiquement aux suppressions/adoptions en conflit de titre (accepte/refuse tout). Non fourni : demande à chaque cas |

### \`codoc pull [url]\`

Importe une page Confluence existante en local (interactif). L'environnement est déduit du domaine de l'URL (comparé au \`baseUrl\` de chaque environnement configuré), avec repli sur l'environnement unique ou une recherche dans tous si besoin.

| Flag | Rôle |
|---|---|
| \`--as-folder\` / \`--no-as-folder\` | Sous-éléments détectés : importe tout le dossier, ou seulement la page. Non fourni : demande le cas échéant |
| \`--keep-existing\` / \`--no-keep-existing\` | Import précédent détecté : le remplace, ou en crée un séparé. Non fourni : demande le cas échéant |
| \`--in-config\` / \`--no-in-config\` | Ajoute/met à jour l'entrée \`codoc.yaml\`. \`--no-in-config\` : import ponctuel, hors suivi (yaml et lock non touchés). Non fourni : demande en fin de commande |
| \`--local-path <chemin>\` | Chemin local du \`.md\` (page unique) ou dossier de destination (import dossier) |
| \`--title <titre>\` | Titre de la page Confluence (page unique). Défaut : config existante, sinon le titre Confluence |
| \`--maintained-in <code\\|confluence>\` | \`code\` → le \`.md\` fait foi ; \`confluence\` → la page fait foi. Défaut : \`confluence\` |
| \`--images-dir <chemin>\` | Dossier local pour les images (\`""\` pour désactiver). Défaut : \`doc/img\` |

### \`codoc publish <chemin>\`

Publie un \`.md\` local vers Confluence (interactif). L'environnement est déduit du domaine de l'URL passée à \`--parent-page\`, avec prompt si absente ou non reconnue.

| Flag | Rôle |
|---|---|
| \`--in-config\` / \`--no-in-config\` | Ajoute/met à jour l'entrée \`codoc.yaml\`. \`--no-in-config\` : publication ponctuelle, hors suivi (yaml et lock non touchés). Non fourni : demande en fin de commande |
| \`--keep-existing\` / \`--no-keep-existing\` | Entrée \`codoc.yaml\` déjà existante pour ce chemin : la remplace, ou en crée une séparée. Non fourni : demande le cas échéant |
| \`--parent-page <url>\` | URL de la page Confluence parente cible (\`""\` pour aucun parent). Défaut : config existante, sinon prompt |
| \`--title <titre>\` | Titre de la page Confluence (fichier unique). Défaut : config existante, sinon le H1 du fichier |
| \`--maintained-in <code\\|confluence>\` | Source de vérité pour les prochains \`sync\`. Défaut : \`code\`. N'affecte pas cette publication (toujours code → Confluence) |

### \`codoc tree\`

Affiche l'arborescence des docs déployées.

| Flag | Rôle |
|---|---|
| \`--env <clé>\` | N'affiche que cet environnement Confluence. Défaut : tous |

\`pull\` et \`publish\` demandent en fin de commande s'il faut ajouter le document à \`codoc.yaml\` (défaut : oui) - répondre non (ou \`--no-in-config\`) permet un import/publication ponctuel, sans toucher ni à \`codoc.yaml\` ni à \`codoc.lock\`, non suivi par les prochains \`sync\`.

## Configuration - \`codoc.yaml\`

| Champ | Rôle |
|---|---|
| \`atlassian.environments.<clé>.baseUrl\` | URL Confluence |
| \`atlassian.environments.<clé>.spaceKey\` | Clé de l'espace |
| \`atlassian.environments.<clé>.defaultParentPageId\` | Page parente par défaut |
| \`drawio.*\` | Réglages des diagrammes générés depuis les blocs \`\`\`mermaid (un seul jeu de valeurs, partagé par tous les environnements) |
| \`gitlab.baseUrl\` / \`gitlab.defaultBranch\` | Réécrit les liens vers du code en URLs GitLab dans les pages publiées (optionnel) |
| \`jira.serverId\` / \`jira.server\` | Rend les liens de tickets Jira sous forme de macro Confluence native (optionnel) |
| \`docs[].codocId\` | Lien stable yaml ↔ lock |
| \`docs[].path\` | Chemin du \`.md\` (ou glob \`/**\`) |
| \`docs[].maintainedIn\` | \`code\` ou \`confluence\` |
| \`docs[].generateSummary\` | Génère le sommaire (macro toc) en haut de page - \`maintainedIn: code\` uniquement (défaut : \`true\`) |
| \`docs[].confluence.title\` | Titre de la page (défaut : \`# H1\` du fichier) |

## Identifiants - \`.env-codoc\`

Ne pas committer (ajouté à \`.gitignore\` par \`init\`).

| Variable | Usage |
|---|---|
| \`CONFLUENCE_<CLÉ>_USERNAME\` | Email de compte Atlassian pour l'environnement \`<clé>\` |
| \`CONFLUENCE_<CLÉ>_API_TOKEN\` | Token Atlassian pour l'environnement \`<clé>\` |

Toujours préfixées par la clé de l'environnement (\`atlassian.environments.<clé>\` dans \`codoc.yaml\`) - même s'il n'y en a qu'un seul, ex. \`CONFLUENCE_DEFAULT_USERNAME\`. Pas de variable générique partagée entre environnements.

## Workflow type

\`\`\`
1. codoc init          → génère yaml, env, guide
2. Remplir codoc.yaml + .env-codoc
3. codoc sync           → publie le guide sur Confluence
\`\`\`

## Format Markdown supporté

| Markdown | Rendu Confluence |
|---|---|
| \`# Titre\` | Titre de section |
| \`**gras**\` / \`*italique*\` | Gras / italique |
| \`\`\`code\`\`\` | Code inline |
| Bloc \`\`\`lang | Bloc de code avec coloration |
| Bloc \`\`\`mermaid | Diagramme draw.io (converti + upload en pièce jointe) |
| \`- [ ] tâche\` | Liste de tâches Confluence |
| \`📅 2024-01-15\` | \`<time datetime="2024-01-15"/>\` |
| \`<span data-confluence-status="Green">Livré</span>\` | Macro Status |

## \`codoc.lock\`

Généré par \`sync\` / \`pull\`. **À committer**. Trace les IDs Confluence pour les mises à jour idempotentes.
`
}
