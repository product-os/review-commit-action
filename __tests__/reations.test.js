const core = require('@actions/core')
const { ReactionManager } = require('../src/reactions')

jest.mock('@actions/core')

describe('ReactionManager', () => {
  let reactionManager
  let mockGitHubClient
  let mockConfig

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {
      createReactionForCommitComment: jest.fn(),
      deleteReactionForCommitComment: jest.fn(),
      getReactionsForCommitComment: jest.fn(),
      getPullRequestAuthors: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      getUserPermission: jest.fn()
    }

    mockConfig = {
      authorsCanReview: false,
      reviewerPermissions: ['write', 'admin']
    }

    reactionManager = new ReactionManager(mockGitHubClient, mockConfig)
  })

  test('createReaction creates a reaction successfully', async () => {
    mockGitHubClient.createReactionForCommitComment.mockResolvedValue({
      id: 1,
      content: '+1'
    })

    const reaction = await reactionManager.createReaction(123, '+1')
    expect(reaction).toEqual({
      id: 1,
      content: '+1'
    })

    expect(
      mockGitHubClient.createReactionForCommitComment
    ).toHaveBeenCalledWith(123, '+1')
  })

  test('deleteReaction deletes a reaction successfully', async () => {
    await reactionManager.deleteReaction(123, 456)

    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledWith(123, 456)
  })

  test('getReactions retrieves reactions successfully', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 2, content: '-1', user: { id: 102 } }
    ]
    mockGitHubClient.getReactionsForCommitComment.mockResolvedValue(
      mockReactions
    )

    const reactions = await reactionManager.getReactions(123)
    expect(reactions).toEqual(mockReactions)

    expect(mockGitHubClient.getReactionsForCommitComment).toHaveBeenCalledWith(
      123
    )
  })

  test('getReactionsByUser filters reactions by user', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 2, content: '-1', user: { id: 102 } },
      { id: 3, content: '+1', user: { id: 101 } }
    ]
    mockGitHubClient.getReactionsForCommitComment.mockResolvedValue(
      mockReactions
    )

    const userReactions = await reactionManager.getReactionsByUser(123, 101)
    expect(userReactions).toEqual([
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 3, content: '+1', user: { id: 101 } }
    ])

    expect(mockGitHubClient.getReactionsForCommitComment).toHaveBeenCalledWith(
      123
    )
  })

  test('removeReactionsByUser removes reactions for a specific user', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 2, content: '-1', user: { id: 102 } },
      { id: 3, content: '+1', user: { id: 101 } }
    ]
    mockGitHubClient.getReactionsForCommitComment.mockResolvedValue(
      mockReactions
    )

    await reactionManager.removeReactionsByUser(123, 101)

    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledTimes(2)
    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledWith(123, 1)
    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledWith(123, 3)
  })

  test('setReaction removes existing reactions and creates a new one', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 2, content: '-1', user: { id: 101 } }
    ]
    mockGitHubClient.getReactionsForCommitComment.mockResolvedValue(
      mockReactions
    )
    mockGitHubClient.createReactionForCommitComment.mockResolvedValue({
      id: 3,
      content: 'eyes'
    })

    await reactionManager.setReaction(123, 101, 'eyes')

    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledTimes(2)
    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledWith(123, 1)
    expect(
      mockGitHubClient.deleteReactionForCommitComment
    ).toHaveBeenCalledWith(123, 2)
    expect(
      mockGitHubClient.createReactionForCommitComment
    ).toHaveBeenCalledWith(123, 'eyes')
  })

  test('getEligibleReactions filters reactions based on permissions and authors', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101, login: 'user1' } },
      { id: 2, content: '-1', user: { id: 102, login: 'user2' } },
      { id: 3, content: '+1', user: { id: 103, login: 'user3' } },
      { id: 4, content: '+1', user: { id: 104, login: 'user4' } }
    ]
    mockGitHubClient.getReactionsForCommitComment.mockResolvedValue(
      mockReactions
    )
    mockGitHubClient.getPullRequestAuthors.mockReturnValue([101])
    mockGitHubClient.getAuthenticatedUser.mockResolvedValue({ id: 102 })
    mockGitHubClient.getUserPermission.mockImplementation(async username => {
      const permissions = {
        user1: 'admin',
        user2: 'write',
        user3: 'read',
        user4: 'admin'
      }
      return permissions[username]
    })

    const eligibleReactions = await reactionManager.getEligibleReactions(123)

    expect(eligibleReactions).toEqual([mockReactions[3]])

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring reaction :+1: by user1 (user is a commit author)'
      )
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring reaction :-1: by user2 (user is the token user)'
      )
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring reaction :+1: by user3 (user lacks required permissions)'
      )
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Found reaction :+1: by user4')
    )
  })
})
