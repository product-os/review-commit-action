const core = require('@actions/core')

class PostProcess {
  constructor(gitHubClient) {
    this.gitHubClient = gitHubClient
  }

  async run() {
    // No cleanup needed for review-based approval
    core.info(
      'Post-process completed - no cleanup required for review-based approval'
    )
  }
}

module.exports = { PostProcess }
