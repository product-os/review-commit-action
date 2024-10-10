const core = require('@actions/core')
const Logger = require('./logger')

class ApprovalProcess {
  constructor(gitHubClient, reactionManager, config) {
    this.gitHubClient = gitHubClient
    this.reactionManager = reactionManager
    this.config = config
  }

  async run() {
    const prHeadSha = this.gitHubClient.getPullRequestHeadSha()
    const tokenUser = await this.gitHubClient.getAuthenticatedUser()

    let comment = await this.gitHubClient.findCommitComment(
      prHeadSha,
      tokenUser.id,
      this.config.commentBody
    )
    if (!comment) {
      comment = await this.gitHubClient.createCommitComment(
        prHeadSha,
        this.config.commentBody
      )
    }

    await this.reactionManager.createReaction(
      comment.id,
      this.config.waitReaction
    )
    await this.gitHubClient.deleteStalePullRequestComments(
      this.config.commentHeader
    )
    await this.gitHubClient.createPullRequestComment(
      `${this.config.commentHeader}\n\nSee ${comment.url}`
    )

    try {
      await this.waitForApproval(comment.id, this.config.checkInterval)
      await this.reactionManager.createReaction(
        comment.id,
        this.config.successReaction
      )
    } catch (error) {
      await this.reactionManager.createReaction(
        comment.id,
        this.config.failedReaction
      )
      throw error
    }
  }

  // Wait for approval by checking reactions on a comment
  async waitForApproval(commentId, interval = 30, timeout = 0) {
    const startTime = Date.now()
    Logger.info('Checking for reactions...')
    for (;;) {
      if (timeout > 0 && (Date.now() - startTime) / 1000 > timeout) {
        throw new Error('Approval process timed out')
      }

      const reactions = await this.reactionManager.getEligibleReactions(
        commentId,
        this.config.reviewerPermissions
      )

      const rejectedBy = reactions.find(
        r => r.content === this.config.rejectReaction
      )?.user.login

      if (rejectedBy) {
        Logger.info(`Workflow rejected by ${rejectedBy}`)
        core.setOutput('rejected-by', rejectedBy)
        throw new Error(`Workflow rejected by ${rejectedBy}`)
      }

      const approvedBy = reactions.find(
        r => r.content === this.config.approveReaction
      )?.user.login

      if (approvedBy) {
        Logger.info(`Workflow approved by ${approvedBy}`)
        core.setOutput('approved-by', approvedBy)
        return
      }

      Logger.debug('Waiting for reactions...')
      await new Promise(resolve => setTimeout(resolve, interval * 1000))
    }
  }
}

module.exports = { ApprovalProcess }
