import {Hook} from '@oclif/core'
import {execa} from 'execa'
import ora from 'ora'

import {loadRawConfig} from '../../config/codoc-config-raw.js'
import {log} from '../../services/log/logger.js'

const PACKAGE_NAME = 'codoc-cli'

export function shouldSkipAutoUpdateCheck(env: NodeJS.ProcessEnv, isTTY: boolean, raw: {autoUpdate?: boolean}): boolean {
  if (env.CI) return true
  if (!isTTY) return true
  if (raw.autoUpdate === false) return true
  return false
}

async function currentGlobalVersion(): Promise<string | undefined> {
  const result = await execa('npm', ['list', '-g', PACKAGE_NAME], {reject: false})
  return result.stdout.split(`${PACKAGE_NAME}@`)[1]?.split(/\s/)[0]
}

/** Compare deux versions "x.y.z" segment par segment - true si `candidate` est strictement plus récente que `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

async function latestVersion(): Promise<string | undefined> {
  const result = await execa('npm', ['view', PACKAGE_NAME, 'version'], {reject: false})
  return result.failed ? undefined : result.stdout.trim()
}

async function update(version: string): Promise<boolean> {
  const spinner = ora(`Mise à jour de codoc (${version}) en cours…`).start()
  const result = await execa('npm', ['install', '-g', `${PACKAGE_NAME}@${version}`], {reject: false})
  spinner.stop()
  if (result.failed) {
    log.error1(`Mise à jour échouée : ${result.stderr || result.shortMessage}`)
    return false
  }

  log.success1(`[UPDATED] codoc mis à jour en ${version}.`)
  return true
}

/** Relance la commande d'origine (argv tel que tapé par l'utilisateur) via le binaire global fraîchement mis à jour. */
async function rerunWithUpdatedBinary(): Promise<boolean> {
  const result = await execa('codoc', process.argv.slice(2), {reject: false, stdio: 'inherit'})
  if (result.failed && !result.exitCode) return false

  process.exit(result.exitCode ?? 0)
}

const hook: Hook<'init'> = async function () {
  if (shouldSkipAutoUpdateCheck(process.env, Boolean(process.stdout.isTTY), loadRawConfig())) return

  try {
    const [current, latest] = await Promise.all([currentGlobalVersion(), latestVersion()])
    if (!current || !latest || !isNewerVersion(latest, current)) return

    this.warn(`Une nouvelle version de codoc est disponible : ${current} → ${latest}.`)
    const updated = await update(latest)
    if (!updated) return

    const rerun = await rerunWithUpdatedBinary()
    if (!rerun) {
      this.warn('[SKIPPED] Relance automatique impossible - relance ta commande pour utiliser la nouvelle version.')
    }
  } catch (err) {
    this.warn(`[SKIPPED] Vérification de mise à jour ignorée : ${(err as Error).message}`)
  }
}

export default hook
