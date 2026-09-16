export interface AttachmentDownload {
  data: Buffer
  via: 'v1' | 'v2'
  bytes: number
}

export interface AttachmentDownloadError {
  v1Error?: string
  v2Error?: string
  notFound?: boolean
}

export async function describeError(err: unknown): Promise<string> {
  const e = err as {response?: Response; message?: string; name?: string}
  if (e?.response) {
    const status = e.response.status
    let body = ''
    try {
      body = (await e.response.text()).slice(0, 120)
    } catch {
      /* ignore */
    }
    return `HTTP ${status}${body ? ` - ${body.replace(/\s+/g, ' ').trim()}` : ''}`
  }
  return e?.message ?? e?.name ?? String(err)
}

/** Type-guard : vrai si le téléchargement a réussi. */
export function isAttachmentDownload(r: AttachmentDownload | AttachmentDownloadError): r is AttachmentDownload {
  return 'data' in r
}
