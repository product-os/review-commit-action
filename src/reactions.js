const core = require('@actions/core')

class ReactionManager {
  constructor(gitHubClient) {
    this.gitHubClient = gitHubClient
    this.reactions = Object.freeze({
      APPROVE: '+1',
      REJECT: '-1',
      WAIT: 'eyes',
      SUCCESS: 'rocket',
      FAILED: 'confused'
    })
  }

  async createReaction(commentId, content) {
    return this.gitHubClient.createReactionForIssueComment(commentId, content)
  }

  async deleteReaction(commentId, reactionId) {
    return this.gitHubClient.deleteReactionForIssueComment(
      commentId,
      reactionId
    )
  }

  async getReactions(commentId) {
    return this.gitHubClient.getReactionsForIssueComment(commentId)
  }

  async getReactionsByUser(commentId, userId) {
    const reactions = await this.getReactions(commentId)
    const filtered = []

    for (const reaction of reactions) {
      if (reaction.user.id === userId) {
        filtered.push(reaction)
      }
    }

    return filtered
  }

  async removeReactionsByUser(commentId, userId) {
    const actorReactions = await this.getReactionsByUser(commentId, userId)
    for (const reaction of actorReactions) {
      this.deleteReaction(commentId, reaction.id)
    }
  }

  // Set a single reaction on a comment, removing other reactions by this actor
  async setReaction(commentId, userId, content) {
    if (core.getState('reaction') === content) {
      core.debug(
        `Skipping setting reaction :${content}: (reaction is already set)`
      )
      return
    }
    await this.removeReactionsByUser(commentId, userId)
    await this.createReaction(commentId, content)
    core.saveState('reaction', content)
  }

  // Eligible reactions are those by users with the required permissions
  async getEligibleReactions(
    commentId,
    tokenUserId,
    permissions,
    authorsCanReview
  ) {
    const reactions = await this.getReactions(commentId)
    const filtered = []

    // Get all commit authors
    const authors = await this.gitHubClient.getPullRequestAuthors()

    for (const reaction of reactions) {
      // Exclude reactions by commit authors
      if (!authorsCanReview && authors.includes(reaction.user.id)) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is a commit author)`
        )
        continue
      }

      // Exclude reactions by the token user
      if (reaction.user.id === tokenUserId) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is the token user)`
        )
        continue
      }

      // Exclude reactions by users without the required permissions
      const permission = await this.gitHubClient.getUserPermission(
        reaction.user.login
      )
      if (!permissions.includes(permission)) {
        core.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user lacks required permissions)`
        )
        continue
      }

      core.debug(
        `Found reaction :${reaction.content}: by ${reaction.user.login}`
      )
      filtered.push(reaction)
    }

    return filtered
  }
}

module.exports = { ReactionManager }
