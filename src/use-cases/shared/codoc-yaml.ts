import {resetCodocConfigCache} from '../../config/codoc-config.js'
import {resetConfigCache} from '../../config/codoc-config-raw.js'
import {CONFIG_PATH} from '../../config/codoc-paths.js'
import {fileExists, readFile, writeFile} from '../../services/files-service.js'
import {MaintainedIn} from '../../types/codoc-types.js'

// Édition textuelle (par bloc) de codoc.yaml, sans re-sérialisation YAML.

// Params d'une entrée `docs:` → bloc YAML texte prêt à insérer.
// Ex. `{localPath: "doc/glossaire-cu.md", title: "Glossaire CU", maintainedIn: "code", codocId: "abc123"}` → `"\n  - codocId: abc123\n    path: doc/glossaire-cu.md\n    maintainedIn: code\n    confluence:\n      title: \"Glossaire CU\""`
export function buildYamlEntry(params: {
  localPath: string
  /** Titre de la page (omis pour un dossier/glob, où chaque page est titrée individuellement). */
  title?: string
  parentPageId?: string
  imagesDir?: string
  maintainedIn: MaintainedIn
  /** Clé d'environnement à écrire (omise si un seul environnement est défini). */
  env?: string
  /** Identifiant stable yaml↔lock (écrit en tête d'entrée si fourni). */
  codocId?: string
}): string {
  const lines: string[] = []
  if (params.codocId) {
    lines.push(`\n  - codocId: ${params.codocId}`)
    lines.push(`    path: ${params.localPath}`)
  } else {
    lines.push(`\n  - path: ${params.localPath}`)
  }
  lines.push(`    maintainedIn: ${params.maintainedIn}`)

  if (params.env) {
    lines.push(`    env: ${params.env}`)
  }

  if (params.imagesDir) {
    lines.push(`    imagesDir: ${params.imagesDir}`)
  }

  if (params.title || params.parentPageId) {
    lines.push(`    confluence:`)
    if (params.title) lines.push(`      title: "${params.title.replace(/"/g, '\\"')}"`)
    if (params.parentPageId) lines.push(`      parentPageId: "${params.parentPageId}"`)
  }

  return lines.join('\n')
}

// Contenu YAML → même contenu privé des entrées `- path:` listées dans `paths`.
// Ex. `removeEntriesFromYaml("docs:\n  - path: a.md\n  - path: b.md\n", ["b.md"])` → `"docs:\n  - path: a.md\n"`
export function removeEntriesFromYaml(content: string, paths: string[]): string {
  const targets = new Set(paths)
  const lines = content.split('\n')
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(/^\s*-\s+path:\s*(.+?)\s*$/)
    const pathValue = m?.[1]?.replace(/^["']|["']$/g, '')
    if (pathValue && targets.has(pathValue)) {
      // Saute tout le bloc de l'entrée (path + lignes indentées qui suivent).
      i++
      while (i < lines.length && lines[i].trim() !== '' && !/^\s*-\s+path:/.test(lines[i]) && !/^\S/.test(lines[i])) {
        i++
      }
      continue
    }
    result.push(lines[i])
    i++
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

export async function appendToDocsConfig(entry: string): Promise<void> {
  // Ajoute l'entrée en fin de fichier (le bloc docs: est toujours la dernière section).
  const existing = readFile(CONFIG_PATH)
  writeFile(CONFIG_PATH, existing.trimEnd() + entry + '\n')
}

export async function removeDocsConfigEntries(paths: string[]): Promise<void> {
  writeFile(CONFIG_PATH, removeEntriesFromYaml(readFile(CONFIG_PATH), paths))
}

function buildEnvBlock(key: string, baseUrl: string, spaceKey: string): string {
  const spaceKeyLine = spaceKey ? `      spaceKey: ${spaceKey}\n` : '      spaceKey: TODO # requis pour publish/sync\n'
  return `    ${key}:\n      baseUrl: ${baseUrl}\n${spaceKeyLine}`
}

function resetConfigCaches(): void {
  resetConfigCache()
  resetCodocConfigCache()
}

export async function addAtlassianEnvironment(key: string, baseUrl: string, spaceKey: string): Promise<'created' | 'inserted' | 'manual' | 'exists'> {
  const block = buildEnvBlock(key, baseUrl, spaceKey)

  if (!fileExists(CONFIG_PATH)) {
    writeFile(CONFIG_PATH, `atlassian:\n  environments:\n${block}`)
    resetConfigCaches()
    return 'created'
  }

  const existing = readFile(CONFIG_PATH)
  const match = existing.match(/^atlassian:\r?\n\s*environments:\r?\n/m)
  if (match) {
    const hasKeyAlready = existing.split(/\r?\n/).some((line) => line.trim() === `${key}:`)
    if (hasKeyAlready) return 'exists'

    const insertAt = match.index! + match[0].length
    writeFile(CONFIG_PATH, existing.slice(0, insertAt) + block + existing.slice(insertAt))
    resetConfigCaches()
    return 'inserted'
  }

  if (/^atlassian:/m.test(existing)) return 'manual'

  writeFile(CONFIG_PATH, `atlassian:\n  environments:\n${block}\n${existing}`)
  resetConfigCaches()
  return 'created'
}
