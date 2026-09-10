# codoc

Synchronisation de documentation Confluence ↔ code : convertit des `.md` locaux en pages Confluence et inversement, dans les deux sens, à partir d'une configuration déclarative.

Outil générique et indépendant : aucune dépendance à un outil ou un environnement particulier.

## Installation

```bash
npm install -g codoc-cli
codoc --version
```

**Prérequis** : Node ≥ 24, dépôt Git valide, permissions r/w.

## Commandes

Chaque commande se lance depuis la racine du projet ciblé. Résolution des informations dans l'ordre **flag CLI** → **valeur déjà présente dans `codoc.yaml`** → **prompt console** (pas de détection automatique de mode CI - voir [Usage en CI](#usage-en-ci)).

### `codoc init`

Génère la config initiale (`codoc.yaml`, `.env-codoc`, guide de démarrage).

| Flag | Rôle |
|---|---|
| `--agent-md` | Ne génère QUE le guide agent IA (basé sur `codoc.yaml` déjà rempli) - rien d'autre |
| `--agent-target <agent\|copilot>` | Avec `--agent-md` : destination du guide. Défaut : celle déjà en place, sinon demandé |

### `codoc sync`

Synchronise chaque doc dans les deux sens selon son `maintainedIn`.

| Flag | Rôle |
|---|---|
| `--env <clé>` | Ne synchronise que cet environnement Confluence. Défaut : tous |
| `--confirm` / `--no-confirm` | Répond automatiquement aux suppressions de pages et adoptions en conflit de titre (accepte/refuse tout). Non fourni : demande à chaque cas |

### `codoc pull [url\|id]`

Importe une page Confluence existante en local (interactif).

| Flag | Rôle |
|---|---|
| `--env <clé>` | Environnement où chercher la page. Défaut : déduit de l'URL, sinon auto/prompt |
| `--as-folder` / `--no-as-folder` | Si la page a des sous-éléments : importe tout le dossier, ou seulement la page. Non fourni : demande le cas échéant |
| `--keep-existing` / `--no-keep-existing` | Si un import précédent est détecté : le remplace (valeurs existantes comme défauts), ou en crée un séparé. Non fourni : demande le cas échéant |
| `--in-config` / `--no-in-config` | Ajoute (ou met à jour) l'entrée `codoc.yaml`. `--no-in-config` : import ponctuel, sans toucher ni à `codoc.yaml` ni à `codoc.lock`. Non fourni : demande en fin de commande |
| `--local-path <chemin>` | Chemin local du fichier `.md` (page unique) ou dossier de destination (import dossier) |
| `--title <titre>` | Titre de la page Confluence (page unique). Défaut : config existante, sinon le titre Confluence |
| `--parent-page-id <id>` | parentPageId Confluence. Défaut : config existante, sinon le parent réel de la page |
| `--maintained-in <code\|confluence>` | `code` → le `.md` local fait foi ; `confluence` → la page fait foi. Défaut : `confluence` |
| `--images-dir <chemin>` | Dossier local pour les images (`""` pour désactiver). Défaut : `doc/img` |

### `codoc publish <chemin>`

Publie un `.md` local vers Confluence (interactif).

| Flag | Rôle |
|---|---|
| `--env <clé>` | Environnement Confluence cible. Défaut : celui de la config existante, sinon auto/prompt |
| `--in-config` / `--no-in-config` | Ajoute (ou met à jour) l'entrée `codoc.yaml`. `--no-in-config` : publication ponctuelle, sans toucher ni à `codoc.yaml` ni à `codoc.lock`. Non fourni : demande en fin de commande |
| `--parent-page-id <id>` | parentPageId Confluence cible. Défaut : config existante, sinon `defaultParentPageId` de l'env |
| `--title <titre>` | Titre de la page Confluence (fichier unique). Défaut : config existante, sinon le H1 du fichier |

### `codoc tree`

Affiche l'arborescence des documents déployés.

| Flag | Rôle |
|---|---|
| `--env <clé>` | N'affiche que cet environnement Confluence. Défaut : tous |

`pull` et `publish` demandent en fin de commande si le document importé/publié doit être ajouté à `codoc.yaml` (par défaut : oui). Répondre non (ou `--no-in-config`) laisse le fichier local et la page Confluence bien réels, mais ni `codoc.yaml` ni `codoc.lock` ne sont modifiés : usage volontairement "utilitaire", hors suivi - un futur `pull`/`publish` sur le même document ne le reconnaîtra pas via son ID (seul un rapprochement par titre peut s'appliquer), exactement comme pour quelqu'un qui n'utilise jamais la config.

### Usage en CI

`publish`, `pull` et `sync` résolvent chaque information nécessaire dans cet ordre : **flag CLI** (`--xxx`, cf. tableaux ci-dessus) → **valeur déjà présente dans `codoc.yaml`** → **prompt console**. Il n'y a pas de détection automatique de mode CI : une commande ne demande jamais rien tant que tout ce dont elle a besoin est fourni en flag ou déjà configuré ; si une information manque, elle est demandée comme en local (à la charge du pipeline de fournir ce qu'il faut pour rester non-interactif).

## Configuration - `codoc.yaml`

| Champ | Rôle |
|---|---|
| `atlassian.environments.<clé>.baseUrl` / `.spaceKey` / `.defaultParentPageId` | Environnement(s) Confluence cible(s) |
| `drawio.*` | Réglages des diagrammes générés depuis les blocs ` ```mermaid ` (un seul jeu de valeurs, partagé par tous les environnements) |
| `gitlab.baseUrl` / `gitlab.defaultBranch` | Réécrit les liens vers du code en URLs GitLab dans les pages publiées (optionnel) |
| `jira.serverId` / `jira.server` | Rend les liens de tickets Jira sous forme de macro Confluence native (optionnel) |
| `docs[]` | Liste des documents synchronisés (chemin, environnement, titre, mots-clés de routage…) |

`codoc init` génère un `codoc.yaml` commenté avec tous les champs disponibles.

## Identifiants - `.env-codoc`

Ne pas committer (ajouté à `.gitignore` par `init`).

| Variable | Usage |
|---|---|
| `CONFLUENCE_<CLÉ>_USERNAME` | Email de compte Atlassian pour l'environnement `<clé>` |
| `CONFLUENCE_<CLÉ>_API_TOKEN` | Token Atlassian pour l'environnement `<clé>` |

Toujours préfixées par la clé de l'environnement (`atlassian.environments.<clé>` dans `codoc.yaml`) - même s'il n'y en a qu'un seul, ex. `CONFLUENCE_DEFAULT_USERNAME`. Pas de variable générique partagée entre environnements.

## `codoc.lock`

Généré par `sync` / `pull`. **À committer**. Trace les IDs Confluence des pages synchronisées, pour des mises à jour idempotentes.
