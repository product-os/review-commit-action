const core = require('@actions/core')
const { ApprovalProcess } = require('../src/approval')

jest.mock('@actions/core')

describe('ApprovalProcess', () => {
  let approvalProcess
  let mockGitHubClient
  let mockConfig

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {
      getCurrentCommitSha: jest.fn(),
      getWorkflowRunUrl: jest.fn(),
      createIssueCommentIfNotExists: jest.fn(),
      getEligibleReviewsForCommit: jest.fn()
    }

    mockConfig = {
      reviewerPermissions: ['write', 'admin'],
      authorsCanReview: false
    }

    approvalProcess = new ApprovalProcess(mockGitHubClient, mockConfig)
  })

  describe('run', () => {
    beforeEach(() => {
      mockGitHubClient.getCurrentCommitSha.mockReturnValue('test-commit-sha')
      mockGitHubClient.getWorkflowRunUrl.mockResolvedValue(
        'http://test-url.com'
      )
      mockGitHubClient.createIssueCommentIfNotExists.mockResolvedValue({
        id: 'test-comment-id',
        html_url: 'http://test-comment-url.com'
      })
    })

    test('creates instructional comment with correct content', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([
        {
          id: 1,
          user: { login: 'reviewer1' },
          reviewType: 'approval'
        }
      ])

      await approvalProcess.run()

      expect(
        mockGitHubClient.createIssueCommentIfNotExists
      ).toHaveBeenCalledWith(
        expect.stringContaining(
          'A repository maintainer needs to approve these workflow run(s).'
        ),
        expect.stringContaining(
          'A repository maintainer needs to approve these workflow run(s).'
        )
      )
      expect(
        mockGitHubClient.createIssueCommentIfNotExists
      ).toHaveBeenCalledWith(
        expect.stringContaining('Submit an approval review'),
        expect.stringContaining(
          'A repository maintainer needs to approve these workflow run(s).'
        )
      )
      expect(
        mockGitHubClient.createIssueCommentIfNotExists
      ).toHaveBeenCalledWith(
        expect.stringContaining('/deploy'),
        expect.stringContaining(
          'A repository maintainer needs to approve these workflow run(s).'
        )
      )
    })

    test('succeeds when approval review is found', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([
        {
          id: 123,
          user: { login: 'reviewer1' },
          reviewType: 'approval'
        }
      ])

      await approvalProcess.run()

      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'reviewer1')
      expect(core.setOutput).toHaveBeenCalledWith('review-id', 123)
      expect(core.setOutput).toHaveBeenCalledWith('review-type', 'approval')
      expect(core.info).toHaveBeenCalledWith(
        'Workflow approved by reviewer1 via approval review'
      )
    })

    test('succeeds when deploy command review is found', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([
        {
          id: 456,
          user: { login: 'reviewer2' },
          reviewType: 'comment'
        }
      ])

      await approvalProcess.run()

      expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'reviewer2')
      expect(core.setOutput).toHaveBeenCalledWith('review-id', 456)
      expect(core.setOutput).toHaveBeenCalledWith('review-type', 'comment')
      expect(core.info).toHaveBeenCalledWith(
        'Workflow approved by reviewer2 via comment review'
      )
    })

    test('fails when no eligible reviews are found', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([])

      await expect(approvalProcess.run()).rejects.toThrow(
        'No eligible approval found for commit test-commit-sha'
      )
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('No eligible approval found')
      )
    })

    test('calls getEligibleReviewsForCommit with correct parameters', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([])

      try {
        await approvalProcess.run()
      } catch (error) {
        // Expected to fail
      }

      expect(mockGitHubClient.getEligibleReviewsForCommit).toHaveBeenCalledWith(
        'test-commit-sha',
        ['write', 'admin'],
        false
      )
    })

    test('respects authorsCanReview config', async () => {
      mockConfig.authorsCanReview = true
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([])

      try {
        await approvalProcess.run()
      } catch (error) {
        // Expected to fail
      }

      expect(mockGitHubClient.getEligibleReviewsForCommit).toHaveBeenCalledWith(
        'test-commit-sha',
        ['write', 'admin'],
        true
      )
    })
  })

  describe('checkForApproval', () => {
    test('returns null when no eligible reviews found', async () => {
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue([])

      const result = await approvalProcess.checkForApproval(
        'test-sha',
        ['write', 'admin'],
        false
      )

      expect(result).toBeNull()
      expect(core.info).toHaveBeenCalledWith(
        'No eligible approval reviews found'
      )
    })

    test('returns first eligible review when multiple found', async () => {
      const mockReviews = [
        {
          id: 1,
          user: { login: 'reviewer1' },
          reviewType: 'approval'
        },
        {
          id: 2,
          user: { login: 'reviewer2' },
          reviewType: 'comment'
        }
      ]
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue(
        mockReviews
      )

      const result = await approvalProcess.checkForApproval(
        'test-sha',
        ['write', 'admin'],
        false
      )

      expect(result).toEqual({
        approvedBy: 'reviewer1',
        reviewId: 1,
        reviewType: 'approval'
      })
    })

    test('returns comment review when found', async () => {
      const mockReviews = [
        {
          id: 3,
          user: { login: 'deployer' },
          reviewType: 'comment'
        }
      ]
      mockGitHubClient.getEligibleReviewsForCommit.mockResolvedValue(
        mockReviews
      )

      const result = await approvalProcess.checkForApproval(
        'test-sha',
        ['write', 'admin'],
        false
      )

      expect(result).toEqual({
        approvedBy: 'deployer',
        reviewId: 3,
        reviewType: 'comment'
      })
    })
  })
})
