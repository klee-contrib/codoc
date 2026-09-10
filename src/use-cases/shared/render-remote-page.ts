import path from 'path'

import {ConfluencePage} from '../../clients/confluence/clients/pages-client.js'
import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {isAttachmentDownload} from '../../clients/confluence/utils/confluence-util.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'
import {fetchAttachmentBinary, fetchAttachmentText} from '../../services/confluence/attachments.js'
import {renderMarkdown} from '../../services/conversion/confluenceToMarkdown/index.js'
import {embeddedAttachmentFilenames, sanitizeAttachmentFilename} from '../../services/conversion/shared/image-attachments.js'
import {log} from '../../services/log/logger.js'
import {fileExists, toPosixPath, writeBinaryFile, writeFile} from '../../services/files-service.js'

// Chemin du .md + imagesDir → chemin relatif d'imagesDir vu depuis le .md.
// Ex. `imgRelPathFor("doc/p.md", "doc/img")` → `"img"`
function imgRelPathFor(localPath: string, imagesDir?: string): string | undefined {
  return imagesDir ? path.posix.relative(path.posix.dirname(toPosixPath(localPath)), toPosixPath(imagesDir)) : undefined
}

/** Format lisible d'une taille en octets (KiB / MiB). */
function humanBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`
  return `${(n / (1024 * 1024)).toFixed(1)} Mio`
}

async function downloadPageImages(
  client: ConfluenceClient,
  page: ConfluencePage,
  absImagesDir: string,
): Promise<{ok: number; failed: number}> {
  const files = embeddedAttachmentFilenames(page.storageXml)
  if (!files.length) return {ok: 0, failed: 0}

  log.info4(`${files.length} pièce(s) jointe(s) à télécharger vers ${absImagesDir}`)
  let ok = 0
  let skipped = 0
  let failed = 0
  for (const filename of files) {
    // Doit rester identique au nom utilisé côté lien markdown (preprocess.ts), sinon lien mort.
    const localFilename = sanitizeAttachmentFilename(filename)
    const absPath = path.resolve(absImagesDir, localFilename)
    if (fileExists(absPath)) {
      log.info4(`${localFilename}  (déjà présente)`)
      skipped++
      continue
    }
    const result = await fetchAttachmentBinary(client.attachments, page.id, filename)
    if (isAttachmentDownload(result)) {
      writeBinaryFile(absPath, result.data)
      log.success4(`[PULL] ${localFilename}  (${humanBytes(result.bytes)} via ${result.via})`)
      ok++
    } else if (result.notFound) {
      log.warning4(`${localFilename}  → pièce jointe introuvable sur la page`)
      failed++
    } else {
      log.error4(`${localFilename}  → v1: ${result.v1Error ?? '-'}  |  v2: ${result.v2Error ?? '-'}`)
      failed++
    }
  }
  const parts = [`${ok} téléchargée(s)`]
  if (skipped) parts.push(`${skipped} déjà présente(s)`)
  if (failed) parts.push(`${failed} échec(s)`)
  log.info4(`Total : ${parts.join(', ')}`)
  return {ok, failed}
}

export async function renderRemotePageToLocal(
  client: ConfluenceClient,
  page: ConfluencePage,
  localPath: string,
  imagesDir?: string,
): Promise<void> {
  const absImagesDir = imagesDir ? path.resolve(PROJECT_ROOT, imagesDir) : undefined
  const markdown = await renderMarkdown(page.storageXml, {
    fetchAttachment: (filename) => fetchAttachmentText(client.attachments, page.id, filename),
    imagesDir: absImagesDir,
    imgRelPath: imgRelPathFor(localPath, imagesDir),
    baseUrl: client.configuration.baseUrl,
  })
  writeFile(path.resolve(PROJECT_ROOT, localPath), markdown)

  if (absImagesDir) {
    await downloadPageImages(client, page, absImagesDir)
  }
}
