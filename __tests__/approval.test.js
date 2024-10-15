const core = require('@actions/core')
const { ApprovalProcess } = require('../src/approval')
const Logger = require('../src/logger')

jest.mock('@actions/core')
jest.mock('../src/logger')

describe('ApprovalProcess', () => {
  let approvalProcess
  let mockGitHubClient
  let mockReactionManager
  let mockConfig

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {
      getPullRequestHeadSha: jest.fn(),
      getPullRequestMergeRef: jest.fn(),
      getRefSha: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      getPullRequestRepository: jest.fn(),
      findCommitComment: jest.fn(),
      createCommitComment: jest.fn(),
      deleteStalePullRequestComments: jest.fn(),
      createPullRequestComment: jest.fn()
    }

    mockReactionManager = {
      setReaction: jest.fn(),
      getEligibleReactions: jest.fn()
    }

    mockConfig = {
      commentFooter: 'Test comment footer',
      waitReaction: 'eyes',
      commentHeader: 'Test comment header',
      checkInterval: 1,
      reviewerPermissions: ['write', 'admin'],
      rejectReaction: '-1',
      approveReaction: '+1',
      successReaction: 'rocket',
      failedReaction: 'confused'
    }

    approvalProcess = new ApprovalProcess(
      mockGitHubClient,
      mockReactionManager,
      mockConfig
    )
  })

  describe('run', () => {
    beforeEach(() => {
      mockGitHubClient.getPullRequestHeadSha.mockReturnValue('test-sha')
      mockGitHubClient.getPullRequestMergeRef.mockReturnValue('pull/1/merge')
      mockGitHubClient.getRefSha.mockResolvedValue('test-sha')
      mockGitHubClient.getAuthenticatedUser.mockResolvedValue({
        id: 'test-user-id'
      })
      mockGitHubClient.getPullRequestRepository.mockReturnValue(null)
      mockGitHubClient.findCommitComment.mockResolvedValue(null)
      mockGitHubClient.createCommitComment.mockResolvedValue({
        id: 'test-comment-id',
        html_url: 'http://test-url.com'
      })
      approvalProcess.waitForApproval = jest.fn()
    })

    test('creates a new comment when no existing comment is found', async () => {
      await approvalProcess.run()

      const commentBody = [
        mockConfig.commentHeader,
        mockConfig.commentFooter
      ].join('\n\n')
      expect(mockGitHubClient.findCommitComment).toHaveBeenCalledWith(
        'test-sha',
        'test-user-id',
        commentBody
      )
      expect(mockGitHubClient.createCommitComment).toHaveBeenCalledWith(
        'test-sha',
        commentBody
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'comment-id',
        'test-comment-id'
      )
      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockConfig.waitReaction
      )
      expect(
        mockGitHubClient.deleteStalePullRequestComments
      ).toHaveBeenCalledWith(mockConfig.commentHeader)
      expect(mockGitHubClient.createPullRequestComment).toHaveBeenCalledWith(
        expect.stringContaining(mockConfig.commentHeader)
      )
    })

    test('uses existing comment when found', async () => {
      const existingComment = {
        id: 'existing-comment-id',
        html_url: 'http://existing-url.com'
      }
      mockGitHubClient.findCommitComment.mockResolvedValue(existingComment)

      await approvalProcess.run()

      expect(mockGitHubClient.createCommitComment).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith(
        'comment-id',
        'existing-comment-id'
      )
      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'existing-comment-id',
        'test-user-id',
        mockConfig.waitReaction
      )
    })

    test('creates success reaction when approval is successful', async () => {
      await approvalProcess.run()

      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockConfig.successReaction
      )
    })

    test('creates failed reaction when approval fails', async () => {
      approvalProcess.waitForApproval.mockRejectedValue(
        new Error('Approval failed')
      )

      await expect(approvalProcess.run()).rejects.toThrow('Approval failed')

      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockConfig.failedReaction
      )
    })
  })

  describe('waitForApproval', () => {
    test('throws an error when timeout is reached', async () => {
      mockReactionManager.getEligibleReactions.mockResolvedValue([])

      const waitPromise = approvalProcess.waitForApproval(
        'test-comment-id',
        0.1,
        0.3
      ) // 300ms timeout

      await expect(waitPromise).rejects.toThrow('Approval process timed out')
      expect(mockReactionManager.getEligibleReactions).toHaveBeenCalledTimes(3)
    }, 1000) // Set test timeout to 1 second

    test('resolves when approved', async () => {
      mockReactionManager.getEligibleReactions.mockResolvedValue([
        { content: '+1', user: { login: 'approver' } }
      ])

      const waitPromise = approvalProcess.waitForApproval('test-comment-id')
      await waitPromise

      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
      expect(Logger.info).toHaveBeenCalledWith('Workflow approved by approver')
    })

    test('throws an error when rejected', async () => {
      mockReactionManager.getEligibleReactions
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ content: '-1', user: { login: 'rejector' } }])

      const waitPromise = approvalProcess.waitForApproval(
        'test-comment-id',
        0.1,
        1
      ) // 1s timeout

      await expect(waitPromise).rejects.toThrow('Workflow rejected by rejector')
      expect(mockReactionManager.getEligibleReactions).toHaveBeenCalledTimes(2)
      expect(core.setOutput).toHaveBeenCalledWith('rejected-by', 'rejector')
    }, 2000) // Set test timeout to 2 seconds

    test('continues checking until a decision is made', async () => {
      mockReactionManager.getEligibleReactions
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ content: '+1', user: { login: 'approver' } }])

      const waitPromise = approvalProcess.waitForApproval(
        'test-comment-id',
        0.1,
        1
      ) // 1s timeout

      await waitPromise

      expect(mockReactionManager.getEligibleReactions).toHaveBeenCalledTimes(3)
      expect(Logger.debug).toHaveBeenCalledWith('Waiting for reactions...')
      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
    }, 2000) // Set test timeout to 2 seconds
  })
})
