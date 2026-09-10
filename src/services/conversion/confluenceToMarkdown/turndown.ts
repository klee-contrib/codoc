import TurndownService from "turndown";
// @ts-ignore
import { gfm } from "turndown-plugin-gfm";

import { PRESERVED_MACRO_ATTR } from "../shared/preserved-macros.js";

let cached: TurndownService | undefined;

/** Instance mémoïsée : TurndownService + ses règles n'ont pas d'état entre deux `.turndown()`. */
export function buildTurndown(): TurndownService {
  if (cached) return cached;
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    hr: "---",
    fence: "```",
  });

  td.use(gfm);

  // <u> et <span style="color:…"> : pas d'équivalent GFM → conservés en HTML.
  td.addRule("underline", {
    filter: ["u"],
    replacement: (content: string) => `<u>${content}</u>`,
  });

  // <video> (attachment vidéo intégré via <ac:image> côté Confluence - voir
  // convertImages/classifyAttachment) : pas d'équivalent markdown → conservé en HTML brut.
  td.addRule("video", {
    filter: ["video"],
    replacement: (_content: string, node: any) => `<video src="${node.getAttribute("src") ?? ""}" controls></video>`,
  });

  td.addRule("color-span", {
    filter: (node: any) => node.nodeName === "SPAN" && /\bcolor\b/.test(node.getAttribute("style") ?? ""),
    replacement: (content: string, node: any) => `<span style="${node.getAttribute("style") ?? ""}">${content}</span>`,
  });

  // Badge status : ajouté APRÈS color-span pour gagner (cf. gotcha unshift ci-dessus).
  td.addRule("confluence-status", {
    filter: (node: any) => node.nodeName === "SPAN" && !!node.getAttribute("data-confluence-status"),
    replacement: (content: string, node: any) => {
      const colour: string = node.getAttribute("data-confluence-status") ?? "Grey";
      const style: string = node.getAttribute("style") ?? "";
      return `<span data-confluence-status="${colour}" style="${style}">${content}</span>`;
    },
  });

  // Tâches : conteneur transparent, items → cases GFM (sous-tâches indentées de 2 espaces).
  td.addRule("confluence-task-list", {
    filter: (node: any) => node.nodeName === "DIV" && !!node.getAttribute("data-ac-task-list"),
    replacement: (content: string) => `\n\n${content.trim()}\n\n`,
  });

  td.addRule("confluence-task-item", {
    filter: (node: any) => node.nodeName === "DIV" && !!node.getAttribute("data-ac-task"),
    replacement: (content: string, node: any) => {
      const checkbox = node.getAttribute("data-status") === "complete" ? "[x]" : "[ ]";
      const trimmed = content.replace(/^\n+|\n+$/g, "");
      const nestedIdx = trimmed.search(/\n\n-\s+\[/);
      if (nestedIdx === -1) return `\n- ${checkbox} ${trimmed}`;
      const body = trimmed.slice(0, nestedIdx).trim();
      const nested = "\n" + trimmed.slice(nestedIdx).trimStart().replace(/^/gm, "  ");
      return `\n- ${checkbox} ${body}${nested}`;
    },
  });

  // Macro à corps riche → citation `> [type]`. Marqueur construit en JS (pas d'échappement).
  td.addRule("confluence-macro-blockquote", {
    filter: (node: any) => node.nodeName === "BLOCKQUOTE" && !!node.getAttribute("data-macro-type"),
    replacement: (content: string, node: any) => {
      const type: string = node.getAttribute("data-macro-type") ?? "";
      const title: string = node.getAttribute("data-macro-title") ?? "";
      const marker = title ? `[${type} ${title}]` : `[${type}]`;
      const body = content.replace(/^\n+|\n+$/g, "").replace(/^/gm, "> ");
      return `\n\n> ${marker}\n>\n${body}\n\n`;
    },
  });

  // Sentinelle préservée → porteur CACHÉ base64 (div vide, invisible en preview).
  // base64 évite tout souci de guillemets / sauts de ligne / `<` dans l'attribut.
  td.addRule("confluence-preserved-macro", {
    filter: (node: any) => node.nodeName === "DIV" && !!node.getAttribute(PRESERVED_MACRO_ATTR),
    replacement: (_content: string, node: any) => {
      const b64 = Buffer.from(node.textContent ?? "", "utf-8").toString("base64");
      return `\n\n<div data-confluence-macro="${b64}"></div>\n\n`;
    },
  });

  td.addRule("empty-wrapper", {
    filter: (node: any) =>
      ["DIV", "SPAN"].includes(node.nodeName) &&
      !node.getAttribute("data-type") &&
      node.textContent.trim() === "",
    replacement: () => "",
  });

  cached = td;
  return td;
}
