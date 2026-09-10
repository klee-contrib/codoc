import {CONFIG_PATH} from '../../config/codoc-paths.js'
import {readFile, writeFile} from '../../services/files-service.js'
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
