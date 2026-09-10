import {checkbox} from '@inquirer/prompts'

const raw = (text: string): void => console.log(text)
const warnRaw = (text: string): void => console.warn(text)

export const ansi = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  link: (text: string, url?: string): string =>
    url ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : text,
}

const INDENT = ['', '  ', '   ', '     ', '        ']

function info(level: number, text: string): void {
  raw(`${INDENT[level]}ℹ️  ${text}`)
}
function success(level: number, text: string): void {
  raw(`${INDENT[level]}✅ ${text}`)
}
function warning(level: number, text: string): void {
  warnRaw(`${INDENT[level]}⚠️  ${text}`)
}
function error(level: number, text: string): void {
  warnRaw(`${INDENT[level]}❌ ${text}`)
}
function step(level: number, text: string): void {
  raw(`${INDENT[level]}${text}…`)
}

export const log = {
  // ─────────────── Niveaux génériques ───────────────

  info0: (text: string): void => info(0, text),
  info1: (text: string): void => info(1, text),
  info2: (text: string): void => info(2, text),
  info3: (text: string): void => info(3, text),
  info4: (text: string): void => info(4, text),

  success0: (text: string): void => success(0, text),
  success1: (text: string): void => success(1, text),
  success2: (text: string): void => success(2, text),
  success3: (text: string): void => success(3, text),
  success4: (text: string): void => success(4, text),

  warning0: (text: string): void => warning(0, text),
  warning1: (text: string): void => warning(1, text),
  warning2: (text: string): void => warning(2, text),
  warning3: (text: string): void => warning(3, text),
  warning4: (text: string): void => warning(4, text),

  error0: (text: string): void => error(0, text),
  error1: (text: string): void => error(1, text),
  error2: (text: string): void => error(2, text),
  error3: (text: string): void => error(3, text),
  error4: (text: string): void => error(4, text),

  step0: (text: string): void => step(0, text),
  step1: (text: string): void => step(1, text),
  step2: (text: string): void => step(2, text),
  step3: (text: string): void => step(3, text),
  step4: (text: string): void => step(4, text),

  // ─────────────── Utilitaires bruts ───────────────

  blank(): void {
    raw('')
  },

  raw(text: string): void {
    raw(text)
  },

  startProcess(text: string): void {
    raw(`\n${text}\n`)
  },

  endProcess(text: string): void {
    raw(`\n${text}`)
  },

  field(label: string, value: string): void {
    raw(`${INDENT[1]}${label} : ${value}`)
  },

  // ─────────────── Items structurés (niveau 2) ───────────────
  itemPublished(p: {env: string; isUpdate: boolean; title: string}): void {
    raw(`${INDENT[2]}${p.isUpdate ? '[UPDATED]' : '[CREATED]'} [${p.env}] ${p.title}…`)
  },

  itemPulled(p: {env: string; title: string; dest?: string}): void {
    const tail = p.dest ? ` → ${p.dest}` : ''
    raw(`${INDENT[2]}[PULL] [${p.env}] ${p.title}${tail}…`)
  },

  itemFolder(p: {env: string; title: string}): void {
    raw(`${INDENT[2]}[FOLDER] [${p.env}] ${p.title}…`)
  },

  itemDeleted(p: {env: string; title: string}): void {
    raw(`${INDENT[2]}[DELETED] [${p.env}] ${p.title}`)
  },

  itemKept(text: string): void {
    raw(`${INDENT[2]}[UNCHANGED] ${text}`)
  },

  itemCleaned(text: string): void {
    raw(`${INDENT[2]}[REMOVED] ${text}`)
  },

  // ─────────────── Progression numérotée (niveau 3) ───────────────

  progress(i: number, total: number, text: string): void {
    raw(`${INDENT[3]}[${i}/${total}] ${text}`)
  },

  // ─────────────── Prompts interactifs ───────────────

  async checklist(
    message: string,
    items: string[],
    options: {required?: boolean; pageSize?: number} = {},
  ): Promise<string[]> {
    return checkbox<string>({
      choices: items.map((item) => ({name: item, value: item, checked: true})),
      loop: false,
      message,
      pageSize: options.pageSize ?? 30,
      required: options.required ?? false,
    })
  },

  // ─────────────── Banner final de commande ───────────────

  finalBanner(title: string, fields: Record<string, string | undefined> = {}): void {
    const INNER_WIDTH = 54
    const bar = '═'.repeat(INNER_WIDTH)
    const titleLine = `  ${title}`.padEnd(INNER_WIDTH, ' ')
    raw('')
    raw(`╔${bar}╗`)
    raw(`║${titleLine}║`)
    raw(`╚${bar}╝`)
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined)
    if (entries.length) {
      raw('')
      for (const [k, v] of entries) {
        // Indente les lignes 2+ d'une valeur multi-lignes au même niveau que la première.
        const indented = String(v).replace(/\n/g, `\n  ${' '.repeat(k.length + 3)}`)
        raw(`  ${k} : ${indented}`)
      }
    }
    raw('')
  },
}
