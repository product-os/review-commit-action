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
    core.info(`Deleted ${filteredComments.length} stale comments.`)
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
}

module.exports = { GitHubClient }
