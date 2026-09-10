import {simpleGit} from 'simple-git'

import {getGitlabConfig} from '../../config/codoc-config.js'
import {PROJECT_ROOT} from '../../config/codoc-paths.js'

let cached: string | undefined

export async function getDefaultBranch(): Promise<string> {
  if (cached) return cached

  const fromConfig = getGitlabConfig().defaultBranch
  if (fromConfig) {
    cached = fromConfig
    return cached
  }

  if (process.env.CI_DEFAULT_BRANCH) {
    cached = process.env.CI_DEFAULT_BRANCH
    return cached
  }

  try {
    const ref = await simpleGit(PROJECT_ROOT).raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    cached = ref.trim().replace(/^origin\//, '')
    if (cached) return cached
  } catch {
    /* origin/HEAD non défini - fallback */
  }

  cached = 'main'
  return cached
}

/** Utilitaire pour les tests : réinitialise le cache. */
export function resetDefaultBranchCache(): void {
  cached = undefined
}
