const Logger = require('./logger')

class ReactionManager {
  constructor(gitHubClient, config) {
    this.gitHubClient = gitHubClient
    this.config = config
  }

  async createReaction(commentId, content) {
    return this.gitHubClient.createReactionForCommitComment(commentId, content)
  }

  async deleteReaction(commentId, reactionId) {
    return this.gitHubClient.deleteReactionForCommitComment(
      commentId,
      reactionId
    )
  }

  async getReactions(commentId) {
    return this.gitHubClient.getReactionsForCommitComment(commentId)
  }

  async getReactionsByUser(commitId, userId) {
    const reactions = await this.getReactions(commitId)
    const filtered = []

    for (const reaction of reactions) {
      if (reaction.user.id === userId) {
        filtered.push(reaction)
      }
    }

    return filtered
  }

  async removeReactionsByUser(commitId, userId) {
    const actorReactions = await this.getReactionsByUser(commitId, userId)
    for (const reaction of actorReactions) {
      this.deleteReaction(commitId, reaction.id)
    }
  }

  // Set a single reaction on a comment, removing other reactions by this actor
  async setReaction(commitId, userId, content) {
    await this.removeReactionsByUser(commitId, userId)
    return this.createReaction(commitId, content)
  }

  // Eligible reactions are those by users with the required permissions
  async getEligibleReactions(commentId) {
    const permissions = this.config.reviewerPermissions
    const authorsCanReview = this.config.authorsCanReview
    const reactions = await this.getReactions(commentId)
    const filtered = []

    const tokenUser = await this.gitHubClient.getAuthenticatedUser()

    for (const reaction of reactions) {
      // Get IDs of all commit authors
      const authors = await this.gitHubClient.getPullRequestAuthors()

      // Exclude reactions by commit authors
      if (!authorsCanReview && authors.includes(reaction.user.id)) {
        Logger.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is a commit author)`
        )
        continue
      }

      // Exclude reactions by the token user
      if (reaction.user.id === tokenUser.id) {
        Logger.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user is token user)`
        )
        continue
      }

      // Exclude reactions by users without the required permissions
      const permission = await this.gitHubClient.getUserPermission(
        reaction.user.login
      )
      if (!permissions.includes(permission)) {
        Logger.debug(
          `Ignoring reaction :${reaction.content}: by ${reaction.user.login} (user lacks permission)`
        )
        continue
      }

      Logger.info(
        `Found reaction :${reaction.content}: by ${reaction.user.login}`
      )
      filtered.push(reaction)
    }

    return filtered
  }
}

module.exports = { ReactionManager }
