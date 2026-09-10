// Upload des pièces jointes d'une page Confluence (images disque + drawio en mémoire). Mutualisé sync/publish.

import path from 'node:path'

import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {uploadAttachmentFile} from '../../services/confluence/attachments.js'
import {log} from '../../services/log/logger.js'
import {fileExists} from '../../services/files-service.js'

/** Filenames `<ri:filename="…"/>` référencés dans un XML Confluence Storage Format. */
function extractAttachmentFilenames(xml: string): string[] {
  return [...new Set([...xml.matchAll(/ri:filename="([^"]+)"/g)].map((m) => m[1]))]
}

/** Upload chaque image référencée dans `xml` depuis `<imagesDir>/` ; warn si le fichier local est absent. */
async function uploadImagesFromXml(
  client: ConfluenceClient,
  pageId: string,
  xml: string,
  imagesDir: string,
): Promise<void> {
  const absDir = path.resolve(PROJECT_ROOT, imagesDir)
  for (const filename of extractAttachmentFilenames(xml)) {
    const filePath = path.join(absDir, filename)
    if (fileExists(filePath)) {
      await uploadAttachmentFile(client.attachments, pageId, filePath)
      log.success4(`[CREATED] Pièce jointe : ${filename}`)
    } else {
      log.warning4(`Image introuvable : ${filePath}`)
    }
  }
}

/** Téléverse en une passe les images du XML (si imagesDir) et les diagrammes en mémoire (attachments). */
export async function uploadPageAttachments(
  client: ConfluenceClient,
  pageId: string,
  xml: string,
  imagesDir: string | undefined,
  attachments: Array<{filename: string; content: string}>,
): Promise<void> {
  if (imagesDir) await uploadImagesFromXml(client, pageId, xml, imagesDir)
  for (const {filename, content} of attachments) {
    await client.attachments.upload(pageId, filename, new Blob([content]))
    log.success4(`[CREATED] Pièce jointe : ${filename}`)
  }
}
