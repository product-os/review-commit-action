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

    this.commentHeader = `A repository maintainer needs to approve this workflow.`
    this.commentBody = `${this.commentHeader}\n\nReact with :${this.approveReaction}: to approve or :${this.rejectReaction}: to reject.`
    this.octokit = github.getOctokit(this.token)
    this.context = github.context
  }

  async getAuthenticatedUser() {
    try {
      const query = `query { viewer { databaseId login } }`
      const { viewer } = await this.octokit.graphql(query)
      return viewer
    } catch (error) {
      core.error(`Failed to get authenticated user: ${error.message}`)
      throw error
    }
  }

  async run() {
    try {
      if (!this.context.payload.pull_request) {
        throw new Error('This action only works on pull requests.')
      }

      const prHeadSha = this.context.payload.pull_request.head.sha

      this.tokenUser = await this.getAuthenticatedUser()

      const existingComment = await this.findCommitComment(
        prHeadSha,
        this.tokenUser.databaseId,
        this.commentBody
      )

      if (existingComment) {
        core.setOutput('comment-id', existingComment.id)
        this.commitComment = new CommitComment(
          existingComment.id,
          existingComment.url,
          this.octokit,
          this.context
        )
      }

      if (!this.commitComment) {
        const newComment = await this.createCommitComment(prHeadSha)

        if (newComment) {
          core.setOutput('comment-id', newComment.id)
          this.commitComment = new CommitComment(
            newComment.id,
            newComment.url,
            this.octokit,
            this.context
          )
        }
      }

      if (!this.commitComment) {
        throw new Error('Failed to create or find commit comment.')
      }

      await this.setReaction(this.waitReaction)
      await this.resetPRComment(this.commentHeader, this.commitComment.url)
      await this.waitForApproval(this.commitComment, this.checkInterval)
      await this.setReaction(this.successReaction)
    } catch (error) {
      await this.setReaction(this.failedReaction)
      core.setFailed(error.message)
      throw error // Re-throw the error so it can be caught in tests
    }
  }

  // Find existing commit comment with the following criteria:
  // - body matches commentBody
  // - created_at matches updated_at
  // - user matches the provided token
  async findCommitComment(commitSha, userId, body = this.commentBody) {
    const { data: comments } =
      await this.octokit.rest.repos.listCommentsForCommit({
        ...this.context.repo,
        commit_sha: commitSha
      })

    // Filter commit comments to match the body to commentBody and created_at matches updated_at
    const comment = comments.find(
      c =>
        c.body === body && c.created_at === c.updated_at && c.user.id === userId
    )

    if (!comment || !comment.id) {
      core.info('No matching commit comment found.')
      return null
    }

    core.info(`Found existing commit comment: ${comment.url}`)
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
      core.info('No matching PR comment found.')
      return null
    }

    core.info(`Found existing PR comment: ${comment.url}`)
    return comment
  }

  // Create a new commit comment with the provided commentBody
  async createCommitComment(commitSha, body = this.commentBody) {
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

    core.info(`Created new commit comment: ${comment.url}`)
    return comment
  }

  async createPrComment(body) {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number,
      body
    })

    if (!comment || !comment.id) {
      throw new Error('Failed to create PR comment for approval.')
    }

    core.info(`Created new PR comment: ${comment.url}`)
    return comment
  }

  async resetPRComment(header, url) {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      ...this.context.repo,
      issue_number: this.context.payload.pull_request.number
    })

    const filteredComments = comments.data.filter(
      c =>
        c.body.startsWith(header) &&
        c.user.id === this.tokenUser.databaseId &&
        c.created_at === c.updated_at
    )

    await this.createPrComment(`${header}\n\nSee ${url}`)

    core.info(`Created new PR comment: ${header}`)

    for (const comment of filteredComments) {
      await this.octokit.rest.issues.deleteComment({
        ...this.context.repo,
        comment_id: comment.id
      })
    }
  }

  // Wait for approval by checking reactions on a comment
  async waitForApproval(interval = this.checkInterval) {
    const startTime = Date.now()
    core.info('Checking for reactions...')
    for (;;) {
      if (
        this.timeoutSeconds > 0 &&
        (Date.now() - startTime) / 1000 > this.timeoutSeconds
      ) {
        throw new Error('Approval process timed out')
      }

      const reactions = await this.getEligibleReactions()

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

      core.debug('Waiting for reactions...')
      await new Promise(resolve => setTimeout(resolve, interval * 1000))
    }
  }

  async getUserPermission(username) {
    const { data: permissionData } =
      await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        ...this.context.repo,
        username
      })
    return permissionData.permission
  }

  // Eligible reactions are those by users with the required permissions
  async getEligibleReactions(permissions = ['write', 'admin']) {
    if (!this.commitComment) {
      throw new Error(`Commit comment not found`)
    }
    const reactions = await this.commitComment.getReactions()
    const filtered = []

    for (const reaction of reactions) {
      // Get IDs of all commit authors
      const commitAuthors = this.context.payload.pull_request.commits.map(
        c => c.author.id
      )

      // Exclude reactions by commit authors
      if (commitAuthors.includes(reaction.user.id)) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is a commit author)`
        )
        continue
      }

      // Exclude reactions by the token user
      if (reaction.user.id === this.tokenUser.databaseId) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is token user)`
        )
        continue
      }

      // Exclude reactions by users without the required permissions
      const permission = await this.getUserPermission(reaction.user.login)
      if (!permissions.includes(permission)) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user lacks permission)`
        )
        continue
      }

      core.info(
        `Found reaction :${reaction.content}: by ${reaction.user.login}`
      )
      filtered.push(reaction)
    }

    return filtered
  }

  async getReactionsByUser(id) {
    const reactions = await this.commitComment.getReactions()
    const filtered = []

    for (const reaction of reactions) {
      if (reaction.user.id === id) {
        filtered.push(reaction)
      }
    }

    return filtered
  }

  async removeReactionsByUser(id) {
    const actorReactions = await this.getReactionsByUser(id)
    for (const reaction of actorReactions) {
      this.commitComment.deleteReaction(reaction.id)
    }
  }

  // Set a single reaction on a comment, removing other reactions by this actor
  async setReaction(content) {
    if (!this.commitComment) {
      // nothing to do
      return
    }
    if (this.tokenUser) {
      await this.removeReactionsByUser(this.tokenUser.databaseId)
    }
    return this.commitComment.createReaction(content)
  }
}

const action = new ApprovalAction()

module.exports = {
  ApprovalAction,
  action
}
