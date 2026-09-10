import {before, describe, it, snapshot} from 'node:test'

import {
  confluenceStorageToMarkdown,
  preprocessStorage,
} from '../../../src/services/conversion/confluenceToMarkdown/index.js'
import {convertMarkdownToConfluence} from '../../../src/services/conversion/markdownToConfluence/index.js'
import {MD_CASES, XML_CASES} from './corpus.js'

snapshot.setDefaultSnapshotSerializers([
  (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
])

const JIRA_CFG = {serverId: 'ec6d1637-f9d6-3ae4-9d5e-9dce283383ea', server: 'System Jira'}
const GITLAB_CFG = {baseUrl: 'https://gitlab.example.com/group/project', branch: 'develop'}
const SOURCE_FILE = 'doc/golden.md'
const RT_BASE = 'https://example.atlassian.net/wiki'

describe('conversion golden-master', () => {
  before(() => {
    process.env.GITLAB_BASE_URL = 'https://gitlab.example.com/group/project'
  })

  describe('markdown → confluence', () => {
    for (const c of MD_CASES) {
      it(`${c.name} (sourceFile)`, (t) => {
        t.assert.snapshot(convertMarkdownToConfluence(c.markdown, {sourceFile: SOURCE_FILE, gitlab: GITLAB_CFG}))
      })

      if (c.jira) {
        it(`${c.name} (sourceFile + jira)`, (t) => {
          t.assert.snapshot(
            convertMarkdownToConfluence(c.markdown, {sourceFile: SOURCE_FILE, jira: JIRA_CFG, gitlab: GITLAB_CFG}),
          )
        })
      }
    }
  })

  describe('confluence → markdown', () => {
    for (const c of XML_CASES) {
      it(c.name, (t) => {
        t.assert.snapshot(confluenceStorageToMarkdown(c.xml, c.imgRelPath, c.baseUrl))
      })
    }
  })

  describe('preprocessStorage (étape intermédiaire)', () => {
    for (const c of XML_CASES) {
      it(c.name, (t) => {
        t.assert.snapshot(preprocessStorage(c.xml, c.imgRelPath, c.baseUrl))
      })
    }
  })

  describe('round-trip (conf → md → conf)', () => {
    const names = ['whiteboard-unknown-macro', 'drawio-adf', 'status-macro-standalone', 'status-macro-inline']

    for (const name of names) {
      const c = XML_CASES.find((x) => x.name === name)!

      it(`${name} - md (pull)`, (t) => {
        t.assert.snapshot(confluenceStorageToMarkdown(c.xml, c.imgRelPath, c.baseUrl ?? RT_BASE))
      })

      it(`${name} - back (publish)`, (t) => {
        const md = confluenceStorageToMarkdown(c.xml, c.imgRelPath, c.baseUrl ?? RT_BASE)
        t.assert.snapshot(
          convertMarkdownToConfluence(md, {sourceFile: SOURCE_FILE, jira: JIRA_CFG, gitlab: GITLAB_CFG}),
        )
      })
    }
  })
})
