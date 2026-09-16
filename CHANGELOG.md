# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet suit le
[Semantic Versioning](https://semver.org/lang/fr/).

## [0.2.1] - 2026-09-14

### Ajouté

- Extraits Confluence réutilisables (« excerpt ») : un bloc markdown délimité par `<!-- excerpt -->`
  et `<!-- /excerpt -->` (ou `<!-- excerpt:nom -->` pour un extrait nommé) est publié comme une macro
  `excerpt`, incluable ailleurs via `Excerpt Include`. La republication de la page source (mise à jour
  en place, même pageId) ne casse pas les inclusions posées sur d'autres pages.

## [0.2.0] - 2026-09-14

### Corrigé

- Diagrammes Mermaid : les arêtes labellisées (`-->|label|` et `-- label -->`) étaient silencieusement
  ignorées - ni rendues, ni signalées. Elles sont maintenant supportées (label inclus sur le diagramme
  draw.io généré), et toute arête référençant un nœud jamais déclaré (`A["label"]`), chaînée sur une
  seule ligne (`A --> B --> C`, non supporté) ou dont le label contient un `|` littéral produit un
  avertissement explicite au lieu de disparaître sans trace.
- `codoc.yaml` : l'ajout d'un environnement Atlassian ad-hoc (via `pull`/`publish` hors config) ne peut
  plus créer une clé en double (YAML invalide) si le même environnement est ajouté deux fois dans le
  même process.

### Ajouté

- `codoc pull` et `codoc publish` sont utilisables hors scope de projet : sans `codoc.yaml` (ou sans
  environnement Atlassian déclaré), ils demandent directement l'URL de base Confluence, le
  `spaceKey` (déduit automatiquement de l'URL au format Confluence Cloud standard
  `/spaces/<clé>/...` si possible, sinon demandé - obligatoire pour `publish`, optionnel pour un
  `pull` isolé) et les identifiants, puis proposent d'ajouter l'environnement à `codoc.yaml` en fin
  de commande pour que ces identifiants soient réutilisables la prochaine fois.
- `parsePageUrl` extrait aussi `spaceKey` de l'URL quand elle est présente (`/spaces/<clé>/...`).
- `autoUpdate: false` dans `codoc.yaml` pour désactiver la mise à jour automatique de codoc (voir le
  README et docs/Configuration).
- Tests sur `codoc.lock`, l'orchestration de `codoc pull`, le pipeline d'images draw.io et la couche
  client HTTP Confluence (`src/clients/confluence/**`), jusqu'ici non couverts.

### Modifié

- Le workflow `publish` rejoue désormais typecheck/lint/tests avant `npm publish`, pour ne jamais
  publier un tag qui ne les a pas passés.

## [0.1.2] et versions antérieures

Historique antérieur à ce fichier - voir les tags git et [la liste des versions sur npm](https://www.npmjs.com/package/codoc-cli?activeTab=versions).
