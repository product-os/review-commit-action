class CommitComment {
  constructor(id, octokit, context) {
    this.id = id
    this.octokit = octokit
    this.context = context
  }

  getCommentId() {
    return this.id
  }

  // Create a reaction on a comment
  // https://octokit.github.io/rest.js/v18/#reactions-create-for-commit-comment
  // https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28#create-reaction-for-a-commit-comment
  async createReaction(content) {
    const { data: reaction } =
      await this.octokit.rest.reactions.createForCommitComment({
        ...this.context.repo,
        comment_id: this.id,
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
  async deleteReaction(reactionId) {
    await this.octokit.rest.reactions.deleteForCommitComment({
      ...this.context.repo,
      comment_id: this.id,
      reaction_id: reactionId
    })
  }

  async getReactions() {
    const { data: reactions } =
      await this.octokit.rest.reactions.listForCommitComment({
        ...this.context.repo,
        comment_id: this.id
      })
    return reactions
  }
}

module.exports = {
  CommitComment
}
