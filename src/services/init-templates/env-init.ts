export function envTemplate(): string {
  return `# Identifiants - NE PAS COMMITTER
# Toujours préfixés par la clé de l'environnement Confluence (atlassian.environments.<clé> dans
# codoc.yaml) - même s'il n'y en a qu'un seul, jamais de variable générique partagée.

CONFLUENCE_DEFAULT_USERNAME=prenom.nom@entreprise.com
CONFLUENCE_DEFAULT_API_TOKEN=votre_token_api_confluence
`
}
