import { escapeXml, unescapeXml } from "../../shared/xml-escaping.js";
import { JIRA_KEY_PATTERN } from "../../shared/jira.js";
import { RICH_BODY_MACRO_TYPES_PATTERN } from "../../shared/macro-types.js";
import { findDivEnd } from "../../shared/read-storage-format.js";
import { taskListDivToXml } from "./task-lists.js";
import { buildJiraMacro } from "../links.js";
import { confluenceLanguage } from "../languages.js";

const RAW_JIRA_LINK_RE = new RegExp(`<a\\s+href="([^"]*/browse/(${JIRA_KEY_PATTERN})[^"]*)"[^>]*>([^<]*)</a>`, "gi");
const RAW_BLOCKQUOTE_MACRO_RE = new RegExp(
  `<blockquote([^>]*)data-macro-type="(${RICH_BODY_MACRO_TYPES_PATTERN})"([^>]*)>([\\s\\S]*?)</blockquote>`,
  "gi",
);

// <div data-ac-task-list> → <ac:task-list>.
// Ex. `<div data-ac-task-list="1"><div data-ac-task="1" data-status="complete">Faire X</div></div>` → `<ac:task-list><ac:task>...</ac:task></ac:task-list>`
function expandTaskListDivs(html: string): string {
  if (!html.includes("data-ac-task-list")) return html;
  const parts: string[] = [];
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf("<div data-ac-task-list", pos);
    if (idx === -1) { parts.push(html.slice(pos)); break; }
    parts.push(html.slice(pos, idx));
    const end = findDivEnd(html, idx);
    parts.push(taskListDivToXml(html.slice(idx, end)));
    pos = end;
  }
  return parts.join("");
}

// Restaure le XML d'origine depuis la sentinelle (2 formats : base64 écrit sur disque, ou XML échappé en mémoire).
// Ex. `<div data-confluence-macro="PGFjOnN0cnVjdHVyZWQtbWFjcm8vPg==">...</div>` → `<ac:structured-macro/>`
function restorePreservedMacros(html: string): string {
  let s = html;
  if (s.includes("data-confluence-macro=")) {
    s = s.replace(
      /<div[^>]*\sdata-confluence-macro="([^"]*)"[^>]*>\s*<\/div>/gi,
      (_, b64: string) => Buffer.from(b64, "base64").toString("utf-8"),
    );
  }
  if (s.includes("data-confluence-macro-preserved")) {
    s = s.replace(
      /<div[^>]*data-confluence-macro-preserved[^>]*>([\s\S]*?)<\/div>/gi,
      (_, escaped: string) => unescapeXml(escaped),
    );
  }
  return s;
}

const stripHtmlComments = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, "");

// <blockquote data-macro-type> → <ac:structured-macro> (tables HTML brutes).
// Ex. `<blockquote data-macro-type="info">Attention</blockquote>` → `<ac:structured-macro ac:name="info"><ac:rich-text-body>Attention</ac:rich-text-body></ac:structured-macro>`
function rawBlockquotesToMacros(s: string): string {
  return s.replace(
    RAW_BLOCKQUOTE_MACRO_RE,
    (fullMatch, _before, type: string, _after, content: string) => {
      const title = fullMatch.match(/data-macro-title="([^"]*)"/i)?.[1]?.trim() ?? "";
      const lines = [`<ac:structured-macro ac:name="${type}">`];
      if (title) lines.push(`  <ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>`);
      lines.push(`  <ac:rich-text-body>${content}</ac:rich-text-body>`);
      lines.push(`</ac:structured-macro>`);
      return lines.join("\n");
    },
  );
}

// <a href=".../browse/KEY">KEY</a> → macro jira (si le texte == la clé et Jira configuré).
// Ex. `<a href="https://x.atlassian.net/browse/DEP-123">DEP-123</a>` → `<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">DEP-123</ac:parameter></ac:structured-macro>`
function rawJiraLinksToMacros(s: string): string {
  return s.replace(
    RAW_JIRA_LINK_RE,
    (full, url: string, key: string, text: string) => (text.trim() === key ? buildJiraMacro(key, url) : full),
  );
}

// Ex. `<img src="img/photo.png">` → `<ac:image><ri:attachment ri:filename="photo.png" /></ac:image>`
function rawLocalImagesToAttachments(s: string): string {
  return s.replace(/<img\s[^>]*src="(?!https?:\/\/)([^"]+)"[^>]*\/?>/gi, (_, src: string) => {
    const filename = src.split("/").pop() ?? src;
    return `<ac:image><ri:attachment ri:filename="${filename}" /></ac:image>`;
  });
}

// Ex. `<img src="https://x.com/p.png">` → `<ac:image><ri:url ri:value="https://x.com/p.png" /></ac:image>`
const rawExternalImagesToUrls = (s: string): string =>
  s.replace(
    /<img\s[^>]*src="(https?:\/\/[^"]+)"[^>]*\/?>/gi,
    (_, url: string) => `<ac:image><ri:url ri:value="${url}" /></ac:image>`,
  );

// Ex. `<pre><code class="language-js">const x = 1</code></pre>` → `<ac:structured-macro ac:name="code">...<![CDATA[const x = 1]]>...</ac:structured-macro>`
function rawCodeBlocksToMacros(s: string): string {
  return s.replace(
    /<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/gi,
    (_, lang: string | undefined, code: string) => {
      const cfLang = confluenceLanguage(lang);
      const decoded = unescapeXml(code); // entités introduites par escapeXml au pull
      const lines: string[] = [`<ac:structured-macro ac:name="code">`];
      if (cfLang && cfLang !== "none") lines.push(`  <ac:parameter ac:name="language">${cfLang}</ac:parameter>`);
      lines.push(`  <ac:plain-text-body><![CDATA[${decoded}]]></ac:plain-text-body>`);
      lines.push(`</ac:structured-macro>`);
      return lines.join("\n");
    },
  );
}

// Balises non supportées par le Fabric editor → retirées (contenu gardé).
// Ex. `<section>Texte</section>` → `Texte`
const stripUnsupportedTags = (s: string): string =>
  s.replace(
    /<\/?(div|section|article|aside|header|footer|main|nav|details|summary|figure|figcaption|template|time|mark|ruby|rp|rt)[^>]*>/gi,
    "",
  );

// <span> sans couleur → contenu seul (garde les <span style="color:…">).
// Ex. `<span class="foo">Texte</span>` → `Texte`
const stripNonColorSpans = (s: string): string =>
  s
    .replace(/<span(?![^>]*\bcolor\b)[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<span(?![^>]*\bcolor\b)[^>]*>/gi, "");

// Attributs propriétaires retirés (whitelist : data-card-appearance, data-layout, data-confluence-status).
// Ex. `<p local-id="abc" data-foo="x">Texte</p>` → `<p>Texte</p>`
const stripProprietaryAttributes = (s: string): string =>
  s.replace(/\s+(?:local-id|ac:local-id|data-(?!(?:card-appearance|layout|confluence-status)\b)[\w-]+)="[^"]*"/gi, "");

const RAW_HTML_STEPS: Array<(s: string) => string> = [
  stripHtmlComments,
  rawBlockquotesToMacros,
  rawJiraLinksToMacros,
  rawLocalImagesToAttachments,
  rawExternalImagesToUrls,
  rawCodeBlocksToMacros,
  stripUnsupportedTags,
  stripNonColorSpans,
  stripProprietaryAttributes,
];

export function sanitizeRawHtml(html: string): string {
  // Expansion des task-lists et restauration des macros AVANT le stripping des div.
  let processed = expandTaskListDivs(html);
  processed = restorePreservedMacros(processed);
  for (const step of RAW_HTML_STEPS) processed = step(processed);
  return processed.trim();
}
