import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { checkbox } from "@inquirer/prompts";

export type Rl = readline.Interface;

export function createRl(): Rl {
  return readline.createInterface({ input, output });
}

export async function ask(rl: Rl, question: string): Promise<string> {
  return (await rl.question(`  ${question} `)).trim();
}

export async function askWithDefault(rl: Rl, question: string, defaultValue: string): Promise<string> {
  return (await ask(rl, `${question} [${defaultValue}]`)) || defaultValue;
}

export async function confirm(rl: Rl, question: string, defaultForce = false): Promise<boolean> {
  const answer = (await ask(rl, `${question} ${defaultForce ? "[O/n]" : "[o/n]"}`)).toLowerCase();
  return defaultForce ? answer !== "n" : answer === "o";
}

/** Résolution uniforme d'une valeur : flag CLI → valeur codoc.yaml → prompt (avec `promptDefault`
 * comme valeur pré-remplie affichée, ce qui ne dispense pas de la question). */
export async function resolveValue(
  rl: Rl,
  opts: {flag?: string; config?: string; prompt: string; promptDefault?: string},
): Promise<string> {
  // `!== undefined` (pas une simple vérité) : une chaîne vide explicite (ex. --images-dir "" pour
  // désactiver) doit être respectée, pas retomber sur la config/le prompt.
  if (opts.flag !== undefined) return opts.flag;
  if (opts.config !== undefined) return opts.config;
  return opts.promptDefault !== undefined ? askWithDefault(rl, opts.prompt, opts.promptDefault) : ask(rl, opts.prompt);
}

/** Résolution uniforme d'une décision oui/non : flag CLI → prompt. */
export async function resolveConfirm(
  rl: Rl,
  opts: {flag?: boolean; question: string; default: boolean},
): Promise<boolean> {
  return opts.flag ?? (await confirm(rl, opts.question, opts.default));
}

export interface MultiSelectChoice<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Sélection multiple interactive (0..n), avec description affichée par choix. Contrairement à
 * ask/confirm/resolveValue ci-dessus, ne prend pas de `Rl` : @inquirer/prompts pilote lui-même le
 * terminal (mode raw) et ne peut pas partager un readline.Interface déjà ouvert - n'appelle donc
 * jamais cette fonction pendant qu'un `Rl` créé par `createRl()` est actif.
 */
export async function selectMultiple<T extends string>(
  message: string,
  choices: MultiSelectChoice<T>[],
): Promise<T[]> {
  return checkbox<T>({
    choices: choices.map((c) => ({
      checked: false,
      name: c.description ? `${c.label} — ${c.description}` : c.label,
      value: c.value,
    })),
    loop: false,
    message,
  });
}
