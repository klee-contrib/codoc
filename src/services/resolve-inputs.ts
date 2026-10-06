import {checkbox, confirm, input, password, select} from '@inquirer/prompts'

import {loadRawConfig} from '../config/codoc-config-raw.js'
import {CODOC_ENV_FILE} from '../config/codoc-paths.js'
import {fileExists, readFile, writeFile} from './files-service.js'
import {log} from './log/logger.js'

export interface InputChoice {
  name: string
  value: string
}

type Choices = Array<string | InputChoice>

interface InputBase {
  label: string
  fix: string
  message?: string
  hint?: string
  generateUrl?: string
  env?: string[]
  config?: string[]
}

export interface TextInput extends InputBase {
  kind: 'text' | 'secret'
  parse?: (raw: string) => unknown
}

export interface ConfirmInput extends InputBase {
  kind: 'confirm'
}

export interface SelectInput extends InputBase {
  kind: 'select'
  choices?: Choices
}

export interface ChecklistInput extends InputBase {
  kind: 'checklist'
  choices?: Choices
}

export type InputSpec = TextInput | ConfirmInput | SelectInput | ChecklistInput

type RawValue = string | string[] | boolean

export interface InputRequest {
  flag?: RawValue
  existing?: RawValue
  default?: RawValue
  suggested?: RawValue
  choices?: Choices
  validate?: (value: string) => boolean | string
  when?: boolean
  optional?: boolean
}

type ValueOf<S> = S extends {parse: (raw: never) => infer T}
  ? T
  : S extends {kind: 'checklist'}
    ? string[]
    : S extends {kind: 'confirm'}
      ? boolean
      : string

type MaybeSkipped<Q> = 'when' extends keyof Q ? true : 'optional' extends keyof Q ? true : false

export type ResolvedInputs<C, R> = {
  [K in keyof R & keyof C]: MaybeSkipped<R[K]> extends true ? ValueOf<C[K]> | undefined : ValueOf<C[K]>
}

export interface InputsContext {
  interactive: boolean
  env: Record<string, string | undefined>
  config: Record<string, unknown>
  ask(spec: InputSpec, request: InputRequest): Promise<RawValue | undefined>
  remember(spec: InputSpec, value: string): Promise<void>
}

const CONFIRM_THEME = {keywords: {yes: 'Oui', no: 'Non'}}

export async function resolveInputs<C extends Record<string, InputSpec>, R extends {[K in keyof C]?: InputRequest}>(
  catalog: C,
  requests: R,
  context: InputsContext = consoleContext(),
): Promise<ResolvedInputs<C, R>> {
  const values: Record<string, unknown> = {}
  const pending: Array<[string, InputRequest]> = []

  for (const [id, request] of Object.entries(requests) as Array<[string, InputRequest]>) {
    if ('when' in request && !request.when) continue
    const spec = catalog[id]
    const known = [
      request.flag,
      fromEnv(spec, context),
      request.existing,
      fromConfig(spec, context),
      request.default,
    ].find((value) => isGiven(value, request))
    if (known === undefined) pending.push([id, request])
    else values[id] = parse(spec, request, known)
  }

  if (!context.interactive) {
    const missing = pending.filter(([, request]) => !request.optional && !isGiven(request.suggested, request))
    if (missing.length) throw missingInputs(missing.map(([id]) => catalog[id]))
    for (const [id, request] of pending) {
      if (isGiven(request.suggested, request)) values[id] = parse(catalog[id], request, request.suggested)
    }
    return values as ResolvedInputs<C, R>
  }

  const required = pending.filter(([, request]) => !request.optional).map(([id]) => id)
  for (const [id, request] of pending) {
    const spec = catalog[id]
    const answer = await context.ask(spec, request)
    if (!isGiven(answer, request)) {
      if (request.optional) continue
      throw missingInputs(required.slice(required.indexOf(id)).map((key) => catalog[key]))
    }
    const value = parse(spec, request, answer)
    values[id] = value
    if (typeof value !== 'string' || !value) continue
    if (spec.env) context.env[spec.env[0]] = value
    if (spec.config) setIn(context.config, spec.config, value)
    if (spec.env || spec.config) await context.remember(spec, value)
  }

  return values as ResolvedInputs<C, R>
}

export function requestAll<C extends Record<string, InputSpec>>(catalog: C): {[K in keyof C]: InputRequest} {
  return Object.fromEntries(Object.keys(catalog).map((id) => [id, {}])) as {[K in keyof C]: InputRequest}
}

export function consoleContext(): InputsContext {
  return {
    interactive: Boolean(process.stdin.isTTY),
    env: process.env,
    get config() {
      return loadRawConfig() as Record<string, unknown>
    },
    ask: askInConsole,
    remember: rememberInConsole,
  }
}

function fromEnv(spec: InputSpec, context: InputsContext): string | undefined {
  return spec.env?.map((name) => context.env[name]?.trim()).find(Boolean)
}

function fromConfig(spec: InputSpec, context: InputsContext): string | undefined {
  if (!spec.config) return undefined
  const value = spec.config.reduce<unknown>(
    (node, key) => (node as Record<string, unknown> | null | undefined)?.[key],
    context.config,
  )
  return value === undefined || value === null ? undefined : String(value).trim() || undefined
}

function setIn(target: Record<string, unknown>, path: string[], value: string): void {
  const parent = path.slice(0, -1).reduce<Record<string, unknown>>((node, key) => {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
    return node[key] as Record<string, unknown>
  }, target)
  parent[path.at(-1)!] = value
}

function isFilled(value: RawValue): boolean {
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return value.trim() !== ''
}

function isGiven(value: RawValue | undefined, request: InputRequest): value is RawValue {
  return value !== undefined && (Boolean(request.optional) || isFilled(value))
}

function parse(spec: InputSpec, request: InputRequest, raw: RawValue): unknown {
  if (spec.kind === 'confirm') return raw === true
  if (spec.kind === 'checklist') return Array.isArray(raw) ? raw : [String(raw)]
  const text = String(raw).trim()
  if (!text) return text
  const check = request.validate?.(text) ?? true
  if (check !== true) throw new Error(check || 'Valeur invalide.')
  return spec.kind === 'select' || !spec.parse ? text : spec.parse(text)
}

function missingInputs(specs: InputSpec[]): Error {
  const width = Math.max(...specs.map((spec) => spec.label.length))
  const lines = specs.flatMap((spec) => [
    `  ${spec.label.padEnd(width)} → ${spec.fix}`,
    ...(spec.generateUrl ? [`  ${' '.repeat(width)}   Pour le générer : ${spec.generateUrl}`] : []),
  ])
  return new Error(`Valeurs manquantes :\n\n${lines.join('\n')}\n`)
}

async function askInConsole(spec: InputSpec, request: InputRequest): Promise<RawValue> {
  describe(spec)
  const message = spec.message ?? `  Saisis ${spec.label} (Entrée vide pour skip) :`
  const {suggested} = request
  switch (spec.kind) {
    case 'secret':
      return password({message, mask: '*'})
    case 'confirm':
      return confirm({message, default: suggested === true, theme: CONFIRM_THEME})
    case 'select':
      return select({
        message,
        choices: choicesOf(spec, request),
        default: typeof suggested === 'string' ? suggested : undefined,
        loop: false,
      })
    case 'checklist': {
      const checked = new Set(Array.isArray(suggested) ? suggested : [])
      return checkbox({
        message,
        choices: choicesOf(spec, request).map((choice) => ({...choice, checked: checked.has(choice.value)})),
        loop: false,
        required: !request.optional,
      })
    }
    default:
      return input({
        message,
        default: typeof suggested === 'string' ? suggested : undefined,
        validate: (value) => validate(spec, request, value),
      })
  }
}

function choicesOf(spec: SelectInput | ChecklistInput, request: InputRequest): InputChoice[] {
  return (request.choices ?? spec.choices ?? []).map((choice) =>
    typeof choice === 'string' ? {name: choice, value: choice} : choice,
  )
}

function describe(spec: InputSpec): void {
  if (spec.env || spec.config) {
    log.blank()
    log.warning0(`${spec.label} n'est pas défini.`)
  }
  if (spec.hint) log.raw(`     ${spec.hint}`)
  if (spec.generateUrl) log.raw(`     Pour le générer : ${spec.generateUrl}`)
}

function validate(spec: InputSpec, request: InputRequest, value: string): true | string {
  if (!value.trim()) return true
  try {
    parse(spec, request, value)
    return true
  } catch (error) {
    return (error as Error).message
  }
}

async function rememberInConsole(spec: InputSpec, value: string): Promise<void> {
  const [envName] = spec.env ?? []
  if (envName) {
    const save = await confirm({
      message: `  Sauvegarder ${envName} dans .env-codoc pour les prochains runs ?`,
      default: true,
      theme: CONFIRM_THEME,
    }).catch(() => false)
    if (save) {
      upsertEnvLine(envName, value)
      log.success1(`[UPDATED] ${envName} sauvegardé dans .env-codoc`)
    }
  } else if (spec.config) {
    log.info1('Pour ne plus avoir à le saisir, ajoute dans codoc.yaml :')
    log.raw(yamlSnippet(spec.config, value))
  }
}

function yamlSnippet(path: string[], value: string): string {
  return path
    .map((key, depth) => `       ${'  '.repeat(depth)}${key}:${depth === path.length - 1 ? ` ${value}` : ''}`)
    .join('\n')
}

function upsertEnvLine(name: string, value: string): void {
  const lineRe = new RegExp(`^\\s*${escapeRegex(name)}\\s*=.*$`, 'm')
  const newLine = `${name}=${value}`

  if (!fileExists(CODOC_ENV_FILE)) {
    writeFile(CODOC_ENV_FILE, `${newLine}\n`)
    return
  }

  const content = readFile(CODOC_ENV_FILE)
  if (lineRe.test(content)) {
    writeFile(CODOC_ENV_FILE, content.replace(lineRe, newLine))
  } else {
    const sep = content.endsWith('\n') ? '' : '\n'
    writeFile(CODOC_ENV_FILE, `${content}${sep}${newLine}\n`)
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
