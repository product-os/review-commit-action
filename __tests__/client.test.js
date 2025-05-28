const core = require('@actions/core')
const { GitHubClient } = require('../src/client')

jest.mock('@actions/core')

describe('GitHubClient', () => {
  let gitHubClient
  let mockOctokit
  let mockContext

  beforeEach(() => {
    jest.clearAllMocks()

    mockOctokit = {
      graphql: jest.fn(),
      rest: {
        actions: {
          getWorkflowRun: jest.fn()
        },
        repos: {
          getCollaboratorPermissionLevel: jest.fn()
        },
        issues: {
          listComments: jest.fn(),
          createComment: jest.fn(),
          deleteComment: jest.fn()
        },
        reactions: {
          createForIssueComment: jest.fn(),
          deleteForIssueComment: jest.fn(),
          listForIssueComment: jest.fn()
        },
        pulls: {
          listCommits: jest.fn(),
          listReviews: jest.fn()
        }
      }
    }

    mockContext = {
      runId: 123,
      repo: {
        owner: 'testOwner',
        repo: 'testRepo'
      },
      payload: {
        pull_request: {
          base: {
            repo: {
              owner: { login: 'testOwner' },
              name: 'testRepo'
            }
          },
          head: { sha: 'testSha' },
          number: 1,
          commits: [
            { author: { id: 'author1' } },
            { author: { id: 'author2' } }
          ]
        }
      }
    }

    gitHubClient = new GitHubClient(mockOctokit, mockContext)
  })

  test('getWorkflowRunUrl returns the correct URL', async () => {
    mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
      data: { html_url: 'http://test.com/run' }
    })
    expect(await gitHubClient.getWorkflowRunUrl()).toBe('http://test.com/run')
  })

  test('getWOrkflowRunUrl throws an error when no run ID is found', async () => {
    gitHubClient.context.runId = null
    await expect(gitHubClient.getWorkflowRunUrl()).rejects.toThrow(
      'No run ID found in context!'
    )
  })

  test('getPullRequestAuthors returns the correct author IDs', async () => {
    const mockCommits = [
      {
        sha: 'testSha',
        author: { id: 'author1' }
      },
      {
        sha: 'testSha',
        author: { id: 'author2' }
      }
    ]
    mockOctokit.rest.pulls.listCommits.mockResolvedValue({
      data: mockCommits
    })

    const authors = await gitHubClient.getPullRequestAuthors()
    expect(authors).toEqual(['author1', 'author2'])
  })

  test('getAuthenticatedUser returns the correct user data', async () => {
    mockOctokit.graphql.mockResolvedValue({
      viewer: { databaseId: 123, login: 'testUser' }
    })

    const user = await gitHubClient.getAuthenticatedUser()
    expect(user).toEqual({ id: 123, login: 'testUser' })
    expect(mockOctokit.graphql).toHaveBeenCalledWith(expect.any(String))
  })

  test('createIssueComment creates a new comment', async () => {
    const mockComment = { id: 1, url: 'http://test.com/pr-comment' }
    mockOctokit.rest.issues.createComment.mockResolvedValue({
      data: mockComment
    })

    const comment = await gitHubClient.createIssueComment(
      'Test PR comment body'
    )
    expect(comment).toEqual(mockComment)
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1,
      body: 'Test PR comment body'
    })
  })

  test('createIssueComment throws an error when comment creation fails', async () => {
    mockOctokit.rest.issues.createComment.mockResolvedValue({ data: null })

    await expect(
      gitHubClient.createIssueComment('Test PR comment body')
    ).rejects.toThrow('Failed to create issue comment!')
  })

  test('listIssueComments returns all PR comments', async () => {
    const mockComments = [
      { id: 1, body: 'Comment 1' },
      { id: 2, body: 'Comment 2' }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })

    const comments = await gitHubClient.listIssueComments()
    expect(comments).toEqual(mockComments)
    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1
    })
  })

  test('findExistingComment returns existing comment when pattern matches', async () => {
    const mockComments = [
      {
        id: 1,
        body: 'Some other comment',
        user: { id: 'otherUserId' }
      },
      {
        id: 2,
        body: 'A repository maintainer needs to approve these workflow run(s).',
        user: { id: 'testUserId' }
      }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })
    gitHubClient.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ id: 'testUserId' })

    const existingComment = await gitHubClient.findExistingComment(
      'A repository maintainer needs to approve'
    )
    expect(existingComment).toEqual(mockComments[1])
  })

  test('findExistingComment returns null when no matching comment exists', async () => {
    const mockComments = [
      {
        id: 1,
        body: 'Some other comment',
        user: { id: 'testUserId' }
      }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })
    gitHubClient.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ id: 'testUserId' })

    const existingComment = await gitHubClient.findExistingComment(
      'A repository maintainer needs to approve'
    )
    expect(existingComment).toBeNull()
  })

  test('createIssueCommentIfNotExists creates new comment when none exists', async () => {
    const mockComment = { id: 1, url: 'http://test.com/comment' }
    mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })
    mockOctokit.rest.issues.createComment.mockResolvedValue({
      data: mockComment
    })
    gitHubClient.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ id: 'testUserId' })

    const comment = await gitHubClient.createIssueCommentIfNotExists(
      'Test comment body',
      'Test comment'
    )
    expect(comment).toEqual(mockComment)
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1,
      body: 'Test comment body'
    })
  })

  test('createIssueCommentIfNotExists returns existing comment when one exists', async () => {
    const existingComment = {
      id: 2,
      body: 'Test comment body',
      user: { id: 'testUserId' }
    }
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [existingComment]
    })
    gitHubClient.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ id: 'testUserId' })

    const comment = await gitHubClient.createIssueCommentIfNotExists(
      'Test comment body',
      'Test comment'
    )
    expect(comment).toEqual(existingComment)
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled()
  })

  test('getUserPermission returns the correct permission level', async () => {
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: 'write' }
    })

    const permission = await gitHubClient.getUserPermission('testUser')
    expect(permission).toBe('write')
    expect(
      mockOctokit.rest.repos.getCollaboratorPermissionLevel
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      username: 'testUser'
    })
  })

  test('createReactionForIssueComment creates a reaction', async () => {
    const mockReaction = { id: 1, content: '+1' }
    mockOctokit.rest.reactions.createForIssueComment.mockResolvedValue({
      data: mockReaction
    })

    const reaction = await gitHubClient.createReactionForIssueComment(123, '+1')
    expect(reaction).toEqual(mockReaction)
    expect(
      mockOctokit.rest.reactions.createForIssueComment
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 123,
      content: '+1'
    })
  })

  test('deleteReactionForIssueComment deletes a reaction', async () => {
    await gitHubClient.deleteReactionForIssueComment(123, 456)
    expect(
      mockOctokit.rest.reactions.deleteForIssueComment
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 123,
      reaction_id: 456
    })
  })

  test('getReactionsForIssueComment returns reactions', async () => {
    const mockReactions = [
      { id: 1, content: '+1' },
      { id: 2, content: '-1' }
    ]
    mockOctokit.rest.reactions.listForIssueComment.mockResolvedValue({
      data: mockReactions
    })

    const reactions = await gitHubClient.getReactionsForIssueComment(123)
    expect(reactions).toEqual(mockReactions)
    expect(mockOctokit.rest.reactions.listForIssueComment).toHaveBeenCalledWith(
      {
        owner: 'testOwner',
        repo: 'testRepo',
        comment_id: 123
      }
    )
  })

  // Tests for new review-based functionality
  describe('getCurrentCommitSha', () => {
    test('returns PR head SHA when in pull request context', () => {
      const sha = gitHubClient.getCurrentCommitSha()
      expect(sha).toBe('testSha')
    })

    test('returns context SHA when not in pull request context', () => {
      gitHubClient.context.payload.pull_request = null
      gitHubClient.context.sha = 'fallback-sha'
      const sha = gitHubClient.getCurrentCommitSha()
      expect(sha).toBe('fallback-sha')
    })
  })

  describe('getPullRequestReviews', () => {
    beforeEach(() => {
      mockOctokit.rest.pulls.listReviews = jest.fn()
    })

    test('returns all reviews for the pull request', async () => {
      const mockReviews = [
        { id: 1, state: 'APPROVED', user: { login: 'reviewer1' } },
        { id: 2, state: 'CHANGES_REQUESTED', user: { login: 'reviewer2' } }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })

      const reviews = await gitHubClient.getPullRequestReviews()
      expect(reviews).toEqual(mockReviews)
      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'testOwner',
        repo: 'testRepo',
        pull_number: 1
      })
    })
  })

  describe('getReviewsForCommit', () => {
    beforeEach(() => {
      mockOctokit.rest.pulls.listReviews = jest.fn()
    })

    test('returns reviews for specific commit SHA', async () => {
      const mockReviews = [
        { id: 1, commit_id: 'target-sha', state: 'APPROVED' },
        { id: 2, commit_id: 'other-sha', state: 'APPROVED' },
        { id: 3, commit_id: 'target-sha', state: 'CHANGES_REQUESTED' }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })

      const reviews = await gitHubClient.getReviewsForCommit('target-sha')
      expect(reviews).toHaveLength(2)
      expect(reviews[0].commit_id).toBe('target-sha')
      expect(reviews[1].commit_id).toBe('target-sha')
    })
  })

  describe('isApprovalReview', () => {
    test('returns true for APPROVED state', () => {
      const review = { state: 'APPROVED' }
      expect(gitHubClient.isApprovalReview(review)).toBe(true)
    })

    test('returns false for non-APPROVED states', () => {
      expect(
        gitHubClient.isApprovalReview({ state: 'CHANGES_REQUESTED' })
      ).toBe(false)
      expect(gitHubClient.isApprovalReview({ state: 'COMMENTED' })).toBe(false)
      expect(gitHubClient.isApprovalReview({ state: 'DISMISSED' })).toBe(false)
    })
  })

  describe('isDeployCommandReview', () => {
    test('returns true for review starting with /deploy command', () => {
      expect(gitHubClient.isDeployCommandReview({ body: '/deploy' })).toBe(true)
      expect(gitHubClient.isDeployCommandReview({ body: '/deploy now' })).toBe(
        true
      )
      expect(
        gitHubClient.isDeployCommandReview({ body: '/DEPLOY please' })
      ).toBe(true)
      expect(
        gitHubClient.isDeployCommandReview({ body: '/deploy this is good' })
      ).toBe(true)
      expect(
        gitHubClient.isDeployCommandReview({ body: '/deploy\nwith newline' })
      ).toBe(true)
      expect(gitHubClient.isDeployCommandReview({ body: '/Deploy' })).toBe(true)
    })

    test('returns true for /deploy with various spacing', () => {
      expect(gitHubClient.isDeployCommandReview({ body: '  /deploy  ' })).toBe(
        true
      )
      expect(gitHubClient.isDeployCommandReview({ body: '\t/deploy\t' })).toBe(
        true
      )
      expect(gitHubClient.isDeployCommandReview({ body: '\n/deploy\n' })).toBe(
        true
      )
    })

    test('returns false for /deploy not at start of comment', () => {
      expect(
        gitHubClient.isDeployCommandReview({ body: 'Please /deploy this' })
      ).toBe(false)
      expect(
        gitHubClient.isDeployCommandReview({ body: 'LGTM /deploy now' })
      ).toBe(false)
      expect(
        gitHubClient.isDeployCommandReview({ body: 'Can you /deploy please?' })
      ).toBe(false)
      expect(gitHubClient.isDeployCommandReview({ body: 'deploy this' })).toBe(
        false
      )
    })

    test('returns false for review without /deploy command', () => {
      expect(gitHubClient.isDeployCommandReview({ body: 'LGTM' })).toBe(false)
      expect(gitHubClient.isDeployCommandReview({ body: 'deploy this' })).toBe(
        false
      )
      expect(gitHubClient.isDeployCommandReview({ body: null })).toBe(false)
      expect(gitHubClient.isDeployCommandReview({ body: undefined })).toBe(
        false
      )
      expect(gitHubClient.isDeployCommandReview({ body: '' })).toBe(false)
      expect(gitHubClient.isDeployCommandReview({ body: '   ' })).toBe(false)
    })
  })

  describe('getEligibleReviewsForCommit', () => {
    beforeEach(() => {
      mockOctokit.rest.pulls.listReviews = jest.fn()
      // Mock listCommits for getPullRequestAuthors
      mockOctokit.rest.pulls.listCommits.mockResolvedValue({
        data: [{ author: { id: 'author1' }, committer: { id: 'author1' } }]
      })
    })

    test('returns eligible approval reviews', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'APPROVED',
          user: { id: 'reviewer1', login: 'reviewer1' },
          body: 'LGTM'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })
      mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
        data: { permission: 'write' }
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit('test-sha')
      expect(reviews).toHaveLength(1)
      expect(reviews[0].reviewType).toBe('approval')
    })

    test('returns eligible deploy command reviews', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'COMMENTED',
          user: { id: 'reviewer1', login: 'reviewer1' },
          body: '/deploy now'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })
      mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
        data: { permission: 'admin' }
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit('test-sha')
      expect(reviews).toHaveLength(1)
      expect(reviews[0].reviewType).toBe('comment')
    })

    test('excludes reviews from PR authors when allowAuthors is false', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'APPROVED',
          user: { id: 'author1', login: 'author1' },
          body: 'LGTM'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit(
        'test-sha',
        ['write', 'admin'],
        false
      )
      expect(reviews).toHaveLength(0)
    })

    test('includes reviews from PR authors when allowAuthors is true', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'APPROVED',
          user: { id: 'author1', login: 'author1' },
          body: 'LGTM'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })
      mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
        data: { permission: 'write' }
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit(
        'test-sha',
        ['write', 'admin'],
        true
      )
      expect(reviews).toHaveLength(1)
    })

    test('excludes reviews from users with insufficient permissions', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'APPROVED',
          user: { id: 'reviewer1', login: 'reviewer1' },
          body: 'LGTM'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })
      mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
        data: { permission: 'read' }
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit('test-sha')
      expect(reviews).toHaveLength(0)
    })

    test('excludes reviews that are neither approved nor deploy commands', async () => {
      const mockReviews = [
        {
          id: 1,
          commit_id: 'test-sha',
          state: 'CHANGES_REQUESTED',
          user: { id: 'reviewer1', login: 'reviewer1' },
          body: 'Please fix this'
        },
        {
          id: 2,
          commit_id: 'test-sha',
          state: 'COMMENTED',
          user: { id: 'reviewer2', login: 'reviewer2' },
          body: 'Just a comment'
        }
      ]
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: mockReviews
      })
      mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
        data: { permission: 'write' }
      })

      const reviews = await gitHubClient.getEligibleReviewsForCommit('test-sha')
      expect(reviews).toHaveLength(0)
    })
  })
})
