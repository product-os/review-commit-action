const core = require('@actions/core')

class Logger {
  static info(message) {
    core.info(message)
  }

  static warning(message) {
    core.warning(message)
  }

  static error(message) {
    core.error(message)
  }

  static debug(message) {
    core.debug(message)
  }
}

module.exports = Logger
