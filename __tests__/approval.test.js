const core = require('@actions/core')
const { ApprovalProcess } = require('../src/approval')

jest.mock('@actions/core')

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
      createIssueComment: jest.fn(),
      deleteStaleIssueComments: jest.fn(),
      getWorkflowRunUrl: jest.fn()
    }

    mockReactionManager = {
      setReaction: jest.fn(),
      getEligibleReactions: jest.fn(),
      reactions: {
        APPROVE: '+1',
        REJECT: '-1',
        WAIT: 'eyes',
        SUCCESS: 'rocket',
        FAILED: 'confused'
      }
    }

    mockConfig = {
      commentFooters: ['Test comment footer'],
      commentHeaders: ['Test comment header'],
      pollInterval: 1,
      reviewerPermissions: ['write', 'admin']
    }

    approvalProcess = new ApprovalProcess(
      mockGitHubClient,
      mockReactionManager,
      mockConfig
    )
  })

  describe('run', () => {
    beforeEach(() => {
      mockGitHubClient.getWorkflowRunUrl.mockReturnValue('http://test-url.com')
      mockGitHubClient.getAuthenticatedUser.mockResolvedValue({
        id: 'test-user-id'
      })
      mockGitHubClient.createIssueComment.mockResolvedValue({
        id: 'test-comment-id',
        html_url: 'http://test-url.com'
      })
      approvalProcess.waitForApproval = jest.fn()
    })

    test('creates a new issue comment', async () => {
      await approvalProcess.run()

      const commentBody = [
        ...mockConfig.commentHeaders,
        'http://test-url.com',
        ...mockConfig.commentFooters
      ].join('\n\n')
      expect(mockGitHubClient.getWorkflowRunUrl).toHaveBeenCalled()
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        commentBody
      )
      expect(core.saveState).toHaveBeenCalledWith(
        'comment-id',
        'test-comment-id'
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'comment-id',
        'test-comment-id'
      )
      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockReactionManager.reactions.WAIT
      )
      // expect(mockGitHubClient.deleteStaleIssueComments).toHaveBeenCalledWith(
      //   mockConfig.commentHeader
      // )
    })

    test('creates success reaction when approval is successful', async () => {
      await approvalProcess.run()

      expect(mockReactionManager.setReaction).toHaveBeenCalledWith(
        'test-comment-id',
        'test-user-id',
        mockReactionManager.reactions.SUCCESS
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
        mockReactionManager.reactions.FAILED
      )
    })
  })

  describe('waitForApproval', () => {
    test('resolves when approved', async () => {
      mockReactionManager.getEligibleReactions.mockResolvedValue([
        { content: '+1', user: { login: 'approver' } }
      ])

      const waitPromise = approvalProcess.waitForApproval(
        'test-comment-id',
        'test-user-id'
      )
      await waitPromise

      expect(core.saveState).toHaveBeenCalledWith('approved-by', 'approver')
      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
      expect(core.info).toHaveBeenCalledWith('Workflow approved by approver')
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
      expect(core.saveState).toHaveBeenCalledWith('rejected-by', 'rejector')
      expect(core.setOutput).toHaveBeenCalledWith('rejected-by', 'rejector')
    }, 2000) // Set test timeout to 2 seconds

    test('continues checking until a decision is made', async () => {
      mockReactionManager.getEligibleReactions
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ content: '+1', user: { login: 'approver' } }])

      const waitPromise = approvalProcess.waitForApproval(
        'test-comment-id',
        'test-user-id',
        0.1,
        1
      ) // 1s timeout

      await waitPromise

      expect(mockReactionManager.getEligibleReactions).toHaveBeenCalledTimes(3)
      expect(core.saveState).toHaveBeenCalledWith('approved-by', 'approver')
      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
    }, 2000) // Set test timeout to 2 seconds
  })
})
