// État mutable partagé de la conversion (options + compteur de task-id) - beginConversion le réinitialise à chaque conversion.

import type {MdLinkResolver} from "../shared/confluence-page-link.js";

export interface ConversionOptions {
  sourceFile?: string;
  jira?: { serverId?: string; server?: string };
  /** Config GitLab de l'environnement du doc (réécriture des liens relatifs en URLs source). */
  gitlab?: { baseUrl?: string; branch?: string };
  /** Résout un lien relatif vers un autre .md publié → URL Confluence, si connue (cf. sync-actions.ts). */
  resolveMdLink?: MdLinkResolver;
}

let convCtx: ConversionOptions = {};
let taskIdCounter = 0;

export function beginConversion(options: ConversionOptions): void {
  convCtx = options;
  taskIdCounter = 0;
}

export function endConversion(): void {
  convCtx = {};
}

export function conversionOptions(): ConversionOptions {
  return convCtx;
}

export function nextTaskId(): number {
  return ++taskIdCounter;
}
