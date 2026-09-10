// draw.io (mxGraphModel) → PNG fidèle, en rendant le diagramme avec le vrai moteur draw.io
// (visualisateur officiel vendorisé, headless via Puppeteer) plutôt qu'en le retraduisant à la
// main : gère nativement les pochoirs/icônes intégrés (AWS, UML, cloud…), impossibles à
// reconstruire par un parseur XML maison (voir drawio-to-mermaid.ts, remplacé par ce module).
//
// PNG plutôt que SVG : le texte des labels draw.io est rendu en foreignObject (HTML imbriqué dans
// le SVG, comportement par défaut - le style html=1 quasi systématique sur les diagrammes réels
// l'impose, indépendamment de mxClient.NO_FO). Ce contenu HTML ne s'affiche pas quand le SVG est
// chargé comme une image (<img>, tel que GitLab/GitHub/VS Code affichent une image de markdown) -
// seulement quand le SVG est un document/une page à part entière. Une capture PNG du rendu réel
// n'a pas ce problème : ce sont directement les pixels affichés, fidèles dans tous les contextes.

import {exec, execFile} from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {promisify} from 'util'
import zlib from 'zlib'
import {fileURLToPath} from 'url'
import type {Browser} from 'puppeteer'

import {log} from '../../../log/logger.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const VIEWER_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../assets/drawio-viewer/viewer-static.min.js',
)

// Chargé une seule fois et réutilisé pour tous les diagrammes (fichier vendorisé de 4 Mo).
// Inliné dans le HTML (plutôt que `<script src="file://...">`) car Chrome interdit le chargement
// de ressources file:// depuis un document about:blank (origine de page.setContent) - restriction
// de sécurité indépendante de l'installation de Chrome elle-même.
let viewerScriptCache: string | undefined
function viewerScript(): string {
  viewerScriptCache ??= fs.readFileSync(VIEWER_SCRIPT_PATH, 'utf-8').replace(/<\/script/gi, '<\\/script')
  return viewerScriptCache
}

// Un seul navigateur headless, lancé à la demande et réutilisé pour tous les diagrammes d'une
// même commande (pull/sync) - le coût de démarrage (~1-2s) n'est payé qu'une fois par exécution.
let browserPromise: Promise<Browser> | undefined

const CHROME_MISSING = /Could not find (Chrome|Browser)/i
// Extrait le numéro de version d'un message Puppeteer du type "Could not find Chrome (ver. 148.0.7778.97)".
const CHROME_VERSION = /ver\. ([\d.]+)/

function chromeInstallHelpMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  const version = detail.match(CHROME_VERSION)?.[1]
  // Le téléchargement du .zip réussit systématiquement (vérifié à plusieurs reprises) - seule
  // l'extraction automatique de puppeteer échoue (antivirus qui interfère). PowerShell Expand-Archive
  // réussit de façon fiable sur ce même .zip déjà téléchargé : contournement manuel, mais concret.
  const cacheDir = '%USERPROFILE%\\.cache\\puppeteer\\chrome'
  const zipHint = version ? `${version}-chrome-win64.zip` : '<version>-chrome-win64.zip'
  const destHint = version ? `win64-${version}` : 'win64-<version>'
  return (
    "Échec de l'installation automatique de Chrome, nécessaire pour convertir les diagrammes " +
    'draw.io en image.\n' +
    "Cause connue sur Windows : un antivirus interfère avec l'extraction automatique des fichiers, " +
    'alors que le téléchargement du .zip, lui, réussit toujours entièrement.\n' +
    'Contournement (fiable, déjà vérifié sur ce projet) - depuis PowerShell :\n' +
    `  Expand-Archive -Path "${cacheDir}\\${zipHint}" -DestinationPath "${cacheDir}\\${destHint}" -Force\n` +
    (version ? '' : "  (remplacez <version> par le numéro présent dans le nom du fichier .zip du dossier ci-dessus)\n") +
    `Détail technique : ${detail}`
  )
}

// `npx puppeteer` résout son binaire par rapport au cwd du processus appelant (le projet consommateur
// - ex. OG3P -, sans rapport avec les node_modules de codoc) : il peut retomber sur une tout autre
// version de puppeteer que celle réellement utilisée par codoc (résolue, elle, via les imports du
// module, indépendamment du cwd) - et donc installer la mauvaise version de Chrome. On résout ici le
// CLI du MÊME paquet puppeteer que celui importé plus haut, pour installer la version qu'il attend.
function puppeteerCliPath(): string {
  const pkgPath = fileURLToPath(import.meta.resolve('puppeteer/package.json'))
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {bin: string}
  return path.resolve(path.dirname(pkgPath), pkg.bin)
}

// Windows uniquement : contourne l'extraction de puppeteer elle-même (celle qui échoue - un
// antivirus semble interférer avec sa façon d'écrire les fichiers) en téléchargeant et extrayant
// Chrome nous-mêmes. On réutilise l'API publique de @puppeteer/browsers UNIQUEMENT pour obtenir
// l'URL de téléchargement et le dossier d'installation exacts (jamais sa routine d'extraction) ;
// le téléchargement se fait via fetch (jamais été en cause - seule l'extraction pose problème) et
// l'extraction via PowerShell Expand-Archive (fiable, vérifié à de multiples reprises sur ce projet).
async function installChromeOnWindows(version: string): Promise<boolean> {
  const {getDownloadUrl, Cache, Browser: PuppeteerBrowser, BrowserPlatform} = await import('@puppeteer/browsers')
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer')
  const installDir = new Cache(cacheDir).installationDir(PuppeteerBrowser.CHROME, BrowserPlatform.WIN64, version)
  const url = getDownloadUrl(PuppeteerBrowser.CHROME, BrowserPlatform.WIN64, version).toString()

  const tmpZip = path.join(os.tmpdir(), `codoc-chrome-${version}-${Date.now()}.zip`)
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    fs.writeFileSync(tmpZip, Buffer.from(await res.arrayBuffer()))

    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Remove-Item -LiteralPath '${installDir}' -Recurse -Force -ErrorAction SilentlyContinue; ` +
          `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${installDir}' -Force`,
      ],
      {timeout: 3 * 60 * 1000},
    )
    return fs.existsSync(path.join(installDir, 'chrome-win64', 'chrome.exe'))
  } catch {
    return false
  } finally {
    fs.rmSync(tmpZip, {force: true})
  }
}

// Chrome n'est plus téléchargé au `npm install` (voir .puppeteerrc.cjs à la racine du monorepo :
// `npm install` ne doit jamais échouer pour ça, pour personne) - installé ici à la demande, au
// premier diagramme draw.io réellement rencontré.
async function ensureChromeInstalled(version: string | undefined): Promise<void> {
  log.info1('Chrome (nécessaire pour convertir les diagrammes draw.io) introuvable - installation en cours…')
  if (process.platform === 'win32' && version && (await installChromeOnWindows(version))) return
  await execAsync(`node "${puppeteerCliPath()}" browsers install chrome`, {timeout: 5 * 60 * 1000})
}

async function getBrowser(): Promise<Browser> {
  browserPromise ??= (async () => {
    const {launch} = await import('puppeteer')
    try {
      return await launch({headless: true})
    } catch (err) {
      if (!(err instanceof Error) || !CHROME_MISSING.test(err.message)) throw err
      // Couvre les deux points d'échec possibles (l'installation elle-même, ou un nouvel échec au
      // lancement malgré une installation prétendument réussie) sous le même message clair -
      // jamais la stack trace brute de Puppeteer.
      try {
        await ensureChromeInstalled(err.message.match(CHROME_VERSION)?.[1])
        return await launch({headless: true})
      } catch (retryErr) {
        throw new Error(chromeInstallHelpMessage(retryErr))
      }
    }
  })()
  return browserPromise
}

/** À appeler en fin de commande (pull/sync) pour fermer proprement le navigateur headless. */
export async function closeDrawioRenderer(): Promise<void> {
  if (!browserPromise) return
  const promise = browserPromise
  browserPromise = undefined
  try {
    const browser = await promise
    await browser.close()
  } catch {
    // Le navigateur n'a jamais pu être lancé (échec déjà remonté à l'appelant au moment de la
    // conversion, voir convertDrawioBlocksToImages) - rien à fermer, ne doit pas faire planter le
    // nettoyage de fin de commande (pull/sync) pour une erreur déjà gérée.
  }
}

// Pièce jointe .drawio brute → XML `<mxGraphModel>` (soit en clair, soit compressé
// - deflate brut base64 - dans un conteneur `<diagram>…</diagram>`).
// Ex. `extractGraphModel("<mxGraphModel>...</mxGraphModel>")` → `"<mxGraphModel>...</mxGraphModel>"`
export function extractGraphModel(drawio: string): string {
  if (drawio.includes('<mxGraphModel')) {
    const start = drawio.indexOf('<mxGraphModel')
    const end = drawio.indexOf('</mxGraphModel>')
    if (end !== -1) return drawio.slice(start, end + '</mxGraphModel>'.length)
  }

  const payload = drawio.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/)?.[1]?.trim()
  if (payload) {
    try {
      const inflated = zlib.inflateRawSync(Buffer.from(payload, 'base64')).toString('utf-8')
      return decodeURIComponent(inflated)
    } catch {
      /* pas du deflate → on retombe sur l'erreur ci-dessous */
    }
  }
  throw new Error("Impossible d'extraire le mxGraphModel (ni XML en clair, ni payload compressé reconnu).")
}

function viewerHtml(graphModelXml: string): string {
  const config = JSON.stringify({toolbar: '', resize: true, xml: graphModelXml})
  // `data-mxgraph` est un attribut HTML : le JSON (déjà correctement échappé pour du XML par
  // escapeCdata côté appelant n'est pas nécessaire ici) doit juste être échappé pour un attribut HTML.
  const escapedConfig = config.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body>` +
    `<div class="mxgraph" data-mxgraph="${escapedConfig}"></div>` +
    `<script>${viewerScript()}</script>` +
    `</body></html>`
}

/** mxGraphModel XML → PNG rendu par le vrai moteur draw.io (icônes/pochoirs inclus). */
export async function renderDrawioToPng(graphModelXml: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Viewport large + échelle x2 : ne contraint jamais la taille naturelle d'un diagramme complexe
    // et garde le texte net (une capture PNG classique en 1x serait floue au moindre zoom/rétina).
    await page.setViewport({width: 4000, height: 4000, deviceScaleFactor: 2})
    await page.setContent(viewerHtml(graphModelXml), {waitUntil: 'load'})
    await page.waitForFunction(() => document.querySelector('.mxgraph svg') !== null, {timeout: 15000})
    await new Promise((r) => setTimeout(r, 200)) // laisse le temps au rendu de se stabiliser avant capture
    const el = await page.$('.mxgraph')
    if (!el) throw new Error('Élément .mxgraph introuvable après rendu.')
    // Fond blanc explicite (pas de transparence) : les traits/texte des diagrammes draw.io sont
    // par défaut noirs, invisibles sur fond sombre (thème sombre d'un lecteur markdown par ex.).
    return (await el.screenshot({type: 'png', omitBackground: false})) as Buffer
  } finally {
    await page.close()
  }
}
