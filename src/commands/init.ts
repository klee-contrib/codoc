import {Command} from '@oclif/core'

import {initCodoc} from '../use-cases/init/init.js'
import {printInitSummary} from '../services/log/init-printer.js'

export default class Init extends Command {
  static description = 'Initialise la configuration codoc : codoc.yaml, .env-codoc, guide de démarrage.'

  static examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    await this.parse(Init)
    const {docRelPath, created, skipped, warnings} = initCodoc()
    printInitSummary(created, skipped, warnings, docRelPath)
  }
}
