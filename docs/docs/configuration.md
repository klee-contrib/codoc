---
sidebar_position: 3
---

# Configuration

## `codoc.yaml`

| Champ | Rôle |
|---|---|
| `atlassian.environments.<clé>.baseUrl` / `.spaceKey` / `.defaultParentPageId` | Environnement(s) Confluence cible(s) |
| `drawio.*` | Réglages des diagrammes générés depuis les blocs ` ```mermaid ` (un seul jeu de valeurs, partagé par tous les environnements) |
| `gitlab.baseUrl` / `gitlab.defaultBranch` | Réécrit les liens vers du code en URLs GitLab dans les pages publiées (optionnel) |
| `jira.serverId` / `jira.server` | Rend les liens de tickets Jira sous forme de macro Confluence native (optionnel) |
| `docs[]` | Liste des documents synchronisés (chemin, environnement, titre, mots-clés de routage…) |
| `autoUpdate` | `false` désactive la mise à jour automatique de codoc (voir ci-dessous). Défaut : `true` |

`codoc init` génère un `codoc.yaml` commenté avec tous les champs disponibles.

## Mise à jour automatique

Au lancement de chaque commande interactive, codoc vérifie sur npm si une version plus récente est
disponible et, si oui, l'installe automatiquement puis relance la commande d'origine avec le binaire
à jour. Jamais en CI (`CI` défini) ni en sortie non-interactive. Désactivable via `autoUpdate: false`
dans `codoc.yaml`.

## Identifiants - `.env-codoc`

Ne pas committer (ajouté à `.gitignore` par `init`).

| Variable | Usage |
|---|---|
| `CONFLUENCE_<CLÉ>_USERNAME` | Email de compte Atlassian pour l'environnement `<clé>` |
| `CONFLUENCE_<CLÉ>_API_TOKEN` | Token Atlassian pour l'environnement `<clé>` |

Toujours préfixées par la clé de l'environnement (`atlassian.environments.<clé>` dans `codoc.yaml`) - même s'il n'y en a qu'un seul, ex. `CONFLUENCE_DEFAULT_USERNAME`. Pas de variable générique partagée entre environnements.

## `codoc.lock`

Généré par `sync` / `pull`. **À committer**. Trace les IDs Confluence des pages synchronisées, pour des mises à jour idempotentes.
