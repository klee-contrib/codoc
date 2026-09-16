# Contribuer à codoc

Merci de vous intéresser à codoc. Ce guide résume ce qu'il faut savoir pour contribuer efficacement.

## Prérequis

- Node ≥ 24 (voir `engines` dans `package.json`)
- Un dépôt Git valide pour tester en conditions réelles (`codoc` s'appuie sur `PROJECT_ROOT = process.cwd()`)

## Mise en place

```bash
npm install
npm run build
```

## Cycle de développement

| Commande | Rôle |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run lint-fix` | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) |
| `npm test` | Suite de tests (relance aussi `lint` via `posttest`) |
| `npm run test:coverage` | Tests + rapport de couverture (`c8`) |
| `npm run test:update-snapshots` | Régénère les snapshots de conversion (`test/services/conversion/corpus.ts`) |
| `npm run build` | Build de production (`tsdown`) |

La CI (`.github/workflows/ci.yml`) exécute typecheck, lint, build et tests sur chaque push sur `main`
et chaque pull request - assurez-vous que les quatre passent avant de proposer une PR.

## Tests

- Basés sur le test runner natif de Node (`node:test`), pas de framework externe.
- **node:test lance chaque fichier `*.test.ts` dans son propre processus.** Les modules à état
  global (ex. `services/lock/lock-file.ts`, avec son cache module-level et son chemin fixe
  `PROJECT_ROOT/codoc.lock`) ne peuvent donc exposer qu'un seul scénario "à froid" par fichier de
  test - voir `test/services/lock/lock-file-missing-state.test.ts` et
  `lock-file-corrupt-state.test.ts` pour un exemple de scénarios volontairement séparés en
  plusieurs fichiers pour cette raison.
- Convention constante du projet : on fausse le collaborateur directement à la frontière testée
  (un `ConfluenceClient` fabriqué à la main pour tester une couche service, un `ConfluenceHttp`
  fabriqué à la main pour tester la couche client HTTP), plutôt que d'utiliser une librairie de
  mock. Voir `test/services/confluence/pages.test.ts` et `test/clients/confluence/clients/*.test.ts`
  pour des exemples aux deux niveaux.
- Le rendu réel des diagrammes draw.io (`renderDrawioToPng`, Puppeteer/Chrome headless) n'est
  délibérément pas couvert par des tests unitaires - seule la logique pure autour (extraction du
  mxGraphModel, détection des blocs, gestion des échecs de récupération) l'est.

## Style de code

- Pas de commentaire explicatif du "quoi" (le code documente déjà ce qu'il fait) - un commentaire se
  justifie pour une contrainte cachée, un choix non évident, ou un contournement.
- `oxlint` fait foi pour le formatage/les règles automatisables ; en cas de doute, alignez-vous sur
  le style déjà en place dans le fichier que vous modifiez.

## Publication

Le tag `codoc-cli/vX.Y.Z` déclenche `.github/workflows/publish.yml`, qui rejoue typecheck/lint/tests
avant `npm publish`. Mettez à jour `CHANGELOG.md` (section `[Non publié]` → nouvelle version) avant de
taguer.

## Documentation

Le site (`docs/`, Docusaurus) est publié sur GitHub Pages via `.github/workflows/doc.yml` à chaque
changement sous `docs/**` poussé sur `main`. Le contenu de `docs/docs/` reflète les mêmes sections que
ce README - gardez les deux synchronisés.
