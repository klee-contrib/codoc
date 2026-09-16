// Forme ATTENDUE de codoc.yaml une fois parsé. Ce n'est pas une validation runtime
// (le YAML reste une entrée non fiable, d'où les champs optionnels et les `?.`) mais
// un contrat de forme : il documente la structure et fait échouer le typecheck sur
// une faute de frappe dans les parseurs.

import yaml from "js-yaml";

import {fileExists, readFile} from "../services/files-service.js";
import {CONFIG_PATH} from "./codoc-paths.js";

/** Normalise une valeur yaml optionnelle (string ou tableau) en tableau de strings non vides et trimées. */
export function asStringList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => String(s).trim()).filter(Boolean);
}

/** Sous-ensemble de jira: utile à codoc (macro Jira dans les pages Confluence publiées). Le reste
 * (baseUrl, ticketPrefix, transitions, members, roleFields…) est hors périmètre de codoc. */
export interface RawJira {
  serverId?: string | number;
  server?: string | number;
}

export interface RawDrawio {
  macroName?: string;
  width?: number;
  edgeStyle?: "curved" | "orthogonal" | "straight";
  edgeAnchor?: "auto" | "side";
  colWidth?: number;
  rowStep?: number;
}

export interface RawGitLab {
  baseUrl?: string;
  defaultBranch?: string;
}

export interface RawAtlassianEnv {
  baseUrl?: string;
  spaceKey?: string;
  defaultParentPageId?: string | number;
}

export interface RawKeywordOverride {
  path?: string;
  keywords?: string | string[];
}

export interface RawDocEntry {
  codocId?: string | number;
  path: string;
  maintainedIn?: string;
  env?: string;
  imagesDir?: string;
  keywords?: string | string[];
  keywordOverrides?: RawKeywordOverride[];
  generateSummary?: boolean;
  confluence?: {
    title?: string;
    parentPageId?: string | number;
    titlePrefix?: string;
  };
}

export interface RawCodocConfig {
  atlassian?: {environments?: Record<string, RawAtlassianEnv>};
  jira?: RawJira;
  drawio?: RawDrawio;
  gitlab?: RawGitLab;
  docs?: RawDocEntry[];
  autoUpdate?: boolean;
}

let cache: RawCodocConfig | undefined;

export function loadRawConfig(options: {required?: boolean} = {}): RawCodocConfig {
  if (cache) return cache;
  if (!fileExists(CONFIG_PATH)) {
    if (options.required) throw new Error(`Configuration introuvable : ${CONFIG_PATH}`);
    return {};
  }
  cache = (yaml.load(readFile(CONFIG_PATH)) as RawCodocConfig) ?? {};
  return cache;
}

/** À appeler après toute écriture de codoc.yaml en cours de process (ex. ajout d'un environnement ad-hoc),
 * pour qu'un prochain appel relise le fichier au lieu de servir l'état pré-écriture. */
export function resetConfigCache(): void {
  cache = undefined;
}
