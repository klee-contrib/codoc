import {ConfluenceClient, createConfluenceClient} from '../../clients/confluence/confluence-client.js'
import {log} from '../../services/log/logger.js'
import {ConfluenceConfig} from '../../types/codoc-types.js'

/** Cache des clients Confluence par environnement. */
export class EnvRegistry {
  private clients = new Map<string, ConfluenceClient>()
  private connected = new Set<string>()

  raw(env: ConfluenceConfig): ConfluenceClient {
    let c = this.clients.get(env.key)
    if (!c) {
      c = createConfluenceClient(env)
      this.clients.set(env.key, c)
    }
    return c
  }

  async connect(env: ConfluenceConfig): Promise<ConfluenceClient> {
    const c = this.raw(env)
    if (!this.connected.has(env.key)) {
      if (!(await c.pages.testConnection())) {
        throw new Error(`Connexion impossible à l'environnement "${env.key}" (${env.baseUrl}).`)
      }
      log.success0(`Connecté à Confluence [${env.key}] - ${env.baseUrl}`)
      this.connected.add(env.key)
    }
    return c
  }
}
