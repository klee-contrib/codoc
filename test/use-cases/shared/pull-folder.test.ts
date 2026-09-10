import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ConfluenceClient} from '../../../src/clients/confluence/confluence-client.js'
import {fetchFolderDescendants, folderLocalPaths} from '../../../src/use-cases/shared/pull-folder.js'

// Petit graphe fixe id → {pages enfants, dossiers enfants} pour simuler n'importe quelle combinaison
// page/dossier à n'importe quel niveau, sans dépendre de la distinction v1/v2 réelle de l'API.
function fakeClient(tree: Record<string, {pages?: Array<{id: string; title: string}>; folders?: Array<{id: string; title: string}>}>): ConfluenceClient {
  return {
    pages: {
      fetchChildren: async (id: string) => tree[id]?.pages ?? [],
    },
    folders: {
      // Simule l'API v2 `direct-children` : renvoie pages ET sous-dossiers mélangés (comportement réel attendu).
      children: async (id: string) => [
        ...(tree[id]?.pages ?? []).map((p) => ({...p, type: 'page'})),
        ...(tree[id]?.folders ?? []).map((f) => ({...f, type: 'folder'})),
      ],
      childrenFolders: async (id: string) => tree[id]?.folders ?? [],
    },
  } as unknown as ConfluenceClient
}

describe('fetchFolderDescendants', () => {
  it('page racine → sous-pages uniquement', async () => {
    const client = fakeClient({
      root: {pages: [{id: 'p1', title: 'Page 1'}]},
    })
    const result = await fetchFolderDescendants(client, 'root', 'page')
    assert.deepEqual(
      result.map((d) => ({id: d.id, type: d.type})),
      [{id: 'p1', type: 'page'}],
    )
  })

  it('page racine → sous-dossier uniquement (le point qui manquait : v1 fetchChildren ne le voit pas seul)', async () => {
    const client = fakeClient({
      root: {folders: [{id: 'f1', title: 'Dossier 1'}]},
    })
    const result = await fetchFolderDescendants(client, 'root', 'page')
    assert.deepEqual(
      result.map((d) => ({id: d.id, type: d.type})),
      [{id: 'f1', type: 'folder'}],
    )
  })

  it('page racine → sous-page ET sous-dossier (les deux remontent)', async () => {
    const client = fakeClient({
      root: {pages: [{id: 'p1', title: 'Page 1'}], folders: [{id: 'f1', title: 'Dossier 1'}]},
    })
    const result = await fetchFolderDescendants(client, 'root', 'page')
    assert.deepEqual(
      new Set(result.map((d) => d.id)),
      new Set(['p1', 'f1']),
    )
  })

  it('dossier racine → sous-page et sous-dossier (déjà géré par direct-children v2)', async () => {
    const client = fakeClient({
      root: {pages: [{id: 'p1', title: 'Page 1'}], folders: [{id: 'f1', title: 'Dossier 1'}]},
    })
    const result = await fetchFolderDescendants(client, 'root', 'folder')
    assert.deepEqual(
      new Set(result.map((d) => d.id)),
      new Set(['p1', 'f1']),
    )
  })

  it('récursion à plusieurs niveaux avec combinaisons mixtes (dossier→page→dossier→page)', async () => {
    const client = fakeClient({
      root: {folders: [{id: 'f1', title: 'Dossier 1'}]},
      f1: {pages: [{id: 'p1', title: 'Page 1'}]},
      p1: {folders: [{id: 'f2', title: 'Dossier 2'}]},
      f2: {pages: [{id: 'p2', title: 'Page 2'}]},
    })
    const result = await fetchFolderDescendants(client, 'root', 'folder')
    assert.deepEqual(
      new Set(result.map((d) => d.id)),
      new Set(['f1', 'p1', 'f2', 'p2']),
    )
    const byId = new Map(result.map((d) => [d.id, d]))
    assert.equal(byId.get('p1')?.parentId, 'f1')
    assert.equal(byId.get('f2')?.parentId, 'p1')
    assert.equal(byId.get('p2')?.parentId, 'f2')
  })
})

describe('folderLocalPaths (avec des descendants mixtes page/dossier)', () => {
  it('place chaque sous-dossier en index.md, indépendamment de son type de parent', () => {
    const descendants = [
      {id: 'f1', title: 'Dossier 1', parentId: 'root', type: 'folder'},
      {id: 'p1', title: 'Page 1', parentId: 'f1', type: 'page'},
      {id: 'f2', title: 'Dossier 2', parentId: 'p1', type: 'folder'},
      {id: 'p2', title: 'Page 2', parentId: 'f2', type: 'page'},
    ]
    const paths = folderLocalPaths(descendants, 'root', 'doc/')
    assert.equal(paths.get('f1'), 'doc/dossier-1/index.md')
    // p1 a un enfant (f2) → devient aussi un répertoire malgré son type "page"
    assert.equal(paths.get('p1'), 'doc/dossier-1/page-1/index.md')
    assert.equal(paths.get('f2'), 'doc/dossier-1/page-1/dossier-2/index.md')
    assert.equal(paths.get('p2'), 'doc/dossier-1/page-1/dossier-2/page-2.md')
  })
})
