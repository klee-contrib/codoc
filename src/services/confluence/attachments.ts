import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'

import {ConfluenceAttachmentsClient} from '../../clients/confluence/clients/attachments-client.js'
import {
  AttachmentDownload,
  AttachmentDownloadError,
  describeError,
} from '../../clients/confluence/utils/confluence-util.js'

export async function fetchAttachmentBinary(
  attachments: ConfluenceAttachmentsClient,
  pageId: string,
  filename: string,
): Promise<AttachmentDownload | AttachmentDownloadError> {
  const att = await attachments.find(pageId, filename)

  if (!att) {
    return {notFound: true}
  }

  const errors: AttachmentDownloadError = {}

  // v1
  try {
    const buffer = await attachments.downloadV1(att.downloadPath)

    return {
      data: Buffer.from(buffer),
      via: 'v1',
      bytes: buffer.byteLength,
    }
  } catch (err) {
    errors.v1Error = await describeError(err)
  }

  // v2
  try {
    const signedUrl = await attachments.getDownloadLink(att.id)

    if (!signedUrl) {
      errors.v2Error = 'Réponse v2 sans downloadLink.'
      return errors
    }

    const buffer = await attachments.downloadV2(signedUrl)

    return {
      data: Buffer.from(buffer),
      via: 'v2',
      bytes: buffer.byteLength,
    }
  } catch (err) {
    errors.v2Error = await describeError(err)
    return errors
  }
}

export async function fetchAttachmentText(
  attachments: ConfluenceAttachmentsClient,
  pageId: string,
  filename: string,
): Promise<string | undefined> {
  const att = await attachments.find(pageId, filename)

  if (!att) return undefined

  try {
    return await attachments.downloadTextV1(att.downloadPath)
  } catch {
    return undefined
  }
}

export async function uploadAttachmentBlob(
  attachments: ConfluenceAttachmentsClient,
  pageId: string,
  filename: string,
  blob: Blob,
): Promise<void> {
  await attachments.upload(pageId, filename, blob)
}

export async function uploadAttachmentBuffer(
  attachments: ConfluenceAttachmentsClient,
  pageId: string,
  filename: string,
  buffer: Buffer,
  mimeType = 'application/octet-stream',
): Promise<void> {
  await uploadAttachmentBlob(attachments, pageId, filename, new Blob([new Uint8Array(buffer)], {type: mimeType}))
}

export async function uploadAttachmentFile(
  attachments: ConfluenceAttachmentsClient,
  pageId: string,
  filePath: string,
  mimeType = 'application/octet-stream',
): Promise<void> {
  const buffer = await readFile(filePath)

  await uploadAttachmentBuffer(attachments, pageId, basename(filePath), buffer, mimeType)
}
