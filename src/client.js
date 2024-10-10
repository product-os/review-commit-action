const Logger = require('./logger')

class GitHubClient {
  constructor(octokit, context) {
    this.octokit = octokit
    this.context = context
  }

  getPullRequestHeadSha() {
    return this.context.payload.pull_request.head.sha
  }

  async getPullRequestAuthors() {
    const commits = await this.getPullRequestCommits()
    return commits.map(c => c.author.id)
  }

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

  // Find existing commit comment with the following criteria:
  // - body matches provided body
  // - created_at matches updated_at
  // - user matches the provided token
  async findCommitComment(commitSha, userId, body) {
    const { data: comments } =
      await this.octokit.rest.repos.listCommentsForCommit({
        ...this.context.repo,
        commit_sha: commitSha
      })

    // Filter commit comments to match the body and created_at matches updated_at
    const comment = comments.find(
      c =>
        c.body === body && c.created_at === c.updated_at && c.user.id === userId
    )

    if (!comment || !comment.id) {
      Logger.info('No matching commit comment found.')
      return null
    }

    Logger.info(`Found existing commit comment: ${comment.url}`)
    return comment
  }

  // Create a new commit comment with the provided body
  // https://octokit.github.io/rest.js/v21/#repos-create-commit-comment
  // https://docs.github.com/rest/commits/comments#create-a-commit-comment
  async createCommitComment(commitSha, body) {
    const { data: comment } = await this.octokit.rest.repos.createCommitComment(
      {
        ...this.context.repo,
        commit_sha: commitSha,
        body
      }
    )

    if (!comment || !comment.id) {
      throw new Error('Failed to create commit comment for approval.')
    }

    Logger.info(`Created new commit comment: ${comment.url}`)
    return comment
  }

  // Find existing PR comment with the following criteria:
  // - body matches commentBody
  // - created_at matches updated_at
  // - user matches the provided token
  async findPrComment(userId, body) {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number
    })

    const comment = comments.find(
      c =>
        c.body === body && c.user.id === userId && c.created_at === c.updated_at
    )

    if (!comment || !comment.id) {
      Logger.info('No matching PR comment found.')
      return null
    }

    Logger.info(`Found existing PR comment: ${comment.url}`)
    return comment
  }

  async createPullRequestComment(body) {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number,
      body
    })

    if (!comment || !comment.id) {
      throw new Error('Failed to create PR comment for approval.')
    }

    Logger.info(`Created new PR comment: ${comment.url}`)
    return comment
  }

  async listPullRequestComments() {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number
    })
    return comments
  }

  async deleteStalePullRequestComments(startsWith) {
    const comments = await this.listPullRequestComments()
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

  // Create a reaction on a comment
  // https://octokit.github.io/rest.js/v18/#reactions-create-for-commit-comment
  // https://docs.github.com/en/rest/reactions/reactions#create-reaction-for-a-commit-comment
  async createReactionForCommitComment(commentId, content) {
    const { data: reaction } =
      await this.octokit.rest.reactions.createForCommitComment({
        ...this.context.repo,
        comment_id: commentId,
        content
      })
    return reaction
  }

  // Delete a reaction on a comment
  // https://octokit.github.io/rest.js/v18/#reactions-delete-for-commit-comment
  // https://docs.github.com/en/rest/reactions/reactions#delete-a-commit-comment-reaction
  async deleteReactionForCommitComment(commentId, reactionId) {
    await this.octokit.rest.reactions.deleteForCommitComment({
      ...this.context.repo,
      comment_id: commentId,
      reaction_id: reactionId
    })
  }

  async getReactionsForCommitComment(commentId) {
    const { data: reactions } =
      await this.octokit.rest.reactions.listForCommitComment({
        ...this.context.repo,
        comment_id: commentId
      })
    return reactions
  }
}

module.exports = { GitHubClient }
