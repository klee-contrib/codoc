import { escapeXml } from "../../shared/xml-escaping.js";
import { RICH_BODY_MACRO_TYPES_PATTERN } from "../../shared/macro-types.js";
import { macroParam } from "../../shared/read-storage-format.js";
import { preserveAsSentinel } from "../../shared/preserved-macros.js";
import { EMBEDDED_ATTACHMENT_PATTERNS, renderAttachmentTag } from "../../shared/image-attachments.js";
import {
  preserveDrawioMacros,
  convertJiraElements,
  richMacroToBlockquote,
  convertStatusMacros,
} from "./macro-converters.js";
import { findDivEnd } from "../../shared/read-storage-format.js";

// Cases à cocher → <div> porteurs.
// Ex. `<ac:task-list><ac:task>...</ac:task></ac:task-list>` → `<div data-ac-task-list="1">...</div>`
export function convertTaskLists(html: string): string {
  const convertInnermostLevel = (h: string): string =>
    h.replace(
      /<ac:task-list[^>]*>((?:(?!<ac:task-list)[\s\S])*?)<\/ac:task-list>/g,
      (_, content: string) => {
        interface TaskEntry { pos: number; kind: "task"; status: string; body: string; }
        interface SubEntry { pos: number; kind: "sub"; html: string; }
        type Entry = TaskEntry | SubEntry;
        const entries: Entry[] = [];

        const taskRe = /<ac:task[^>]*>([\s\S]*?)<\/ac:task>/g;
        let m: RegExpExecArray | null;
        while ((m = taskRe.exec(content)) !== null) {
          const inner = m[1];
          const status = inner.match(/<ac:task-status>(\w+)<\/ac:task-status>/)?.[1] ?? "incomplete";
          const rawBody = inner.match(/<ac:task-body>([\s\S]*?)<\/ac:task-body>/)?.[1] ?? "";
          // Garder les <div> (sous-listes déjà converties), retirer le reste.
          const body = rawBody.replace(/<(?!\/?div\b)[^>]+>/g, "").trim();
          entries.push({ pos: m.index, kind: "task", status, body });
        }

        let searchStart = 0;
        while (true) {
          const idx = content.indexOf("<div data-ac-task-list", searchStart);
          if (idx === -1) break;
          const closeEnd = findDivEnd(content, idx);
          entries.push({ pos: idx, kind: "sub", html: content.slice(idx, closeEnd) });
          searchStart = closeEnd;
        }

        entries.sort((a, b) => a.pos - b.pos);

        // Une sous-liste appartient au dernier <ac:task> qui la précède.
        const items: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (e.kind !== "task") continue;
          let subHtml = "";
          if (i + 1 < entries.length && entries[i + 1].kind === "sub") {
            subHtml = (entries[i + 1] as SubEntry).html;
            i++;
          }
          items.push(`<div data-ac-task="1" data-status="${e.status}">${e.body}${subHtml}</div>`);
        }

        return `<div data-ac-task-list="1">\n${items.join("\n")}\n</div>`;
      },
    );

  let prev = "";
  let cur = html;
  while (prev !== cur) {
    prev = cur;
    cur = convertInnermostLevel(cur);
  }
  return cur;
}

// Bannière "Généré le…" et toc → supprimées.
// Ex. `<ac:structured-macro ac:name="info">…Généré le…</ac:structured-macro>` → ``
function stripGeneratedBanner(html: string): string {
  html = html.replace(
    /<ac:structured-macro[^>]*ac:name="info"[^>]*>[\s\S]*?Généré le[\s\S]*?<\/ac:structured-macro>/g,
    "",
  );
  return html.replace(
    /<ac:structured-macro[^>]*ac:name="toc"[^>]*\/>|<ac:structured-macro[^>]*ac:name="toc"[^>]*>[\s\S]*?<\/ac:structured-macro>/g,
    "",
  );
}

// Dates → 📅 YYYY-MM-DD.
// Ex. `<time datetime="2026-01-22">...</time>` → `📅 2026-01-22`
function convertTimeElements(html: string): string {
  html = html.replace(/<time[^>]*datetime="([^"]+)"[^>]*>[\s\S]*?<\/time>/g, (_, dt: string) => `📅 ${dt}`);
  html = html.replace(/<time[^>]*datetime="([^"]+)"[^>]*\/>/g, (_, dt: string) => `📅 ${dt}`);
  html = html.replace(/<time[^>]*>[\s\S]*?<\/time>/g, "");
  return html.replace(/<time[^>]*\/>/g, "");
}

// info/note/warning/tip/expand → blockquote typé.
// Ex. `<ac:structured-macro ac:name="info">...</ac:structured-macro>` → `<blockquote data-macro-type="info">...</blockquote>`
const RICH_BODY_MACRO_RE = new RegExp(
  `<ac:structured-macro[^>]*ac:name="(${RICH_BODY_MACRO_TYPES_PATTERN})"[^>]*>([\\s\\S]*?)<\\/ac:structured-macro>`,
  "g",
);
function convertRichBodyMacros(html: string): string {
  return html.replace(RICH_BODY_MACRO_RE, (_, type: string, inner: string) => richMacroToBlockquote(type, inner));
}

// Macro code → <pre><code>.
// Ex. `<ac:structured-macro ac:name="code">...<![CDATA[const x = 1]]>...</ac:structured-macro>` → `<pre><code class="language-js">const x = 1</code></pre>`
function convertCodeMacros(html: string): string {
  return html.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g,
    (_, inner: string) => {
      const lang = macroParam(inner, "language") ?? "";
      const code = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] ?? "";
      // Recolle un CDATA scindé par escapeCdata côté publish (`]]><![CDATA[>` → `]]>`).
      const unescaped = code.replace(/\]\]>\s*<!\[CDATA\[>/g, "]]>");
      return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeXml(unescaped)}</code></pre>`;
    },
  );
}

// Attachment intégré → <img>/<video>/<a> selon le type.
// Ex. `<ac:image><ri:attachment ri:filename="photo.png"/></ac:image>` → `<img src="img/photo.png" alt="photo.png">`
function convertImages(html: string, imgRelPath?: string): string {
  for (const pattern of EMBEDDED_ATTACHMENT_PATTERNS) {
    html = html.replace(pattern, (_, rawFilename: string) => renderAttachmentTag(rawFilename, imgRelPath));
  }
  return html.replace(
    /<ac:image[^>]*>[\s\S]*?<ri:url[^>]*ri:value="([^"]+)"[^>]*\/>[\s\S]*?<\/ac:image>/g,
    (_, url: string) => `<img src="${url}" alt="">`,
  );
}

// Cellule à <p> unique → contenu inline.
// Ex. `<td><p>Contenu</p></td>` → `<td>Contenu</td>`
function collapseSingleParagraphCells(html: string): string {
  return html.replace(
    /<(th|td)([^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/(th|td)>/gi,
    (match, open: string, attrs: string, content: string, close: string) =>
      open.toLowerCase() === close.toLowerCase() ? `<${open}${attrs}>${content}</${close}>` : match,
  );
}

// Macro inconnue (whiteboard…) → sentinelle préservée.
// Ex. `<ac:structured-macro ac:name="whiteboard">...</ac:structured-macro>` → `<div data-confluence-macro-preserved="1">...</div>`
function preserveUnknownMacros(html: string): string {
  return html.replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/g, (m) => preserveAsSentinel(m));
}

// Nettoyage final : attributs propriétaires, <hr>, balises ac:/ri: restantes.
// Ex. `<ac:layout><ac:layout-cell>Texte</ac:layout-cell></ac:layout>` → `Texte`
function stripFinalArtifacts(html: string): string {
  html = html.replace(
    /\s+(?:local-id|ac:local-id|data-table-width|data-layout|data-card-appearance|data-datasource)="[^"]*"/g,
    "",
  );
  html = html.replace(/<hr[^>]+>/g, "<hr/>");
  html = html.replace(/<\/?ac:[a-z-]+(?:\s[^>]*)?\/?>/g, "");
  return html.replace(/<\/?ri:[a-z-]+(?:\s[^>]*)?\/?>/g, "");
}

export function preprocessStorage(xml: string, imgRelPath?: string, baseUrl?: string): string {
  // Base URL Jira = domaine Confluence sans /wiki.
  const jiraBase = baseUrl ? baseUrl.replace(/\/wiki\/?$/, "").replace(/\/$/, "") : "";

  const PREPROCESS_STEPS: Array<(html: string) => string> = [
    stripGeneratedBanner,
    convertTaskLists,
    preserveDrawioMacros,
    (html) => convertJiraElements(html, jiraBase),
    convertTimeElements,
    convertRichBodyMacros,
    convertStatusMacros,
    convertCodeMacros,
    (html) => convertImages(html, imgRelPath),
    collapseSingleParagraphCells,
    preserveUnknownMacros,
    stripFinalArtifacts,
  ];

  return PREPROCESS_STEPS.reduce((html, step) => step(html), xml);
}
