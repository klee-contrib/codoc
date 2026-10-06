import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {InputRequest, InputsContext, InputSpec, requestAll, resolveInputs} from '../../src/services/resolve-inputs.js'

function parseUrl(raw: string): URL {
  if (!URL.canParse(raw)) throw new Error(`URL invalide : "${raw}".`)
  return new URL(raw)
}

const CATALOG = {
  token: {
    kind: 'secret',
    label: 'TEST_TOKEN',
    env: ['TEST_TOKEN', 'TEST_TOKEN_FALLBACK'],
    generateUrl: 'https://example.test/tokens',
    fix: '.env-codoc',
  },
  spaceKey: {
    kind: 'text',
    label: 'atlassian.environments.prod.spaceKey',
    config: ['atlassian', 'environments', 'prod', 'spaceKey'],
    fix: 'codoc.yaml',
  },
  title: {kind: 'text', label: 'Titre', fix: '--title <titre>'},
  imagesDir: {kind: 'text', label: 'Dossier des images', fix: '--images-dir <chemin>'},
  url: {kind: 'text', label: 'URL', fix: 'codoc pull <url>', parse: parseUrl},
  keep: {kind: 'confirm', label: 'Config existante', fix: '--keep-existing ou --no-keep-existing'},
  env: {kind: 'select', label: 'Environnement', fix: '--parent-page <url>', choices: ['prod', 'rec']},
  targets: {kind: 'checklist', label: 'Cible(s)', fix: '--target <clé>'},
} satisfies Record<string, InputSpec>

interface FakeOptions {
  interactive?: boolean
  env?: Record<string, string>
  config?: Record<string, unknown>
  answers?: Record<string, string | string[] | boolean>
}

function fakeContext(options: FakeOptions = {}) {
  const asked: Array<[string, InputRequest]> = []
  const remembered: Array<[string, string]> = []
  const context: InputsContext = {
    interactive: options.interactive ?? false,
    env: {...options.env},
    config: structuredClone(options.config ?? {}),
    async ask(spec, request) {
      asked.push([spec.label, request])
      return options.answers?.[spec.label]
    },
    async remember(spec, value) {
      remembered.push([spec.label, value])
    },
  }
  return {context, asked, remembered}
}

describe('resolveInputs', () => {
  it("prend le flag, sinon la variable d'env (dans l'ordre), sinon la valeur existante, sinon codoc.yaml, sinon le défaut, sans rien demander", async () => {
    const {context, asked} = fakeContext({
      interactive: true,
      env: {TEST_TOKEN_FALLBACK: 'depuis-env'},
      config: {atlassian: {environments: {prod: {spaceKey: 'DOC'}}}},
    })

    const values = await resolveInputs(
      CATALOG,
      {
        token: {},
        spaceKey: {},
        title: {flag: 'depuis-flag', existing: 'depuis-config', suggested: 'suggéré'},
        imagesDir: {existing: 'assets', default: 'doc/img'},
        targets: {default: ['claude']},
      },
      context,
    )

    assert.deepStrictEqual(values, {
      token: 'depuis-env',
      spaceKey: 'DOC',
      title: 'depuis-flag',
      imagesDir: 'assets',
      targets: ['claude'],
    })
    assert.deepStrictEqual(asked, [])
    assert.strictEqual(context.env.TEST_TOKEN, undefined)
  })

  it("donne la priorité au flag sur la variable d'env", async () => {
    const {context} = fakeContext({env: {TEST_TOKEN: 'depuis-env'}})
    assert.deepStrictEqual(await resolveInputs(CATALOG, {token: {flag: 'depuis-flag'}}, context), {
      token: 'depuis-flag',
    })
  })

  it('respecte une chaîne vide explicite (flag ou valeur existante) pour une valeur facultative', async () => {
    const {context, asked} = fakeContext({interactive: true})

    const values = await resolveInputs(
      CATALOG,
      {
        imagesDir: {flag: '', existing: 'assets', suggested: 'doc/img', optional: true},
        title: {existing: '', suggested: 'Titre du H1', optional: true},
      },
      context,
    )

    assert.deepStrictEqual(values, {imagesDir: '', title: ''})
    assert.deepStrictEqual(asked, [])
  })

  it('passe à la source suivante quand une valeur obligatoire est vide', async () => {
    const {context} = fakeContext()
    assert.deepStrictEqual(
      await resolveInputs(CATALOG, {title: {flag: ' ', existing: 'Titre existant'}, keep: {flag: false}}, context),
      {title: 'Titre existant', keep: false},
    )
  })

  it('ignore les valeurs dont la condition est fausse ou absente', async () => {
    const {context} = fakeContext()
    const values = await resolveInputs(
      CATALOG,
      {token: {when: false}, targets: {flag: ['claude'], when: undefined}},
      context,
    )
    assert.deepStrictEqual(values, {})
  })

  it('hors terminal, prend la valeur suggérée au lieu de demander', async () => {
    const {context, asked} = fakeContext()

    const values = await resolveInputs(
      CATALOG,
      {
        title: {suggested: 'Titre du H1'},
        env: {suggested: 'rec'},
        keep: {suggested: true},
        targets: {suggested: ['kiro']},
      },
      context,
    )

    assert.deepStrictEqual(values, {title: 'Titre du H1', env: 'rec', keep: true, targets: ['kiro']})
    assert.deepStrictEqual(asked, [])
  })

  it("hors terminal, liste d'un coup les valeurs obligatoires manquantes et où les renseigner", async () => {
    const {context} = fakeContext()

    await assert.rejects(
      resolveInputs(
        CATALOG,
        {token: {}, spaceKey: {}, url: {}, title: {suggested: 'Titre du H1'}, imagesDir: {optional: true}},
        context,
      ),
      (error: Error) => {
        assert.match(error.message, /^Valeurs manquantes :/)
        assert.match(error.message, /TEST_TOKEN\s+→ \.env-codoc/)
        assert.match(error.message, /Pour le générer : https:\/\/example\.test\/tokens/)
        assert.match(error.message, /atlassian\.environments\.prod\.spaceKey → codoc\.yaml/)
        assert.match(error.message, /URL\s+→ codoc pull <url>/)
        assert.doesNotMatch(error.message, /Titre|Dossier des images/)
        return true
      },
    )
  })

  it('hors terminal, laisse undefined une valeur facultative absente', async () => {
    const {context} = fakeContext()
    assert.deepStrictEqual(await resolveInputs(CATALOG, {imagesDir: {optional: true}}, context), {})
  })

  it("en terminal, ne demande que ce qui manque, dans l'ordre, et applique les saisies d'env et de codoc.yaml pour la commande", async () => {
    const {context, asked, remembered} = fakeContext({
      interactive: true,
      config: {atlassian: {environments: {prod: {baseUrl: 'https://acme.atlassian.net'}}}},
      answers: {TEST_TOKEN: 'saisi', 'atlassian.environments.prod.spaceKey': 'DOC', Titre: 'Mon titre'},
    })

    const values = await resolveInputs(
      CATALOG,
      {token: {}, spaceKey: {}, title: {suggested: 'Titre du H1'}, imagesDir: {flag: 'img'}},
      context,
    )

    assert.deepStrictEqual(values, {token: 'saisi', spaceKey: 'DOC', title: 'Mon titre', imagesDir: 'img'})
    assert.deepStrictEqual(
      asked.map(([label]) => label),
      ['TEST_TOKEN', 'atlassian.environments.prod.spaceKey', 'Titre'],
    )
    assert.strictEqual(context.env.TEST_TOKEN, 'saisi')
    assert.deepStrictEqual(context.config, {
      atlassian: {environments: {prod: {baseUrl: 'https://acme.atlassian.net', spaceKey: 'DOC'}}},
    })
    assert.deepStrictEqual(remembered, [
      ['TEST_TOKEN', 'saisi'],
      ['atlassian.environments.prod.spaceKey', 'DOC'],
    ])
  })

  it('en terminal, passe la suggestion et les choix de la requête à la question', async () => {
    const {context, asked} = fakeContext({interactive: true, answers: {Environnement: 'rec', 'Cible(s)': ['claude']}})
    const choices = [{name: 'Claude', value: 'claude'}]

    const values = await resolveInputs(CATALOG, {env: {suggested: 'prod'}, targets: {choices}}, context)

    assert.deepStrictEqual(values, {env: 'rec', targets: ['claude']})
    assert.strictEqual(asked[0][1].suggested, 'prod')
    assert.deepStrictEqual(asked[1][1].choices, choices)
  })

  it('en terminal, accepte une réponse vide pour une valeur facultative, sans la retenir', async () => {
    const {context, remembered} = fakeContext({interactive: true, answers: {'Dossier des images': ''}})
    assert.deepStrictEqual(await resolveInputs(CATALOG, {imagesDir: {suggested: 'doc/img', optional: true}}, context), {
      imagesDir: '',
    })
    assert.deepStrictEqual(remembered, [])
  })

  it("applique l'analyse et la validation aux flags comme aux saisies", async () => {
    const validate = (value: string) => value.endsWith('.md') || 'Le chemin doit se terminer par .md'

    await assert.rejects(resolveInputs(CATALOG, {url: {flag: 'pas-une-url'}}, fakeContext().context), /URL invalide/)
    await assert.rejects(
      resolveInputs(CATALOG, {title: {existing: 'doc/a', validate}}, fakeContext().context),
      /Le chemin doit se terminer par \.md/,
    )
    const {url} = await resolveInputs(CATALOG, {url: {flag: 'https://acme.atlassian.net/wiki'}}, fakeContext().context)
    assert.strictEqual(url.hostname, 'acme.atlassian.net')
    const {context} = fakeContext({interactive: true, answers: {Titre: ' doc/a.md '}})
    assert.deepStrictEqual(await resolveInputs(CATALOG, {title: {validate}}, context), {title: 'doc/a.md'})
  })

  it("en terminal, s'arrête dès qu'une valeur obligatoire est laissée vide et liste celles qui restent", async () => {
    const {context, asked} = fakeContext({interactive: true, answers: {TEST_TOKEN: ''}})

    await assert.rejects(resolveInputs(CATALOG, {token: {}, spaceKey: {}}, context), (error: Error) => {
      assert.match(error.message, /TEST_TOKEN/)
      assert.match(error.message, /atlassian\.environments\.prod\.spaceKey/)
      return true
    })
    assert.deepStrictEqual(
      asked.map(([label]) => label),
      ['TEST_TOKEN'],
    )
  })
})

describe('requestAll', () => {
  it('demande chaque entrée du catalogue, sans option', () => {
    assert.deepStrictEqual(requestAll({token: CATALOG.token, title: CATALOG.title}), {token: {}, title: {}})
  })
})
