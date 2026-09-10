export interface MacroOptions {
  /** Ajoute `ac:schema-version="1"` sur la balise ouvrante. */
  schemaVersion?: boolean;
  /** Paramètres `<ac:parameter ac:name="K">V</ac:parameter>` (V déjà échappé). */
  params?: Array<[string, string]>;
  /** Corps `<ac:plain-text-body><![CDATA[…]]>` (échappement CDATA à la charge de l'appelant). */
  plainTextBody?: string;
  /** Corps `<ac:rich-text-body>` (XML déjà construit, inséré tel quel). */
  richTextBody?: string;
}

export function structuredMacro(name: string, opts: MacroOptions = {}): string {
  const lines = [
    `<ac:structured-macro ac:name="${name}"${opts.schemaVersion ? ' ac:schema-version="1"' : ""}>`,
  ];
  for (const [key, value] of opts.params ?? []) {
    lines.push(`  <ac:parameter ac:name="${key}">${value}</ac:parameter>`);
  }
  if (opts.plainTextBody !== undefined) {
    lines.push(`  <ac:plain-text-body><![CDATA[${opts.plainTextBody}]]></ac:plain-text-body>`);
  }
  if (opts.richTextBody !== undefined) {
    lines.push(`  <ac:rich-text-body>`, opts.richTextBody, `  </ac:rich-text-body>`);
  }
  lines.push(`</ac:structured-macro>`);
  return lines.join("\n");
}
