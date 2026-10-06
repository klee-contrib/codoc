# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet suit le
[Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Graphiques vivants : les blocs ` ```eazybi-report ` et ` ```jira-chart ` (JSON) sont publiés en
  macros Confluence `jira-report-gadget` (rapport eazyBI) et `jirachart` (graphique Jira, ex.
  "Créés vs résolus"), affichées en direct plutôt qu'en image. Une image locale précédée de
  `<!-- eazybi-preview -->` / `<!-- jira-chart-preview -->` sert d'aperçu hors Confluence et est
  retirée à la publication.

- `codoc publish --prefix <préfixe>` : préfixe le titre de la page publiée (ou celui de chaque page,
  pour un dossier), sans passer par `codoc.yaml`. Résolu comme `--title` (flag → config existante,
  sinon prompt, vide accepté) et persisté dans `codoc.yaml` (`confluence.titlePrefix`) au même titre
  que `--title`/`--parent-page` si l'entrée est ajoutée à la config.

### Corrigé

- Diagrammes Mermaid `classDiagram` (jusqu'ici uniquement `graph`/`flowchart`) : chaque classe
  (`class Nom{ … }`, avec stéréotype `<<Enum>>`/`&lt;&lt;Enum&gt;&gt;` et champs), les associations
  avec cardinalités (`A "0..1" --> "0..*" B`), l'héritage (`A <|-- B`) et les références sans corps
  vers une classe définie ailleurs (`class Nom:::style`) sont maintenant reconnus au lieu de
  disparaître silencieusement ou de déclencher un avertissement "syntaxe d'arête non reconnue" sur
  chaque relation - cas réel : `depositaires/model/doc/*-mdd.md`.

### Modifié

- `codoc agent-context` sans `--target` : demande désormais toujours interactivement quelle(s)
  cible(s) générer, plutôt que de régénérer silencieusement les cibles déjà présentes sur le disque.
  Génère toujours en écrasant le fichier existant de la cible choisie, comme avant.
- Diagrammes draw.io générés depuis un bloc ` ```mermaid ` (mode sans subgraph) : mise en page
  automatique via [dagre](https://github.com/dagrejs/dagre) - le même moteur de layout par rangs que
  Mermaid utilise lui-même en interne - à la place de l'ancien placement fait main (BFS + tri
  barycentrique, cases de taille fixe quel que soit le texte). Chaque boîte est maintenant
  dimensionnée selon son contenu. En conséquence, `drawio.edgeStyle`/`edgeAnchor`/`colWidth`/`rowStep`
  n'existent plus dans `codoc.yaml` (plus rien à régler pour un rendu correct) - seuls `macroName` et
  `width` restent configurables.

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
