import { nextTaskId } from "../conversion-state.js";
import { findDivEnd } from "../../shared/read-storage-format.js";

// id séquentiel (pas d'UUID, le publish régénère). Partagé par renderList et taskDivToXml.
export function emitTask(id: number, status: string, body: string): string {
  return [
    `<ac:task>`,
    `  <ac:task-id>${id}</ac:task-id>`,
    `  <ac:task-status>${status}</ac:task-status>`,
    `  <ac:task-body><span class="placeholder-inline-tasks">${body}</span></ac:task-body>`,
    `</ac:task>`,
  ].join("\n");
}

// <div data-ac-task-list> → <ac:task-list>, sous-listes émises en FRÈRES des <ac:task>.
export function taskListDivToXml(html: string): string {
  const openEnd = html.indexOf(">");
  if (openEnd === -1) return html;
  const lastClose = html.lastIndexOf("</div>");
  const inner = html.slice(openEnd + 1, lastClose < 0 ? html.length : lastClose);

  const parts: string[] = [];
  let pos = 0;
  while (pos < inner.length) {
    const divIdx = inner.indexOf("<div", pos);
    if (divIdx === -1) break;
    const tagEnd = inner.indexOf(">", divIdx);
    if (tagEnd === -1) break;
    const tag = inner.slice(divIdx, tagEnd + 1);
    const end = findDivEnd(inner, divIdx);
    if (tag.includes("data-ac-task-list")) {
      parts.push(taskListDivToXml(inner.slice(divIdx, end)));
    } else if (tag.includes("data-ac-task")) {
      parts.push(taskDivToXml(inner.slice(divIdx, end)));
    }
    pos = end;
  }

  return `<ac:task-list>\n${parts.join("\n")}\n</ac:task-list>`;
}

// <div data-ac-task> → <ac:task>, avec sous-listes imbriquées émises en FRÈRES.
function taskDivToXml(html: string): string {
  const status = html.match(/data-status="(\w+)"/)?.[1] ?? "incomplete";
  const openEnd = html.indexOf(">");
  const lastClose = html.lastIndexOf("</div>");
  const inner = html.slice(openEnd + 1, lastClose < 0 ? html.length : lastClose);

  const taskId = nextTaskId(); // id avant les sous-listes pour respecter l'ordre documentaire

  let bodyText = "";
  const subListsXml: string[] = [];
  let pos = 0;
  let textStart = 0;
  while (pos < inner.length) {
    const subIdx = inner.indexOf("<div data-ac-task-list", pos);
    if (subIdx === -1) break;
    const textBefore = inner.slice(textStart, subIdx).replace(/<[^>]+>/g, "").trim();
    if (textBefore) bodyText += (bodyText ? " " : "") + textBefore;
    const subEnd = findDivEnd(inner, subIdx);
    subListsXml.push(taskListDivToXml(inner.slice(subIdx, subEnd)));
    pos = subEnd;
    textStart = subEnd;
  }
  const remaining = inner.slice(textStart).replace(/<[^>]+>/g, "").trim();
  if (remaining) bodyText += (bodyText ? " " : "") + remaining;

  const taskXml = emitTask(taskId, status, bodyText);
  return subListsXml.length > 0 ? taskXml + "\n" + subListsXml.join("\n") : taskXml;
}
