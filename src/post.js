const core = require('@actions/core')

class PostProcess {
  constructor(gitHubClient, reactionManager) {
    this.gitHubClient = gitHubClient
    this.reactionManager = reactionManager
  }

  async run() {
    try {
      const commentId = core.getState('comment-id')
      const wasApproved = core.getState('approved-by') !== ''

      if (commentId && wasApproved) {
        await this.reactionManager.createReaction(
          commentId,
          this.reactionManager.reactions.SUCCESS
        )
        return
      }
      await this.reactionManager.createReaction(
        commentId,
        this.reactionManager.reactions.FAILED
      )
    } catch (error) {
      core.warning(`Cleanup failed: ${error.message}`)
    }
  }
}

module.exports = { PostProcess }
