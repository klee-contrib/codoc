import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {buildConfluencePage} from '../../../../../src/services/conversion/markdownToConfluence/render/page.js'

describe('buildConfluencePage', () => {
  it('inclut la macro toc par défaut', () => {
    const xml = buildConfluencePage('<p>corps</p>', '2026-08-18')
    assert.match(xml, /ac:name="toc"/)
    assert.match(xml, /<p>corps<\/p>/)
  })

  it('inclut la macro toc quand generateSummary est explicitement true', () => {
    const xml = buildConfluencePage('<p>corps</p>', '2026-08-18', true)
    assert.match(xml, /ac:name="toc"/)
  })

  it('omet la macro toc quand generateSummary est false', () => {
    const xml = buildConfluencePage('<p>corps</p>', '2026-08-18', false)
    assert.doesNotMatch(xml, /ac:name="toc"/)
    assert.match(xml, /<p>corps<\/p>/)
    assert.match(xml, /Généré le/)
  })
})
