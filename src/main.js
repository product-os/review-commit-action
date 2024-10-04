const core = require('@actions/core')
const github = require('@actions/github')

class ApprovalAction {
  constructor() {
    this.token = core.getInput('github-token')
    this.checkInterval = parseInt(core.getInput('check-interval')) || 10

    // https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28#about-reactions
    this.approveReaction = '+1'
    this.rejectReaction = '-1'
    this.waitReaction = 'eyes'
    this.successReaction = 'rocket'
    this.failedReaction = 'confused'

    this.commentBody = `A repository maintainer needs to approve this workflow.\nReact with :${this.approveReaction}: to approve or :${this.rejectReaction}: to reject.`
    this.octokit = github.getOctokit(this.token)
    this.context = github.context
  }

  async run() {
    try {
      if (!this.context.payload.pull_request) {
        throw new Error('This action only works on pull requests.')
      }

      const prHeadSha = this.context.payload.pull_request.head.sha

      const existingComment = await this.findCommitComment(prHeadSha)

      if (existingComment) {
        this.commitCommentId = existingComment.id
        core.setOutput('comment-id', existingComment.id)
        await this.waitForApproval(existingComment.id)

        this.createReaction(existingComment.id, this.successReaction)
        this.deleteReaction(existingComment.id, this.waitReactionId)
        return
      }

      const newComment = await this.createCommitComment(prHeadSha)

      if (newComment) {
        this.commitCommentId = newComment.id
        core.setOutput('comment-id', newComment.id)
        await this.waitForApproval(newComment.id)

        this.createReaction(newComment.id, this.successReaction)
        this.deleteReaction(newComment.id, this.waitReactionId)
        return
      }

      throw new Error('Failed to create or find commit comment.')
    } catch (error) {
      core.setFailed(error.message)
      if (this.commitCommentId) {
        this.createReaction(this.commitCommentId, this.failedReaction)
        this.deleteReaction(this.commitCommentId, this.waitReactionId)
      }
      throw error // Re-throw the error so it can be caught in tests
    }
  }

  // Find existing commit comments with the following criteria:
  // - body matches commentBody
  // - created_at matches updated_at
  // - user matches the provided token
  async findCommitComment(commitSha) {
    const { data: comments } =
      await this.octokit.rest.repos.listCommentsForCommit({
        ...this.context.repo,
        commit_sha: commitSha
      })

    // Filter commit comments to match the body to commentBody and created_at matches updated_at
    const comment = comments.find(
      c =>
        c.body === this.commentBody &&
        c.created_at === c.updated_at &&
        c.user.login === this.octokit.user.login
    )

    if (!comment || !comment.id) {
      core.debug('No matching commit comment found.')
      return null
    }

    core.debug(`Found comment with ID: ${comment.id}`)
    return comment
  }

  // Create a new commit comment with the provided commentBody
  async createCommitComment(commitSha) {
    const { data: comment } = await this.octokit.rest.repos.createCommitComment(
      {
        ...this.context.repo,
        commit_sha: commitSha,
        body: this.commentBody
      }
    )

    if (!comment || !comment.id) {
      throw new Error('Failed to create commit comment for approval.')
    }

    core.debug(`Created comment with ID: ${comment.id}`)
    return comment
  }

  // Create a reaction on a comment
  // https://octokit.github.io/rest.js/v18/#reactions-create-for-commit-comment
  // https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28#create-reaction-for-a-commit-comment
  async createReaction(commentId, content) {
    const { data: reaction } =
      await this.octokit.rest.reactions.createForCommitComment({
        ...this.context.repo,
        comment_id: commentId,
        content
      })

    if (!reaction || !reaction.id) {
      throw new Error(`Failed to create reaction with content: ${content}`)
    }

    return reaction
  }

  // Delete a reaction on a comment
  // https://octokit.github.io/rest.js/v18/#reactions-delete-for-commit-comment
  // https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28#delete-a-commit-comment-reaction
  async deleteReaction(commentId, reactionId) {
    await this.octokit.rest.reactions.deleteForCommitComment({
      ...this.context.repo,
      comment_id: commentId,
      reaction_id: reactionId
    })
  }

  // Wait for approval by checking reactions on a comment
  async waitForApproval(commentId) {
    this.waitReactionId = (
      await this.createReaction(commentId, this.waitReaction)
    ).id

    for (;;) {
      const reactions = await this.getReactions(commentId)

      const rejectedBy = reactions.find(r => r.content === this.rejectReaction)
        ?.user.login

      if (rejectedBy) {
        // this.createReaction(commentId, this.failedReaction);
        // this.deleteReaction(commentId, this.waitReactionId);

        core.info(`Workflow rejected by ${rejectedBy}`)
        core.setOutput('rejected-by', rejectedBy)
        throw new Error(`Workflow rejected by ${rejectedBy}`)
      }

      const approvedBy = reactions.find(r => r.content === this.approveReaction)
        ?.user.login

      if (approvedBy) {
        // this.createReaction(commentId, this.successReaction);
        // this.deleteReaction(commentId, this.waitReactionId);

        core.info(`Workflow approved by ${approvedBy}`)
        core.setOutput('approved-by', approvedBy)
        return
      }

      core.debug('Waiting for approval...')
      await new Promise(resolve =>
        setTimeout(resolve, this.checkInterval * 1000)
      )
    }
  }

  async getReactions(commentId) {
    const { data: reactions } =
      await this.octokit.rest.reactions.listForCommitComment({
        ...this.context.repo,
        comment_id: commentId
      })

    // Filter reactions from non-collaborators by checking permissions
    const maintainerReactions = reactions.filter(
      async reaction =>
        (await this.getUserPermission(reaction.user.login)) !== 'none'
    )

    return maintainerReactions
  }

  async getUserPermission(username) {
    const { data: permissionData } =
      await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        ...this.context.repo,
        username
      })
    return permissionData.permission
  }
}

const action = new ApprovalAction()

module.exports = {
  ApprovalAction,
  action
}
