const core = require('@actions/core')
const { PostProcess } = require('../src/post')

jest.mock('@actions/core')

describe('PostProcess', () => {
  let postProcess
  let mockGitHubClient
  let mockReactionManager

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {
      getAuthenticatedUser: jest.fn()
    }

    mockReactionManager = {
      setReaction: jest.fn(),
      reactions: {
        SUCCESS: 'rocket',
        FAILED: 'confused'
      }
    }

    postProcess = new PostProcess(mockGitHubClient, mockReactionManager)
  })

  describe('run', () => {
    beforeEach(() => {
      core.getState.mockImplementation(key => {
        const states = {
          'comment-id': 'test-comment-id',
          'approved-by': 'test-approver'
        }
        return states[key]
      })
      mockGitHubClient.getAuthenticatedUser.mockResolvedValue({
        id: 'test-user-id'
      })
    })

    test('creates success reaction when approval is successful', async () => {
      await postProcess.run()

      expect(mockGitHubClient.getAuthenticatedUser).toHaveBeenCalled()
      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockReactionManager.reactions.SUCCESS
      )
    })

    test('creates failed reaction when approval is not successful', async () => {
      core.getState.mockImplementation(key => {
        const states = {
          'comment-id': 'test-comment-id',
          'approved-by': ''
        }
        return states[key]
      })

      await postProcess.run()

      expect(mockGitHubClient.getAuthenticatedUser).toHaveBeenCalled()
      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockReactionManager.reactions.FAILED
      )
    })

    test('logs a warning when an error occurs', async () => {
      mockGitHubClient.getAuthenticatedUser.mockRejectedValue(
        new Error('Authentication failed')
      )

      await postProcess.run()

      expect(core.warning).toHaveBeenCalledWith(
        'Cleanup failed: Authentication failed'
      )
    })
  })
})
