---
slug: /
sidebar_position: 1
---

# codoc

Synchronisation de documentation Confluence ↔ code : convertit des `.md` locaux en pages Confluence et inversement, dans les deux sens, à partir d'une configuration déclarative.

Outil générique et indépendant : aucune dépendance à un outil ou un environnement particulier.

## Installation

```bash
npm install -g codoc-cli
codoc --version
```

**Prérequis** : Node ≥ 24, dépôt Git valide, permissions r/w.

## Pour aller plus loin

- [Commandes](./commandes) : `init`, `sync`, `pull`, `publish`, `tree`
- [Configuration](./configuration) : `codoc.yaml`, identifiants, `codoc.lock`
