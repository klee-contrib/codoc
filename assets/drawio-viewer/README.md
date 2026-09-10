# draw.io viewer (vendored)

`viewer-static.min.js` is draw.io's official, pre-built static diagram viewer,
downloaded as-is from `https://viewer.diagrams.net/js/viewer-static.min.js`
(re-download to update). Apache License 2.0 - see
https://github.com/jgraph/drawio/blob/dev/LICENSE.

Includes the full built-in shape/stencil library, so it renders diagrams
(including icons and custom shapes) exactly as draw.io itself would, unlike a
hand-rolled parser. Used headlessly via Puppeteer in
`../../src/services/conversion/confluenceToMarkdown/diagrams/drawio-to-image.ts`
to convert pulled `.drawio` attachments to SVG - no network access needed at
runtime, no separate tool to install.
