#!/usr/bin/env node

import {enableCompileCache} from 'node:module'
enableCompileCache()

const {execute} = await import('@oclif/core')
await execute({dir: import.meta.url})
