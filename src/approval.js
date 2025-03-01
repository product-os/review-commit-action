const core = require('@actions/core')

class ApprovalProcess {
  constructor(gitHubClient, reactionManager, config) {
    this.gitHubClient = gitHubClient
    this.reactionManager = reactionManager
    this.config = config
  }

  async run() {
    const tokenUser = await this.gitHubClient.getAuthenticatedUser()

    const runUrl = await this.gitHubClient.getWorkflowRunUrl()

    const commentBody = [
      ...this.config.commentHeaders,
      `${runUrl}`,
      ...this.config.commentFooters
    ].join('\n\n')

    // await this.gitHubClient.deleteStaleIssueComments(
    //   this.config.commentHeader
    // )

    const comment = await this.gitHubClient.createIssueComment(commentBody)

    core.saveState('comment-id', comment.id)
    core.setOutput('comment-id', comment.id)

    await this.reactionManager.setReaction(
      comment.id,
      tokenUser.id,
      this.reactionManager.reactions.WAIT
    )

    try {
      await this.waitForApproval(
        comment.id,
        tokenUser.id,
        this.config.pollInterval
      )
      await this.reactionManager.setReaction(
        comment.id,
        tokenUser.id,
        this.reactionManager.reactions.SUCCESS
      )
    } catch (error) {
      await this.reactionManager.setReaction(
        comment.id,
        tokenUser.id,
        this.reactionManager.reactions.FAILED
      )
      throw error
    }
  }

  // Wait for approval by checking reactions on a comment
  async waitForApproval(commentId, tokenUserId, interval = 30) {
    core.info(`Checking for reactions at ${interval}-second intervals...`)
    for (;;) {
      const reactions = await this.reactionManager.getEligibleReactions(
        commentId,
        this.config.reviewerPermissions,
        this.config.authorsCanReview
      )

      const rejectedBy = reactions.find(
        r => r.content === this.reactionManager.reactions.REJECT
      )?.user.login

      if (rejectedBy) {
        core.debug(`Workflow rejected by ${rejectedBy}`)
        core.saveState('rejected-by', rejectedBy)
        core.setOutput('rejected-by', rejectedBy)
        throw new Error(`Workflow rejected by ${rejectedBy}`)
      }

      const approvedBy = reactions.find(
        r => r.content === this.reactionManager.reactions.APPROVE
      )?.user.login

      if (approvedBy) {
        core.saveState('approved-by', approvedBy)
        core.setOutput('approved-by', approvedBy)
        core.info(`Workflow approved by ${approvedBy}`)
        return
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000))
    }
  }
}

module.exports = { ApprovalProcess }
