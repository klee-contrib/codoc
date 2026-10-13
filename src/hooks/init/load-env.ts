import {Hook} from '@oclif/core'

import {CODOC_ENV_FILE, ENV_FILE, USER_ENV_FILE} from '../../config/codoc-paths.js'
import {loadEnvFiles} from '../../services/env-files.js'

const hook: Hook<'init'> = async function () {
  loadEnvFiles([CODOC_ENV_FILE, ENV_FILE, USER_ENV_FILE])
}

export default hook
