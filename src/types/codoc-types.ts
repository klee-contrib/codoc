export type MaintainedIn = 'code' | 'confluence'

export interface KeywordOverride {
  path: string
  keywords: string[]
}

export interface DocEntryConfig {
  codocId?: string
  path: string
  maintainedIn: MaintainedIn
  env?: string
  imagesDir?: string
  keywords?: string[]
  keywordOverrides?: KeywordOverride[]
  generateSummary: boolean
  confluence: {
    title?: string
    parentPageId?: string
    titlePrefix?: string
  }
}

export interface ConfluenceConfig {
  key: string
  baseUrl: string
  username: string
  apiToken: string
  spaceKey: string
  defaultParentPageId?: string
  jira: JiraLinkConfig
  drawio: DrawioConfig
}

/** Sous-ensemble utilisé par codoc (macro Jira dans les pages Confluence) - un seul jeu de valeurs, partagé par tous les environnements. Le reste de la config Jira (transitions, roster, BL…) est hors périmètre de codoc. */
export interface JiraLinkConfig {
  serverId?: string
  server?: string
}

export interface GitLabConfig {
  baseUrl?: string
  defaultBranch?: string
}

export interface DrawioConfig {
  macroName: string
  width?: number
  edgeStyle?: 'curved' | 'orthogonal' | 'straight'
  edgeAnchor?: 'auto' | 'side'
  colWidth?: number
  rowStep?: number
}

export interface AppConfig {
  atlassian: {environments: ConfluenceConfig[]}
  gitlab: GitLabConfig
  docs: DocEntryConfig[]
}
