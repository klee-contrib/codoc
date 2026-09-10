import { memoizedRegex } from "./regex-cache.js";

const macroParamRegexFor = memoizedRegex(
  (name) => new RegExp(`<ac:parameter[^>]*ac:name="${name}"[^>]*>([\\s\\S]*?)<\\/ac:parameter>`),
);
const macroRegexFor = memoizedRegex(
  (name) => new RegExp(`<ac:structured-macro[^>]*ac:name="${name}"[^>]*>[\\s\\S]*?<\\/ac:structured-macro>`, "g"),
);

/** Valeur (trimée) d'un `<ac:parameter ac:name="NAME">…</ac:parameter>`, ou undefined.
 *  `name` est inséré tel quel dans la regex (les motifs comme "colou?r" sont donc supportés). */
export function macroParam(inner: string, name: string): string | undefined {
  return inner.match(macroParamRegexFor(name))?.[1]?.trim();
}

/** Regex globale matchant toutes les `<ac:structured-macro ac:name="NAME">…</ac:structured-macro>`. */
export function macroRegex(name: string): RegExp {
  return macroRegexFor(name);
}

/** Position juste après le `</div>` fermant le `<div` ouvert à `start` (gère l'imbrication). */
export function findDivEnd(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    if (s.startsWith("<div", i) && /[\s>]/.test(s[i + 4] ?? "")) {
      depth++;
      i += 4;
    } else if (s.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) return i + 6;
      i += 6;
    } else {
      i++;
    }
  }
  return s.length;
}
