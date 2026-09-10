import {Hook} from '@oclif/core'

const hook: Hook<'command_not_found'> = async function (options) {
  const id = options.id.replaceAll(':', ' ')
  this.error(`La commande « codoc ${id} » n'existe pas. Lance « codoc help » pour la liste des commandes.`, {
    exit: 2,
  })
}

export default hook
