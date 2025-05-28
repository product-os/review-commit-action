const core = require('@actions/core')

class GitHubClient {
  constructor(octokit, context) {
    this.octokit = octokit
    this.context = context
  }

  // https://octokit.github.io/rest.js/v18/#actions-get-workflow-run
  // https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
  async getWorkflowRunUrl() {
    if (!this.context.runId) {
      throw new Error('No run ID found in context!')
    }

    // Fetch the workflow run data
    const { data: workflowRun } =
      await this.octokit.rest.actions.getWorkflowRun({
        ...this.context.repo,
        run_id: this.context.runId
      })

    core.debug(`Workflow run data: ${workflowRun.url}`)

    // The html_url property contains the unique URL for this run
    return workflowRun.html_url
  }

  async getPullRequestAuthors() {
    const commits = await this.getPullRequestCommits()
    // Get both author and committer IDs, filter out nulls, and remove duplicates.
    // In some cases, the author can be null, or different from the committer.
    return [
      ...new Set(
        commits.flatMap(c => [c.author?.id, c.committer?.id]).filter(Boolean)
      )
    ]
  }

  // https://octokit.github.io/rest.js/v18/#pulls-list-commits
  // https://docs.github.com/en/rest/pulls/pulls#list-commits-on-a-pull-request
  async getPullRequestCommits() {
    const { data: commits } = await this.octokit.rest.pulls.listCommits({
      ...this.context.repo,
      pull_number: this.context.payload.pull_request.number
    })
    core.debug(`Found ${commits.length} commits`)
    core.debug(`Commits payload:\n${JSON.stringify(commits, null, 2)}`)
    return commits
  }

  async getAuthenticatedUser() {
    const query = `query { viewer { databaseId login } }`
    const { viewer } = await this.octokit.graphql(query)
    core.info(`Authenticated as: ${viewer.login}`)
    return { login: viewer.login, id: viewer.databaseId }
  }

  // Create a new PR comment with the provided body
  // https://octokit.github.io/rest.js/v18/#issues-create-comment
  // https://docs.github.com/en/rest/issues/comments#create-an-issue-comment
  async createIssueComment(body) {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number,
      body
    })

    if (!comment || !comment.id) {
      throw new Error('Failed to create issue comment!')
    }

    core.info(`Created new issue comment: ${comment.url}`)
    core.debug(`Comment payload:\n${JSON.stringify(comment, null, 2)}`)
    return comment
  }

  // https://octokit.github.io/rest.js/v18/#issues-list-comments
  // https://docs.github.com/en/rest/issues/comments#list-issue-comments
  async listIssueComments() {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number
    })
    core.debug(`Found ${comments.length} comments`)
    core.debug(`Comments payload:\n${JSON.stringify(comments, null, 2)}`)
    return comments
  }

  // Check if a comment with similar content already exists from the authenticated user
  async findExistingComment(contentPattern) {
    const comments = await this.listIssueComments()
    const userId = (await this.getAuthenticatedUser()).id

    // Find comments from the authenticated user that match the pattern
    const existingComment = comments.find(
      comment =>
        comment.user.id === userId && comment.body.includes(contentPattern)
    )

    if (existingComment) {
      core.info(`Found existing comment with ID: ${existingComment.id}`)
      return existingComment
    }

    core.debug('No existing comment found matching the pattern')
    return null
  }

  // Create a new PR comment with the provided body, but only if a similar one doesn't exist
  async createIssueCommentIfNotExists(body, uniquePattern) {
    // Check if a comment with this pattern already exists
    const existingComment = await this.findExistingComment(uniquePattern)

    if (existingComment) {
      core.info('Skipping comment creation - similar comment already exists')
      return existingComment
    }

    // Create new comment if none exists
    return await this.createIssueComment(body)
  }

  // https://octokit.github.io/rest.js/v18/#reactions-create-for-issue-comment
  // https://docs.github.com/en/rest/reactions/reactions#create-reaction-for-an-issue-comment
  async createReactionForIssueComment(commentId, content) {
    const { data: reaction } =
      await this.octokit.rest.reactions.createForIssueComment({
        ...this.context.repo,
        comment_id: commentId,
        content
      })
    core.info(`Created :${reaction.content}: reaction ID ${reaction.id}`)
    core.debug(`Reaction payload:\n${JSON.stringify(reaction, null, 2)}`)
    return reaction
  }

  // https://octokit.github.io/rest.js/v18/#reactions-list-for-issue-comment
  // https://docs.github.com/en/rest/reactions/reactions#list-reactions-for-an-issue-comment
  async getReactionsForIssueComment(commentId) {
    const { data: reactions } =
      await this.octokit.rest.reactions.listForIssueComment({
        ...this.context.repo,
        comment_id: commentId
      })
    core.debug(`Found ${reactions.length} reactions`)
    core.debug(`Reactions payload:\n${JSON.stringify(reactions, null, 2)}`)
    return reactions
  }

  // https://octokit.github.io/rest.js/v18/#reactions-delete-for-issue-comment
  // https://docs.github.com/en/rest/reactions/reactions#delete-an-issue-comment-reaction
  async deleteReactionForIssueComment(commentId, reactionId) {
    await this.octokit.rest.reactions.deleteForIssueComment({
      ...this.context.repo,
      comment_id: commentId,
      reaction_id: reactionId
    })
    core.info(`Deleted reaction ID ${reactionId}`)
  }

  // Get the current commit SHA from the workflow context
  getCurrentCommitSha() {
    // In pull request events, we want the head SHA (the commit being tested)
    if (this.context.payload.pull_request) {
      return this.context.payload.pull_request.head.sha
    }
    // Fallback to the context SHA
    return this.context.sha
  }

  // https://octokit.github.io/rest.js/v18/#pulls-list-reviews
  // https://docs.github.com/en/rest/pulls/reviews#list-reviews-on-a-pull-request
  async getPullRequestReviews() {
    const { data: reviews } = await this.octokit.rest.pulls.listReviews({
      ...this.context.repo,
      pull_number: this.context.payload.pull_request.number
    })
    core.debug(`Found ${reviews.length} reviews`)
    core.debug(`Reviews payload:\n${JSON.stringify(reviews, null, 2)}`)
    return reviews
  }

  // Get reviews for a specific commit SHA
  async getReviewsForCommit(commitSha) {
    const allReviews = await this.getPullRequestReviews()

    // Filter reviews that are associated with the specific commit
    const commitReviews = allReviews.filter(
      review => review.commit_id === commitSha
    )

    core.debug(`Found ${commitReviews.length} reviews for commit ${commitSha}`)
    return commitReviews
  }

  // Check if a review is an approval review
  isApprovalReview(review) {
    return review.state === 'APPROVED'
  }

  // Check if a review comment contains the deploy command
  isDeployCommandReview(review) {
    if (!review.body) return false

    // Check if the review body starts with /deploy (case insensitive)
    const trimmedBody = review.body.trim().toLowerCase()
    return trimmedBody.startsWith('/deploy')
  }

  // Get eligible reviews for approval (either APPROVED state or deploy command)
  async getEligibleReviewsForCommit(
    commitSha,
    requiredPermissions = ['write', 'admin'],
    allowAuthors = false
  ) {
    const reviews = await this.getReviewsForCommit(commitSha)
    const eligibleReviews = []

    // Get PR authors if we need to exclude them
    let authorIds = []
    if (!allowAuthors) {
      authorIds = await this.getPullRequestAuthors()
    }

    for (const review of reviews) {
      // Skip if author is not allowed and this is from an author
      if (!allowAuthors && authorIds.includes(review.user.id)) {
        core.debug(`Skipping review from PR author: ${review.user.login}`)
        continue
      }

      // Check user permissions
      const userPermission = await this.getUserPermission(review.user.login)
      if (!requiredPermissions.includes(userPermission)) {
        core.debug(
          `User ${review.user.login} has insufficient permissions: ${userPermission}`
        )
        continue
      }

      // Check if this is an eligible review (approval or deploy command)
      if (this.isApprovalReview(review) || this.isDeployCommandReview(review)) {
        eligibleReviews.push({
          ...review,
          reviewType: this.isApprovalReview(review) ? 'approval' : 'comment'
        })
      }
    }

    core.debug(
      `Found ${eligibleReviews.length} eligible reviews for commit ${commitSha}`
    )
    return eligibleReviews
  }

  // https://octokit.github.io/rest.js/v21/#repos-get-collaborator-permission-level
  // https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user
  async getUserPermission(username) {
    const { data: permissionData } =
      await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        ...this.context.repo,
        username
      })
    core.debug(`User ${username} has permission: ${permissionData.permission}`)
    return permissionData.permission
  }
}

module.exports = { GitHubClient }
