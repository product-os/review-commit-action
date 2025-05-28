const core = require('@actions/core')

class ApprovalProcess {
  constructor(gitHubClient, config) {
    this.gitHubClient = gitHubClient
    this.config = config
  }

  async run() {
    const commitSha = this.gitHubClient.getCurrentCommitSha()
    core.info(`Checking for approval reviews on commit: ${commitSha}`)

    // Create instructional comment (only if one doesn't already exist)
    const runUrl = await this.gitHubClient.getWorkflowRunUrl()
    const commentBody = [
      'A repository maintainer needs to approve these workflow run(s).',
      '',
      'To approve, maintainers can either:',
      '• **Submit an approval review** on this pull request, OR',
      '• **Submit a review comment** starting with `/deploy`',
      'Then re-run the failed job(s) via the Checks tab above.',
      '',
      'Reviews must be on the specific commit SHA of the workflow run to be considered.'
    ].join('\n\n')

    // Use a unique pattern to identify our instructional comments
    const uniquePattern =
      'A repository maintainer needs to approve these workflow run(s).'
    await this.gitHubClient.createIssueCommentIfNotExists(
      commentBody,
      uniquePattern
    )

    try {
      const approvalResult = await this.checkForApproval(
        commitSha,
        this.config.reviewerPermissions,
        this.config.authorsCanReview
      )

      if (approvalResult) {
        core.info(
          `Workflow approved by ${approvalResult.approvedBy} via ${approvalResult.reviewType} review`
        )
        core.setOutput('approved-by', approvalResult.approvedBy)
        core.setOutput('review-id', approvalResult.reviewId)
        core.setOutput('review-type', approvalResult.reviewType)
        return
      } else {
        throw new Error(
          `No eligible approval found for commit ${commitSha}. ` +
            `Reviews must be either APPROVED state or contain '/deploy' command ` +
            `and be from users with write/admin permissions.`
        )
      }
    } catch (error) {
      core.setFailed(error.message)
      throw error
    }
  }

  // Check for approval reviews on the specified commit
  async checkForApproval(commitSha, requiredPermissions, allowAuthors) {
    const eligibleReviews = await this.gitHubClient.getEligibleReviewsForCommit(
      commitSha,
      requiredPermissions,
      allowAuthors
    )

    if (eligibleReviews.length === 0) {
      core.info('No eligible approval reviews found')
      return null
    }

    // Return the first eligible review (most recent reviews are typically first)
    const approvalReview = eligibleReviews[0]

    return {
      approvedBy: approvalReview.user.login,
      reviewId: approvalReview.id,
      reviewType: approvalReview.reviewType
    }
  }
}

module.exports = { ApprovalProcess }
