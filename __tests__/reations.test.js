const core = require('@actions/core')
const { ReactionManager } = require('../src/reactions')

jest.mock('@actions/core')

describe('ReactionManager', () => {
  let reactionManager
  let mockGitHubClient

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {
      createReactionForIssueComment: jest.fn(),
      deleteReactionForIssueComment: jest.fn(),
      getReactionsForIssueComment: jest.fn(),
      getPullRequestAuthors: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      getUserPermission: jest.fn()
    }

    reactionManager = new ReactionManager(mockGitHubClient)
  })

  test('createReaction creates a reaction successfully', async () => {
    mockGitHubClient.createReactionForIssueComment.mockResolvedValue({
      id: 1,
      content: '+1'
    })

    const reaction = await reactionManager.createReaction(123, '+1')
    expect(reaction).toEqual({
      id: 1,
      content: '+1'
    })

    expect(mockGitHubClient.createReactionForIssueComment).toHaveBeenCalledWith(
      123,
      '+1'
    )
  })

  test('deleteReaction deletes a reaction successfully', async () => {
    await reactionManager.deleteReaction(123, 456)

    expect(mockGitHubClient.deleteReactionForIssueComment).toHaveBeenCalledWith(
      123,
      456
    )
  })

  test('getReactions retrieves reactions successfully', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101 } },
      { id: 2, content: '-1', user: { id: 102 } }
    ]
    mockGitHubClient.getReactionsForIssueComment.mockResolvedValue(
      mockReactions
    )

    const reactions = await reactionManager.getReactions(123)
    expect(reactions).toEqual(mockReactions)

    expect(mockGitHubClient.getReactionsForIssueComment).toHaveBeenCalledWith(
      123
    )
  })

  test('getEligibleReactions filters reactions based on permissions and authors', async () => {
    const mockReactions = [
      { id: 1, content: '+1', user: { id: 101, login: 'user1' } },
      { id: 2, content: '-1', user: { id: 102, login: 'user2' } },
      { id: 3, content: '+1', user: { id: 103, login: 'user3' } },
      { id: 4, content: '+1', user: { id: 104, login: 'user4' } }
    ]
    mockGitHubClient.getReactionsForIssueComment.mockResolvedValue(
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

    const eligibleReactions = await reactionManager.getEligibleReactions(
      123,
      ['write', 'admin'],
      false
    )

    expect(eligibleReactions).toEqual([mockReactions[1], mockReactions[3]])

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring reaction :+1: by user1 (user is a commit author)'
      )
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('Found reaction :-1: by user2')
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring reaction :+1: by user3 (user lacks required permissions)'
      )
    )
    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('Found reaction :+1: by user4')
    )
  })
})
