// État mutable partagé de la conversion (options + compteur de task-id) - beginConversion le réinitialise à chaque conversion.

export interface ConversionOptions {
  sourceFile?: string;
  jira?: { serverId?: string; server?: string };
  /** Config GitLab de l'environnement du doc (réécriture des liens relatifs en URLs source). */
  gitlab?: { baseUrl?: string; branch?: string };
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
