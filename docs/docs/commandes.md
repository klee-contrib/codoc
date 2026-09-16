---
sidebar_position: 2
---

# Commandes

Chaque commande se lance depuis la racine du projet ciblé. Résolution des informations dans l'ordre **flag CLI** → **valeur déjà présente dans `codoc.yaml`** → **prompt console** (pas de détection automatique de mode CI - voir [Usage en CI](#usage-en-ci)).

## `codoc init`

Génère la config initiale (`codoc.yaml`, `.env-codoc`, guide de démarrage).

## `codoc agent-context`

Génère le contexte agent IA (basé sur `codoc.yaml`, qui doit déjà exister et être rempli) pour une ou plusieurs cibles.

| Cible | Fichier | Écriture |
|---|---|---|
| `copilot` — Copilot instructions (Copilot Chat / agent de code GitHub) | `.github/copilot-instructions.md` | bloc balisé dans un fichier potentiellement partagé |
| `agent` — VSCode agent (fichier dédié VS Code / Copilot) | `.github/agents/codoc-agent.md` | fichier dédié, remplacé intégralement |
| `claude` — Claude (contexte projet pour Claude Code) | `CLAUDE.md` | bloc balisé dans un fichier potentiellement partagé |
| `kiro` — Kiro (steering file pour l'IDE Kiro) | `.kiro/steering/codoc.md` | fichier dédié, remplacé intégralement |

| Flag | Rôle |
|---|---|
| `--target <clé>` | Cible(s) à générer, répétable (`--target a --target b`) et/ou séparées par des virgules (`--target a,b`). Défaut : les cibles déjà en place (silencieux), sinon demandé |

Résolution propre à cette commande (différente du flag → `codoc.yaml` → prompt des autres commandes, cf. [Usage en CI](#usage-en-ci)) : `--target` → cibles déjà présentes sur le disque (aucune invite) → sélection interactive (uniquement si `--target` est absent et qu'aucune cible n'existe encore).

## `codoc sync`

Synchronise chaque doc dans les deux sens selon son `maintainedIn`.

| Flag | Rôle |
|---|---|
| `--env <clé>` | Ne synchronise que cet environnement Confluence. Défaut : tous |
| `--confirm` / `--no-confirm` | Répond automatiquement aux suppressions de pages et adoptions en conflit de titre (accepte/refuse tout). Non fourni : demande à chaque cas |

## `codoc pull [url]`

Importe une page Confluence existante en local (interactif). L'environnement est déduit du domaine de l'URL fournie (comparé au `baseUrl` de chaque environnement configuré) ; si aucun ne correspond, l'unique environnement configuré est utilisé, sinon la page est recherchée dans tous (prompt si trouvée dans plusieurs).

| Flag | Rôle |
|---|---|
| `--as-folder` / `--no-as-folder` | Si la page a des sous-éléments : importe tout le dossier, ou seulement la page. Non fourni : demande le cas échéant |
| `--keep-existing` / `--no-keep-existing` | Si un import précédent est détecté : le remplace (valeurs existantes comme défauts), ou en crée un séparé. Non fourni : demande le cas échéant |
| `--in-config` / `--no-in-config` | Ajoute (ou met à jour) l'entrée `codoc.yaml`. `--no-in-config` : import ponctuel, sans toucher ni à `codoc.yaml` ni à `codoc.lock`. Non fourni : demande en fin de commande |
| `--local-path <chemin>` | Chemin local du fichier `.md` (page unique) ou dossier de destination (import dossier) |
| `--title <titre>` | Titre de la page Confluence (page unique). Défaut : config existante, sinon le titre Confluence |
| `--maintained-in <code\|confluence>` | `code` → le `.md` local fait foi ; `confluence` → la page fait foi. Défaut : `confluence` |
| `--images-dir <chemin>` | Dossier local pour les images (`""` pour désactiver). Défaut : `doc/img` |

## `codoc publish <chemin>`

Publie un `.md` local vers Confluence (interactif). L'environnement est déduit du domaine de l'URL passée à `--parent-page` ; sans parent, ou si le domaine ne correspond à aucun environnement configuré, un choix est demandé (silencieux s'il n'y en a qu'un).

| Flag | Rôle |
|---|---|
| `--in-config` / `--no-in-config` | Ajoute (ou met à jour) l'entrée `codoc.yaml`. `--no-in-config` : publication ponctuelle, sans toucher ni à `codoc.yaml` ni à `codoc.lock`. Non fourni : demande en fin de commande |
| `--keep-existing` / `--no-keep-existing` | Si une entrée `codoc.yaml` existe déjà pour ce chemin : la met à jour en place (valeurs existantes comme défauts), ou en crée une séparée. Non fourni : demande le cas échéant |
| `--parent-page <url>` | URL de la page Confluence parente cible (`""` pour aucun parent). Défaut : celle de la config existante, sinon prompt |
| `--title <titre>` | Titre de la page Confluence (fichier unique). Défaut : config existante, sinon le H1 du fichier |
| `--maintained-in <code\|confluence>` | Source de vérité enregistrée pour les prochains `sync` : `code` ou `confluence`. Défaut : `code`. N'affecte pas cette publication (toujours un envoi local → Confluence) |

## `codoc tree`

Affiche l'arborescence des documents déployés.

| Flag | Rôle |
|---|---|
| `--env <clé>` | N'affiche que cet environnement Confluence. Défaut : tous |

`pull` et `publish` demandent en fin de commande si le document importé/publié doit être ajouté à `codoc.yaml` (par défaut : oui). Répondre non (ou `--no-in-config`) laisse le fichier local et la page Confluence bien réels, mais ni `codoc.yaml` ni `codoc.lock` ne sont modifiés : usage volontairement "utilitaire", hors suivi - un futur `pull`/`publish` sur le même document ne le reconnaîtra pas via son ID (seul un rapprochement par titre peut s'appliquer), exactement comme pour quelqu'un qui n'utilise jamais la config.

## `pull`/`publish` hors scope de projet

`pull` et `publish` n'exigent pas de `codoc.yaml` : sans lui (ou si aucun environnement n'y est
déclaré), ils demandent directement l'URL de base Confluence (déduite de l'URL fournie pour `pull`,
ou de `--parent-page` pour `publish`, sinon demandée). Le `spaceKey` est déduit de cette même URL
si elle est au format Confluence Cloud standard (`/spaces/<clé>/pages|folder/...`) ; sinon demandé -
obligatoire pour `publish`, optionnel pour un `pull` isolé (il ne sert alors qu'à l'URL affichée en
fin de commande). Puis les identifiants (mêmes conventions que `.env-codoc`, avec la même offre de
sauvegarde).

En fin de commande, une sauvegarde des identifiants seule ne suffit pas à les rendre réutilisables :
codoc propose donc aussi d'ajouter l'environnement à `codoc.yaml` (le crée si besoin). Sur refus, il
rappelle précisément quoi ajouter à la main - et saute alors la question habituelle d'ajout du
document à `codoc.yaml` (une entrée `docs:` référençant un environnement absent de la config n'aurait
aucun sens).

## Usage en CI

`publish`, `pull` et `sync` résolvent chaque information nécessaire dans cet ordre : **flag CLI** (`--xxx`, cf. tableaux ci-dessus) → **valeur déjà présente dans `codoc.yaml`** → **prompt console**. Il n'y a pas de détection automatique de mode CI : une commande ne demande jamais rien tant que tout ce dont elle a besoin est fourni en flag ou déjà configuré ; si une information manque, elle est demandée comme en local (à la charge du pipeline de fournir ce qu'il faut pour rester non-interactif).
