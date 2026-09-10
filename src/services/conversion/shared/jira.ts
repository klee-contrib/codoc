// Reconnaît une clé de ticket Jira (ex. DEP-918, PROJ-123).

/** Motif (source, sans ancres ni flags) d'une clé de ticket Jira. */
export const JIRA_KEY_PATTERN = "[A-Z][A-Z0-9]*-\\d+";

/** Clé de ticket Jira, ancrée sur toute la chaîne (ex. validation d'un texte détecté). */
export const JIRA_KEY_RE = new RegExp(`^${JIRA_KEY_PATTERN}$`);
