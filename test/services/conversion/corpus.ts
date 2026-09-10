/**
 * Corpus de test - couvre chaque élément de conversion.
 *
 * Ce fichier n'est PAS du code de production : il sert uniquement à capturer
 * la sortie exacte des convertisseurs avant/après refactoring afin de garantir
 * qu'aucune conversion ne change.
 */

export interface MdCase {
  name: string;
  markdown: string;
  /** Si true, exécute aussi avec la config Jira (serverId/server). */
  jira?: boolean;
}

export interface XmlCase {
  name: string;
  xml: string;
  imgRelPath?: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Markdown → Confluence
// ---------------------------------------------------------------------------

export const MD_CASES: MdCase[] = [
  { name: "heading-levels", markdown: "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6" },
  { name: "paragraph-simple", markdown: "Un paragraphe simple avec du texte." },
  { name: "inline-strong", markdown: "Texte **gras** et normal." },
  { name: "inline-em", markdown: "Texte *italique* et normal." },
  { name: "inline-del", markdown: "Texte ~~barré~~ et normal." },
  { name: "inline-code", markdown: "Texte avec `code inline` ici." },
  { name: "inline-mixed", markdown: "**Gras** *italique* `code` ~~barré~~ mélangés." },
  { name: "inline-br", markdown: "Ligne 1  \nLigne 2" },
  { name: "inline-escape", markdown: "Caractères échappés \\* \\_ \\# ici." },
  { name: "entities", markdown: "Caractères & < > \" ' spéciaux." },
  { name: "link-external", markdown: "Voir [le site](https://example.com) ici." },
  { name: "link-relative", markdown: "Voir [le fichier](../src/index.ts) ici." },
  { name: "link-relative-title-line", markdown: '[code](../src/index.ts "L42")' },
  { name: "link-anchor", markdown: "Voir [section](#ma-section) ici." },
  { name: "link-mailto", markdown: "Écrire à [moi](mailto:test@example.com)." },
  { name: "image-attachment", markdown: "![mon image](img/photo.png)" },
  { name: "image-external", markdown: "![](https://example.com/x.png)" },
  { name: "image-in-paragraph", markdown: "Avant ![x](img/a.png) après." },
  { name: "ul-simple", markdown: "- Item 1\n- Item 2\n- Item 3" },
  { name: "ol-simple", markdown: "1. Premier\n2. Deuxième\n3. Troisième" },
  { name: "ol-start", markdown: "3. Trois\n4. Quatre" },
  { name: "ul-nested", markdown: "- Niveau 1\n  - Niveau 2\n    - Niveau 3" },
  { name: "ol-nested", markdown: "1. Un\n   1. Un-a\n   2. Un-b\n2. Deux" },
  { name: "ul-with-inline", markdown: "- **Gras** item\n- Item avec [lien](https://x.com)\n- Item avec `code`" },
  { name: "task-simple", markdown: "- [ ] À faire\n- [x] Fait" },
  { name: "task-nested", markdown: "- [ ] Tache 1\n- [x] Tache 2\n  - [ ] Sous tache 1" },
  { name: "task-deep", markdown: "- [ ] A\n  - [x] B\n    - [ ] C" },
  { name: "code-no-lang", markdown: "```\ncode brut\nligne 2\n```" },
  { name: "code-ts", markdown: "```ts\nconst x: number = 1;\n```" },
  { name: "code-js", markdown: "```javascript\nconsole.log('hi');\n```" },
  { name: "code-python", markdown: "```python\nprint('hi')\n```" },
  { name: "code-unknown-lang", markdown: "```cobol\nIDENTIFICATION\n```" },
  { name: "code-shell", markdown: "```sh\nls -la\n```" },
  { name: "code-yaml", markdown: "```yml\nkey: value\n```" },
  { name: "code-cdata-edge", markdown: "```\nfin de cdata ]]> au milieu\n```" },
  { name: "code-with-entities", markdown: "```html\n<div class=\"x\"> & </div>\n```" },
  { name: "blockquote-plain", markdown: "> Une citation simple." },
  { name: "blockquote-info", markdown: "> [info]\n> Corps de l'info." },
  { name: "blockquote-info-inline", markdown: "> [info] Corps sur la même ligne." },
  { name: "blockquote-note", markdown: "> [note]\n> Corps de la note." },
  { name: "blockquote-warning", markdown: "> [warning]\n> Attention danger." },
  { name: "blockquote-tip", markdown: "> [tip]\n> Astuce utile." },
  { name: "blockquote-expand", markdown: "> [expand Mon titre]\n> Contenu caché." },
  // Sans marqueur explicite [type] → toujours rendu en `info` (pas d'heuristique mots-clés).
  { name: "blockquote-no-marker-defaults-to-info-1", markdown: "> warning: ceci est important." },
  { name: "blockquote-no-marker-defaults-to-info-2", markdown: "> note: une remarque." },
  { name: "blockquote-multiline", markdown: "> [info]\n> Ligne 1\n>\n> Ligne 2 avec **gras**." },
  { name: "table-simple", markdown: "| A | B |\n|---|---|\n| 1 | 2 |" },
  { name: "table-align", markdown: "| G | C | D |\n|:--|:-:|--:|\n| a | b | c |" },
  { name: "table-inline-content", markdown: "| **Gras** | `code` |\n|---|---|\n| [lien](https://x.com) | *it* |" },
  { name: "hr", markdown: "Avant\n\n---\n\nAprès" },
  { name: "date-marker", markdown: "Date : 📅 2026-06-15" },
  { name: "jira-ticket-link", markdown: "Voir [DEP-918](https://example.atlassian.net/browse/DEP-918) ici.", jira: true },
  { name: "jira-ticket-link-noconfig", markdown: "Voir [DEP-918](https://example.atlassian.net/browse/DEP-918) ici." },
  { name: "jira-datasource-link", markdown: "[🔗 Tableau Jira](https://example.atlassian.net/issues/?jql=x)" },
  { name: "jira-datasource-link-no-emoji", markdown: "[Tableau Jira](https://example.atlassian.net/issues/?jql=x)" },
  { name: "user-mention-link", markdown: "Merci de contacter [@Jean Dupont](user:jdupont) pour toute question." },
  { name: "raw-html-underline", markdown: "Texte <u>souligné</u> ici." },
  { name: "raw-html-color-span", markdown: 'Texte <span style="color: rgb(255,86,48);">rouge</span> ici.' },
  { name: "raw-html-comment", markdown: "Avant <!-- commentaire --> après." },
  { name: "raw-html-sub-sup", markdown: "H<sub>2</sub>O et x<sup>2</sup>." },
  {
    name: "raw-html-preserved-macro",
    markdown:
      'Avant\n\n<div data-confluence-macro-preserved="1">&lt;ac:structured-macro ac:name="native-embed:whiteboard"&gt;&lt;ac:parameter ac:name="url"&gt;https://x/wb&lt;/ac:parameter&gt;&lt;/ac:structured-macro&gt;</div>\n\nAprès',
  },
  {
    name: "raw-html-table-complex",
    markdown:
      '<table><tbody><tr><td><blockquote data-macro-type="info"><p>Volet info</p></blockquote></td><td><p>texte <a href="https://example.atlassian.net/browse/DEP-918">DEP-918</a></p></td></tr></tbody></table>',
    jira: true,
  },
  {
    name: "raw-html-table-code",
    markdown:
      '<table><tbody><tr><td><pre><code class="language-python">print(1)</code></pre></td></tr></tbody></table>',
  },
  {
    name: "raw-html-table-img",
    markdown:
      '<table><tbody><tr><td><img src="img/x.png" alt="x.png"></td><td><img src="https://e.com/y.png" alt=""></td></tr></tbody></table>',
  },
  {
    name: "raw-html-table-tasklist",
    markdown:
      '<table><tbody><tr><td><div data-ac-task-list="1"><div data-ac-task="1" data-status="incomplete">Tache 1</div><div data-ac-task="1" data-status="complete">Tache 2<div data-ac-task-list="1"><div data-ac-task="1" data-status="incomplete">Sous tache 1</div></div></div></div></td></tr></tbody></table>',
  },
  { name: "empty", markdown: "" },
  { name: "only-whitespace", markdown: "   \n\n  \n" },
  { name: "multiple-blank-lines", markdown: "Para 1\n\n\n\n\nPara 2" },
];

// ---------------------------------------------------------------------------
// Confluence → Markdown
// ---------------------------------------------------------------------------

const WHITEBOARD =
  '<ac:structured-macro ac:name="native-embed:whiteboard" ac:schema-version="1" ac:macro-id="d5f6f9bb"><ac:parameter ac:name="alignment">center</ac:parameter><ac:parameter ac:name="url">https://example.atlassian.net/wiki/spaces/DA/whiteboard/5874614331</ac:parameter><ac:parameter ac:name="alwaysShowTitle">false</ac:parameter><ac:parameter ac:name="height">600</ac:parameter></ac:structured-macro>';

const DRAWIO_ADF =
  '<ac:adf-extension><ac:adf-node type="extension"><ac:adf-attribute key="extension-key">1afdce52/static/drawio</ac:adf-attribute><ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute><ac:adf-attribute key="text">Diagramme draw.io</ac:adf-attribute><ac:adf-attribute key="layout">default</ac:adf-attribute><ac:adf-attribute key="local-id">299deeb5</ac:adf-attribute></ac:adf-node><ac:adf-fallback>fallback</ac:adf-fallback></ac:adf-extension>';

const JIRA_DATASOURCE =
  '<table data-table-width="1800" data-layout="default" ac:local-id="9a33"><tbody><tr><td ac:local-id="d1f4"><p local-id="4ba0" /><a href="https://example.atlassian.net/issues/?jql=text%20~%20%22DEP-918%22" local-id="9d31" data-card-appearance="block" data-datasource="{&quot;id&quot;:&quot;d8b7&quot;}">https://example.atlassian.net/issues/?jql=text</a></td></tr></tbody></table>';

export const XML_CASES: XmlCase[] = [
  {
    name: "generated-info-block",
    xml: '<ac:structured-macro ac:name="info"><ac:rich-text-body><p><strong>Généré le :</strong> 2026-06-15</p></ac:rich-text-body></ac:structured-macro><p>Contenu réel.</p>',
  },
  {
    name: "toc-macro",
    xml: '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="type">list</ac:parameter></ac:structured-macro><p>Après TOC.</p>',
  },
  {
    name: "toc-self-closing",
    xml: '<ac:structured-macro ac:name="toc" />\n<p>Après TOC.</p>',
  },
  {
    name: "heading",
    xml: "<h1>Titre 1</h1><h2>Titre 2</h2><h3>Titre 3</h3>",
  },
  {
    name: "paragraph-inline",
    xml: "<p>Texte <strong>gras</strong> et <em>italique</em> et <code>code</code>.</p>",
  },
  {
    name: "del-underline",
    xml: "<p>texte <del>barré</del> et <u>souligné</u>.</p>",
  },
  {
    name: "color-span",
    xml: '<p>Texte <span style="color: rgb(255,86,48);">rouge</span> ici.</p>',
  },
  {
    name: "task-list-simple",
    xml: '<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body><span class="placeholder-inline-tasks">Tache 1</span></ac:task-body></ac:task><ac:task><ac:task-id>2</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body><span>Tache 2</span></ac:task-body></ac:task></ac:task-list>',
  },
  {
    name: "task-list-nested",
    xml: '<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body>Tache 1</ac:task-body></ac:task><ac:task><ac:task-id>2</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>Tache 2</ac:task-body></ac:task><ac:task-list><ac:task><ac:task-id>3</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body>Sous tache 1</ac:task-body></ac:task></ac:task-list></ac:task-list>',
  },
  {
    name: "task-list-uuid-formats",
    xml: '<ac:task-list><ac:task ac:local-id="uuid-attr"><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body>A</ac:task-body></ac:task><ac:task><ac:task-uuid>uuid-child</ac:task-uuid><ac:task-id>2</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>B</ac:task-body></ac:task></ac:task-list>',
  },
  {
    name: "status-macro-standalone",
    xml: '<p><ac:structured-macro ac:name="status" ac:schema-version="1" ac:macro-id="b77c5b52-97e6-4ef5-b9a9-b59d3ae35866"><ac:parameter ac:name="title">NEW</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></p>',
  },
  {
    name: "status-macro-inline",
    xml: '<p>Statut : <ac:structured-macro ac:name="status"><ac:parameter ac:name="title">DONE</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro> validé.</p>',
  },
  { name: "drawio-adf", xml: DRAWIO_ADF },
  {
    name: "drawio-classic",
    xml: '<ac:structured-macro ac:name="drawio" ac:schema-version="1"><ac:parameter ac:name="diagramName">mon-diagramme.drawio</ac:parameter></ac:structured-macro>',
  },
  { name: "whiteboard-unknown-macro", xml: WHITEBOARD },
  { name: "jira-datasource-table", xml: JIRA_DATASOURCE, baseUrl: "https://example.atlassian.net/wiki" },
  {
    name: "jira-inline-card",
    xml: '<p>Ticket <a href="https://example.atlassian.net/browse/DEP-918" data-card-appearance="inline"></a> ici.</p>',
    baseUrl: "https://example.atlassian.net/wiki",
  },
  {
    name: "jira-macro-old",
    xml: '<p>Ticket <ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">DEP-918</ac:parameter></ac:structured-macro> ici.</p>',
    baseUrl: "https://example.atlassian.net/wiki",
  },
  {
    name: "time-datetime",
    xml: '<p>Date : <time datetime="2026-06-15">15 juin</time></p>',
  },
  {
    name: "time-self-closing",
    xml: '<p>Date : <time datetime="2026-06-15" /></p>',
  },
  {
    name: "time-no-datetime",
    xml: "<p>Date : <time>inconnu</time></p>",
  },
  {
    name: "macro-info",
    xml: '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Volet information</p></ac:rich-text-body></ac:structured-macro>',
  },
  {
    name: "macro-info-title",
    xml: '<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Mon titre</ac:parameter><ac:rich-text-body><p>Corps</p></ac:rich-text-body></ac:structured-macro>',
  },
  {
    name: "macro-note-warning-tip",
    xml: '<ac:structured-macro ac:name="note"><ac:rich-text-body><p>Note</p></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="warning"><ac:rich-text-body><p>Warn</p></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="tip"><ac:rich-text-body><p>Tip</p></ac:rich-text-body></ac:structured-macro>',
  },
  {
    name: "macro-expand",
    xml: '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Développer</ac:parameter><ac:rich-text-body><p>Texte caché</p></ac:rich-text-body></ac:structured-macro>',
  },
  {
    name: "macro-code-lang",
    xml: '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">python</ac:parameter><ac:plain-text-body><![CDATA[print("hi")]]></ac:plain-text-body></ac:structured-macro>',
  },
  {
    name: "macro-code-no-lang",
    xml: '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[texte brut]]></ac:plain-text-body></ac:structured-macro>',
  },
  {
    name: "macro-code-entities",
    xml: '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">html</ac:parameter><ac:plain-text-body><![CDATA[<div> & </div>]]></ac:plain-text-body></ac:structured-macro>',
  },
  {
    name: "image-attachment",
    xml: '<ac:image ac:align="center"><ri:attachment ri:filename="photo.png" /></ac:image>',
    imgRelPath: "img",
  },
  {
    name: "image-attachment-no-relpath",
    xml: '<ac:image><ri:attachment ri:filename="photo.png" /></ac:image>',
  },
  {
    name: "image-url",
    xml: '<ac:image><ri:url ri:value="https://example.com/x.png" /></ac:image>',
  },
  {
    name: "table-cell-single-p",
    xml: "<table><tbody><tr><th><p><strong>Table 1</strong></p></th><th><p><strong>Table 2</strong></p></th></tr><tr><td><p>elm 1</p></td><td><p>elm 2</p></td></tr></tbody></table>",
  },
  {
    name: "table-cell-multi-block",
    xml: '<table><tbody><tr><td><p>para 1</p><p>para 2</p></td><td><blockquote data-macro-type="info"><p>info</p></blockquote></td></tr></tbody></table>',
  },
  {
    name: "hr-with-attrs",
    xml: '<p>Avant</p><hr data-x="1" /><p>Après</p>',
  },
  {
    // Limitation connue : aucun convertisseur dédié pour <ri:user> - la mention est
    // supprimée silencieusement (pas de "@Nom" ni d'avertissement). Voir preprocess.ts.
    name: "user-mention",
    xml: '<p>Mention à <ri:user ri:account-id="712020:70035bdf" ri:local-id="7fcbba39" /></p>',
  },
  {
    name: "nested-list-in-cell",
    xml: "<table><tbody><tr><td><ul><li><p>Liste 1</p></li><li><p>Liste 2</p><ul><li><p>Sous liste 1</p></li></ul></li></ul></td></tr></tbody></table>",
  },
  {
    name: "ordered-list-in-cell",
    xml: '<table><tbody><tr><td><ol start="1"><li><p>Numéro 1</p></li><li><p>Numéro 2</p><ol start="1"><li><p>Sous numero a</p></li></ol></li></ol></td></tr></tbody></table>',
  },
];
