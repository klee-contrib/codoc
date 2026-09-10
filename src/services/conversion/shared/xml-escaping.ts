// Échappement XML - `&` traité EN PREMIER à l'échappement, `&amp;` EN DERNIER au déséchappement
// (sinon on ré-échappe/décode les entités qu'on vient de produire).

/** Échappe le contenu XML : `&` `<` `>`. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Échappe une valeur d'attribut XML : `&` `<` `>` `"`. */
export function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, "&quot;");
}

/** Inverse exact d'{@link escapeXml} : `&lt;` `&gt;` `&amp;`. */
export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Neutralise les séquences de fin de CDATA `]]>` dans un contenu destiné à `<![CDATA[…]]>`. */
export function escapeCdata(text: string): string {
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}
