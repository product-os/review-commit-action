const { CommitComment } = require('../src/comment')

describe('CommitComment', () => {
  let comment
  let mockOctokit
  let mockContext

  beforeEach(() => {
    mockOctokit = {
      rest: {
        reactions: {
          createForCommitComment: jest.fn(),
          deleteForCommitComment: jest.fn(),
          listForCommitComment: jest.fn()
        }
      }
    }
    mockContext = {
      repo: { owner: 'test-owner', repo: 'test-repo' }
    }
    comment = new CommitComment(1, mockOctokit, mockContext)
  })

  test('getCommentId returns correct id', () => {
    expect(comment.getCommentId()).toBe(1)
  })

  test('createReaction creates a reaction', async () => {
    const mockReaction = { id: 1, content: '+1' }
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: mockReaction
    })

    const result = await comment.createReaction('+1')
    expect(result).toEqual(mockReaction)
    expect(
      mockOctokit.rest.reactions.createForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 1,
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
    await comment.deleteReaction(1)
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 1,
      reaction_id: 1
    })
  })

  test('getReactions returns reactions', async () => {
    const mockReactions = [
      { id: 1, content: '+1' },
      { id: 2, content: '-1' }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })

    const result = await comment.getReactions()
    expect(result).toEqual(mockReactions)
    expect(
      mockOctokit.rest.reactions.listForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 1
    })
  })
})
