const core = require('@actions/core')
const github = require('@actions/github')
const { CommitComment } = require('./comment')

class ApprovalAction {
  constructor() {
    this.token = core.getInput('github-token')
    this.checkInterval = parseInt(core.getInput('check-interval')) || 10
    this.timeoutSeconds = parseInt(core.getInput('timeout-seconds')) || 0 // 0 means no timeout

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

  async getAuthenticatedUser() {
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated()
      return user
    } catch (error) {
      core.error('Error fetching authenticated user:', error)
      throw error
    }
  }

  async run() {
    try {
      if (!this.context.payload.pull_request) {
        throw new Error('This action only works on pull requests.')
      }

      const prHeadSha = this.context.payload.pull_request.head.sha

      const tokenUser = await this.getAuthenticatedUser()
      core.info(`Authenticated as: ${tokenUser.login}`)

      const existingComment = await this.findCommitComment(
        prHeadSha,
        tokenUser.id
      )

      if (existingComment) {
        core.setOutput('comment-id', existingComment.id)
        this.commitComment = new CommitComment(
          existingComment.id,
          this.octokit,
          this.context,
          tokenUser
        )
      }

      const newComment = await this.createCommitComment(prHeadSha)

      if (newComment) {
        core.setOutput('comment-id', newComment.id)
        this.commitComment = new CommitComment(
          newComment.id,
          this.octokit,
          this.context,
          tokenUser
        )
      }

      if (!this.commitComment) {
        throw new Error('Failed to create or find commit comment.')
      }

      await this.commitComment.setReaction(this.waitReaction)
      await this.waitForApproval(this.commitComment, this.checkInterval)
      await this.commitComment.setReaction(this.successReaction)
    } catch (error) {
      if (this.commitComment) {
        await this.commitComment.setReaction(this.failedReaction)
      }
      core.setFailed(error.message)
      throw error // Re-throw the error so it can be caught in tests
    }
  }

  // Find existing commit comments with the following criteria:
  // - body matches commentBody
  // - created_at matches updated_at
  // - user matches the provided token
  async findCommitComment(commitSha, userId) {
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
        c.user.id === userId
    )

    if (!comment || !comment.id) {
      core.info('No matching commit comment found.')
      return null
    }

    core.info(`Found comment with ID: ${comment.id}`)
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

  // Wait for approval by checking reactions on a comment
  async waitForApproval(comment, interval = this.checkInterval) {
    const startTime = Date.now()
    for (;;) {
      if (
        this.timeoutSeconds > 0 &&
        (Date.now() - startTime) / 1000 > this.timeoutSeconds
      ) {
        throw new Error('Approval process timed out')
      }

      const reactions = await comment.getReactionsByPermissions()

      const rejectedBy = reactions.find(r => r.content === this.rejectReaction)
        ?.user.login

      if (rejectedBy) {
        core.info(`Workflow rejected by ${rejectedBy}`)
        core.setOutput('rejected-by', rejectedBy)
        throw new Error(`Workflow rejected by ${rejectedBy}`)
      }

      const approvedBy = reactions.find(r => r.content === this.approveReaction)
        ?.user.login

      if (approvedBy) {
        core.info(`Workflow approved by ${approvedBy}`)
        core.setOutput('approved-by', approvedBy)
        return
      }

      core.debug('Waiting for approval...')
      await new Promise(resolve => setTimeout(resolve, interval * 1000))
    }
  }
}

const action = new ApprovalAction()

module.exports = {
  ApprovalAction,
  action
}
