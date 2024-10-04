class CommitComment {
  constructor(commentId, octokit, context) {
    this.id = commentId
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

  async getUserPermission(username) {
    const { data: permissionData } =
      await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        ...this.context.repo,
        username
      })
    return permissionData.permission
  }

  async getReactionsByPermissions(permissions = ['write', 'admin']) {
    const reactions = await this.getReactions()
    const filtered = []

    for (const reaction of reactions) {
      // TODO: exclude commit author(s) from maintainer reactions
      const permission = await this.getUserPermission(reaction.user.login)
      if (permissions.includes(permission)) {
        filtered.push(reaction)
      }
    }

    return filtered
  }

  async getReactionsByActor(actor) {
    const reactions = await this.getReactions()
    const filtered = []

    for (const reaction of reactions) {
      if (reaction.user.login === actor) {
        filtered.push(reaction)
      }
    }

    return filtered
  }

  async removeReactionsByActor(actor) {
    const actorReactions = await this.getReactionsByActor(actor)
    for (const reaction of actorReactions) {
      this.deleteReaction(reaction.id)
    }
  }

  // Set a single reaction on a comment, removing other reactions by this actor
  async setReaction(content) {
    await this.removeReactionsByActor(this.context.actor)
    return this.createReaction(content)
  }
}

module.exports = {
  CommitComment
}
