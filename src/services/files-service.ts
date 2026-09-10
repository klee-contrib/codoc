import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_SKIP_DIRS = ['node_modules', '.git', 'target', 'build', 'generated-sources']

/** Lit le contenu texte d'un fichier (UTF-8). */
export function readFile(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf8')
}

/** Vrai si le chemin existe (fichier ou dossier). */
export function fileExists(absolutePath: string): boolean {
  return fs.existsSync(absolutePath)
}

/** Convertit les séparateurs Windows (`\`) en séparateurs POSIX (`/`), sans autre normalisation. */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Crée un dossier (et ses parents) s'il n'existe pas déjà. */
export function ensureDir(absoluteDirectoryPath: string): void {
  fs.mkdirSync(absoluteDirectoryPath, {recursive: true})
}

/** Vrai si le chemin existe et est un dossier. */
export function isDirectory(absolutePath: string): boolean {
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()
}

/**
 * Aligne les fins de ligne du contenu sur celles de la plateforme d'exécution
 * (CRLF sous Windows, LF ailleurs) - le code du projet écrit toujours en `\n`,
 * sans ça les fichiers générés diffèrent systématiquement de la convention du
 * dépôt cible sous Windows (diffs entiers dus uniquement aux fins de ligne).
 */
function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n/g, os.EOL)
}

/** Écrit un fichier texte (UTF-8), en créant le dossier parent au besoin. Fins de ligne alignées sur `os.EOL`. */
export function writeFile(absolutePath: string, content: string): void {
  ensureDir(path.dirname(absolutePath))
  fs.writeFileSync(absolutePath, normalizeEol(content), 'utf8')
}

/** Écrit un fichier binaire (Buffer), en créant le dossier parent au besoin. */
export function writeBinaryFile(absolutePath: string, content: Buffer): void {
  ensureDir(path.dirname(absolutePath))
  fs.writeFileSync(absolutePath, content)
}

/** Supprime un fichier ou dossier (récursif), sans erreur s'il est déjà absent. */
export function removePath(absolutePath: string): void {
  fs.rmSync(absolutePath, {recursive: true, force: true})
}

/** Liste récursivement les fichiers dont l'extension figure dans `exts` (dossiers de build ignorés). */
export async function collectFiles(
  dir: string,
  exts: string[],
  skipDirs: string[] = DEFAULT_SKIP_DIRS,
): Promise<string[]> {
  const skip = new Set(skipDirs)
  const entries = await fsPromises.readdir(dir, {withFileTypes: true})
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue
      files.push(...(await collectFiles(fullPath, exts, skipDirs)))
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      files.push(fullPath)
    }
  }

  return files
}
