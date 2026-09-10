// Macros « à corps riche » - blockquote typé au pull (`[info] …`), macro structurée au publish.

export const RICH_BODY_MACRO_TYPES = ["info", "note", "warning", "tip", "expand"] as const;

/** Fragment d'alternation regex correspondant, ex. "info|note|warning|tip|expand". */
export const RICH_BODY_MACRO_TYPES_PATTERN = RICH_BODY_MACRO_TYPES.join("|");
