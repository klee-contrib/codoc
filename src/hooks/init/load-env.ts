import {Hook} from '@oclif/core'
import dotenv from 'dotenv'

import {CODOC_ENV_FILE, ENV_FILE} from '../../config/codoc-paths.js'

const hook: Hook<'init'> = async function () {
  dotenv.config({path: CODOC_ENV_FILE, quiet: true})
  dotenv.config({path: ENV_FILE, quiet: true})
}

export default hook
