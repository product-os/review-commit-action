const { CommitComment } = require('../src/comment')
const github = require('@actions/github')

jest.mock('@actions/github')

describe('CommitComment', () => {
  let comment
  const mockOctokit = {
    rest: {
      reactions: {
        createForCommitComment: jest.fn(),
        deleteForCommitComment: jest.fn(),
        listForCommitComment: jest.fn()
      },
      repos: {
        getCollaboratorPermissionLevel: jest.fn()
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    github.getOctokit.mockReturnValue(mockOctokit)
    github.context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      actor: 'test-actor'
    }
    comment = new CommitComment(123, mockOctokit, github.context)
  })

  test('getCommentId returns the correct id', () => {
    expect(comment.getCommentId()).toBe(123)
  })

  test('createReaction creates a reaction successfully', async () => {
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: { id: 456 }
    })

    const result = await comment.createReaction('+1')
    expect(result).toEqual({ id: 456 })
    expect(
      mockOctokit.rest.reactions.createForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 123,
      content: '+1'
    })
  })

  test('createReaction throws error when reaction creation fails', async () => {
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: {}
    })

    await expect(comment.createReaction('+1')).rejects.toThrow(
      'Failed to create reaction with content: +1'
    )
  })

  test('deleteReaction deletes a reaction', async () => {
    await comment.deleteReaction(789)
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 123,
      reaction_id: 789
    })
  })

  test('getReactions returns list of reactions', async () => {
    const mockReactions = [{ id: 1 }, { id: 2 }]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })

    const result = await comment.getReactions()
    expect(result).toEqual(mockReactions)
  })

  test('getUserPermission returns user permission', async () => {
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: 'write' }
    })

    const result = await comment.getUserPermission('test-user')
    expect(result).toBe('write')
  })

  test('getReactionsByPermissions filters reactions by permissions', async () => {
    const mockReactions = [
      { id: 1, user: { login: 'user1' } },
      { id: 2, user: { login: 'user2' } },
      { id: 3, user: { login: 'user3' } }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockImplementation(
      params => {
        const permissions = {
          user1: 'read',
          user2: 'write',
          user3: 'admin'
        }
        return Promise.resolve({
          data: { permission: permissions[params.username] }
        })
      }
    )

    const result = await comment.getReactionsByPermissions(['write', 'admin'])
    expect(result).toEqual([mockReactions[1], mockReactions[2]])
  })

  test('getReactionsByActor filters reactions by actor', async () => {
    const mockReactions = [
      { id: 1, user: { login: 'test-actor' } },
      { id: 2, user: { login: 'other-user' } },
      { id: 3, user: { login: 'test-actor' } }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })

    const result = await comment.getReactionsByActor('test-actor')
    expect(result).toEqual([mockReactions[0], mockReactions[2]])
  })

  test('removeReactionsByActor removes reactions by actor', async () => {
    const mockReactions = [
      { id: 1, user: { login: 'test-actor' } },
      { id: 2, user: { login: 'other-user' } },
      { id: 3, user: { login: 'test-actor' } }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })

    await comment.removeReactionsByActor('test-actor')
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledTimes(2)
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 123,
      reaction_id: 1
    })
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 123,
      reaction_id: 3
    })
  })

  test('setReaction removes existing reactions and creates a new one', async () => {
    const mockReactions = [
      { id: 1, user: { login: 'test-actor' } },
      { id: 2, user: { login: 'test-actor' } }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: { id: 3 }
    })

    await comment.setReaction('+1')
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledTimes(2)
    expect(
      mockOctokit.rest.reactions.createForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 123,
      content: '+1'
    })
  })
})
