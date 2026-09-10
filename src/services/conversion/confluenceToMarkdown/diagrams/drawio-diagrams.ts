import path from 'path'

import {sanitizeAttachmentFilename} from '../../shared/image-attachments.js'
import {ensureDir, writeBinaryFile} from '../../../files-service.js'
import {log} from '../../../log/logger.js'
import {macroParam, macroRegex} from '../../shared/read-storage-format.js'
import {escapeXml} from '../../shared/xml-escaping.js'
import {extractGraphModel, renderDrawioToPng} from './drawio-to-image.js'

interface DrawioBlock {
  /** Le fragment XML complet du bloc (macro classique ou extension ADF). */
  full: string
  /** Nom de la pièce jointe .drawio à télécharger. */
  fileName: string
  /** Position de `full` dans le xml d'origine - pour la substitution en une seule passe. */
  start: number
}

/** Repère les blocs draw.io (macro classique + extension ADF), avec nom de pièce jointe. */
function findDrawioBlocks(xml: string): DrawioBlock[] {
  const out: DrawioBlock[] = []

  for (const m of xml.matchAll(macroRegex('drawio'))) {
    const block = m[0]
    const name = macroParam(block, 'attachment') ?? macroParam(block, 'diagramName')
    if (name) out.push({full: block, fileName: name, start: m.index ?? 0})
  }

  for (const m of xml.matchAll(/<ac:adf-extension>[\s\S]*?<\/ac:adf-extension>/g)) {
    const block = m[0]
    if (!/drawio/i.test(block)) continue
    const name = block.match(/key="diagram-name">([^<]+)<\/ac:adf-parameter>/)?.[1]
    if (name) out.push({full: block, fileName: name.trim(), start: m.index ?? 0})
  }

  // Les deux passes (macro classique / extension ADF) peuvent revenir dans le désordre -
  // trié par position pour permettre la reconstruction en une seule passe ci-dessous.
  return out.sort((a, b) => a.start - b.start)
}

/** Nom de pièce jointe draw.io → nom de fichier .png local stable (même diagramme = même nom au fil des pulls). */
function pngFilenameFor(fileName: string): string {
  const withoutExt = fileName.replace(/\.drawio$/i, '')
  return `${sanitizeAttachmentFilename(withoutExt)}.png`
}

function imgTag(fileName: string, localFilename: string, imgRelPath: string | undefined): string {
  const href = imgRelPath ? `${imgRelPath}/${localFilename}` : localFilename
  return `<img src="${href}" alt="${escapeXml(fileName)}">`
}

/** Télécharge le contenu texte d'une pièce jointe .drawio par son nom. */
export type DrawioAttachmentFetcher = (filename: string) => Promise<string | undefined>

/**
 * Blocs draw.io → image PNG rendue par le vrai moteur draw.io (fidèle, icônes/pochoirs inclus),
 * enregistrée dans `imagesDir` et référencée par un `<img>` classique dans le xml (repris ensuite
 * par le pipeline HTML → Markdown, comme n'importe quelle autre image Confluence).
 *
 * Sans `imagesDir` configuré : aucune conversion (mêmes conventions que pour les autres images -
 * pas de dossier, pas de téléchargement local). Les blocs non convertis (échec, pas d'imagesDir)
 * retombent sur `preserveDrawioMacros` (préservés tels quels dans le markdown final).
 */
export async function convertDrawioBlocksToImages(
  xml: string,
  fetchAttachment: DrawioAttachmentFetcher,
  imagesDir: string | undefined,
  imgRelPath: string | undefined,
): Promise<string> {
  const blocks = findDrawioBlocks(xml)
  if (!blocks.length || !imagesDir) return xml

  log.step1(`${blocks.length} diagramme(s) draw.io détecté(s) - conversion en image`)
  ensureDir(imagesDir)

  const parts: string[] = []
  let last = 0
  for (const {full, fileName, start} of blocks) {
    try {
      const drawioXml = await fetchAttachment(fileName)
      if (!drawioXml) {
        log.warning3(`"${fileName}" : pièce jointe introuvable - bloc draw.io conservé tel quel`)
        continue
      }
      const png = await renderDrawioToPng(extractGraphModel(drawioXml))
      const localFilename = pngFilenameFor(fileName)
      writeBinaryFile(path.resolve(imagesDir, localFilename), png)

      parts.push(xml.slice(last, start), imgTag(fileName, localFilename, imgRelPath))
      last = start + full.length
      log.success3(`"${fileName}" → ${localFilename}`)
    } catch (err: any) {
      const why = err?.response?.status ?? err?.message ?? 'erreur'
      log.warning3(`"${fileName}" : téléchargement/rendu impossible (${why}) - bloc conservé`)
    }
  }
  parts.push(xml.slice(last))
  return parts.join('')
}
