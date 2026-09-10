const CONFLUENCE_LANGUAGES = new Set([
  "actionscript3",
  "bash",
  "csharp",
  "coldfusion",
  "cpp",
  "css",
  "delphi",
  "diff",
  "erlang",
  "groovy",
  "html",
  "java",
  "javafx",
  "javascript",
  "json",
  "lua",
  "none",
  "perl",
  "php",
  "powershell",
  "python",
  "ruby",
  "scala",
  "sql",
  "vbnet",
  "xml",
  "yaml",
]);

const LANGUAGE_MAP: Record<string, string> = {
  ts: "javascript",
  tsx: "javascript",
  typescript: "javascript",
  jsx: "javascript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  fish: "bash",
  htm: "html",
  svg: "xml",
  yml: "yaml",
  cs: "csharp",
  "c#": "csharp",
  vb: "vbnet",
  "c++": "cpp",
  c: "cpp",
  jsonc: "json",
  text: "none",
  plaintext: "none",
  txt: "none",
  console: "bash",
  terminal: "bash",
};

/** Normalise un langage Markdown vers un langage supporté par la macro code (sinon "none"). */
export function confluenceLanguage(lang: string | undefined | null): string {
  if (!lang) return "none";
  const normalized = lang.trim().toLowerCase();
  const mapped = LANGUAGE_MAP[normalized] ?? normalized;
  return CONFLUENCE_LANGUAGES.has(mapped) ? mapped : "none";
}
