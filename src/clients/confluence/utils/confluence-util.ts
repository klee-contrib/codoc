export interface AttachmentDownload {
  data: Buffer
  /** Voie qui a réussi : `v1` = `_links.download` (Basic Auth + 302 S3) ; `v2` = `downloadLink` pré-signé. */
  via: 'v1' | 'v2'
  /** Taille en octets (pour journalisation). */
  bytes: number
}

export interface AttachmentDownloadError {
  /** Pourquoi v1 a échoué (statut HTTP ou message d'exception). */
  v1Error?: string
  /** Pourquoi v2 a échoué (statut HTTP ou message d'exception). */
  v2Error?: string
  /** True si l'attachment n'a même pas été trouvé dans la liste des pièces jointes. */
  notFound?: boolean
}

/** Extrait un libellé d'erreur lisible (statut HTTP s'il existe, sinon message). */
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
