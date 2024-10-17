const core = require('@actions/core')

class PostProcess {
  constructor(gitHubClient, reactionManager) {
    this.gitHubClient = gitHubClient
    this.reactionManager = reactionManager
  }

  async run() {
    try {
      const reaction = core.getState('reaction')
      const commentId = core.getState('comment-id')
      const wasApproved = core.getState('approved-by') !== ''
      const tokenUser = await this.gitHubClient.getAuthenticatedUser()

      if (commentId && wasApproved) {
        await this.reactionManager.setReaction(
          commentId,
          tokenUser.id,
          this.reactionManager.reactions.SUCCESS
        )
        return
      }
      await this.reactionManager.setReaction(
        commentId,
        tokenUser.id,
        this.reactionManager.reactions.FAILED
      )
    } catch (error) {
      core.warning(`Cleanup failed: ${error.message}`)
    }
  }
}

module.exports = { PostProcess }
