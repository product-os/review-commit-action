const Logger = require('./logger')

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

    // The html_url property contains the unique URL for this run
    return workflowRun.html_url
  }

  async getPullRequestAuthors() {
    const commits = await this.getPullRequestCommits()
    return commits.map(c => c.author.id)
  }

  getPullRequestRepository() {
    const payloadBaseRepo = {
      owner: this.context.payload.pull_request.base.repo.owner.login,
      repo: this.context.payload.pull_request.base.repo.name
    }

    // This condition is for the untested case where the PR is from a fork.
    // We can't take the risk that the base repo is different from the context repo.
    // This should never happen but bail out if it ever does.
    if (JSON.stringify(this.context.repo) !== JSON.stringify(payloadBaseRepo)) {
      Logger.debug(JSON.stringify(this.context.repo, null, 2))
      Logger.debug(JSON.stringify(payloadBaseRepo, null, 2))
      throw new Error(
        'Context repo does not match payload pull request base repo!'
      )
    }
    return this.context.repo
  }

  // https://octokit.github.io/rest.js/v18/#pulls-list-commits
  // https://docs.github.com/en/rest/pulls/pulls#list-commits-on-a-pull-request
  async getPullRequestCommits() {
    const { data: commits } = await this.octokit.rest.pulls.listCommits({
      ...this.context.repo,
      pull_number: this.context.payload.pull_request.number
    })
    return commits
  }

  async getAuthenticatedUser() {
    const query = `query { viewer { databaseId login } }`
    const { viewer } = await this.octokit.graphql(query)
    return { login: viewer.login, id: viewer.databaseId }
  }

  // Find existing PR comment with the following criteria:
  // - body matches commentBody
  // - created_at matches updated_at
  // - user matches the provided token
  async findIssueComment(userId, body) {
    const comments = await this.listIssueComments()
    const comment = comments.find(
      c =>
        c.body === body && c.user.id === userId && c.created_at === c.updated_at
    )

    if (!comment || !comment.id) {
      Logger.info('No matching issue comment found.')
      return null
    }

    Logger.info(`Found existing issue comment: ${comment.url}`)
    return comment
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

    Logger.info(`Created new issue comment: ${comment.url}`)
    return comment
  }

  // https://octokit.github.io/rest.js/v18/#issues-list-comments
  // https://docs.github.com/en/rest/issues/comments#list-issue-comments
  async listIssueComments() {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number
    })
    return comments
  }

  // Delete all PR comments that start with the provided string
  async deleteStaleIssueComments(startsWith) {
    const comments = await this.listIssueComments()
    const userId = (await this.getAuthenticatedUser()).id
    const filteredComments = comments.filter(
      c =>
        c.body.startsWith(startsWith) &&
        c.user.id === userId &&
        c.created_at === c.updated_at
    )

    for (const comment of filteredComments) {
      await this.octokit.rest.issues.deleteComment({
        ...this.context.repo,
        comment_id: comment.id
      })
    }
  }

  // https://octokit.github.io/rest.js/v21/#repos-get-collaborator-permission-level
  // https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user
  async getUserPermission(username) {
    const { data: permissionData } =
      await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        ...this.context.repo,
        username
      })
    return permissionData.permission
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
  }
}

module.exports = { GitHubClient }
