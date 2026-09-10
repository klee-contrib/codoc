import {ConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {pageUrl} from '../../clients/confluence/utils/confluence-url.js'

/** Demande confirmation avant d'adopter une page existante en conflit de titre - jamais d'adoption silencieuse. */
export type OnTitleConflict = (existingPageId: string, existingUrl: string) => Promise<boolean>

export async function createPageOrThrowConflict(
  client: ConfluenceClient,
  title: string,
  storageContent: string,
  parentId?: number,
  onTitleConflict?: OnTitleConflict,
) {
  try {
    return await client.pages.create(title, storageContent, parentId)
  } catch (err: any) {
    const message = await err.response?.text?.()

    if (err.response?.status !== 400 || !message?.includes('already exists')) {
      throw err
    }

    const found = await client.pages.findByTitle(title)

    if (found && onTitleConflict) {
      const url = pageUrl(client.configuration.baseUrl, client.configuration.spaceKey, found.id)
      if (await onTitleConflict(found.id, url)) {
        return client.pages.update(found.id, title, storageContent, parentId)
      }
    }

    const where = found
      ? `elle a été retrouvée ici : ${pageUrl(client.configuration.baseUrl, client.configuration.spaceKey, found.id)}`
      : `elle n'a pas pu être retrouvée par titre (peut-être à la corbeille) - vérifie manuellement dans l'espace "${client.configuration.spaceKey}".`

    throw new Error(
      `Impossible de créer la page "${title}" : une page portant ce titre existe déjà quelque part dans Confluence, ${where}\n` +
        `Vérifie s'il ne s'agit pas de la même doc mal référencée (codocId/parentPageId à corriger dans codoc.yaml), ou renomme l'une des deux pages pour lever le conflit.`,
    )
  }
}

export async function createOrUpdatePage(
  client: ConfluenceClient,
  title: string,
  storageContent: string,
  parentId?: number,
  existingPageId?: string,
  onTitleConflict?: OnTitleConflict,
) {
  if (!existingPageId) {
    return createPageOrThrowConflict(client, title, storageContent, parentId, onTitleConflict)
  }

  try {
    return await client.pages.update(existingPageId, title, storageContent, parentId)
  } catch (err: any) {
    if (err.response?.status === 404) {
      return createPageOrThrowConflict(client, title, storageContent, parentId, onTitleConflict)
    }
    throw err
  }
}
