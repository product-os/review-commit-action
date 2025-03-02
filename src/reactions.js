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

  // Create a reaction for a comment
  // If the reaction already exists this will be no-op
  async createReaction(commentId, content) {
    return this.gitHubClient.createReactionForIssueComment(commentId, content)
  }

  // Delete a reaction for a comment
  async deleteReaction(commentId, reactionId) {
    return this.gitHubClient.deleteReactionForIssueComment(
      commentId,
      reactionId
    )
  }

  // Get all reactions for a comment
  async getReactions(commentId) {
    return this.gitHubClient.getReactionsForIssueComment(commentId)
  }

  // Eligible reactions are those by users with the required permissions
  async getEligibleReactions(commentId, permissions, authorsCanReview) {
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
