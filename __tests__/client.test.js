const { GitHubClient } = require('../src/client')
const Logger = require('../src/logger')

jest.mock('@actions/core')
jest.mock('../src/logger')

describe('GitHubClient', () => {
  let gitHubClient
  let mockOctokit
  let mockContext

  beforeEach(() => {
    jest.clearAllMocks()

    mockOctokit = {
      graphql: jest.fn(),
      rest: {
        repos: {
          listCommentsForCommit: jest.fn(),
          createCommitComment: jest.fn(),
          getCollaboratorPermissionLevel: jest.fn()
        },
        issues: {
          listComments: jest.fn(),
          createComment: jest.fn(),
          deleteComment: jest.fn()
        },
        reactions: {
          createForCommitComment: jest.fn(),
          deleteForCommitComment: jest.fn(),
          listForCommitComment: jest.fn()
        },
        pulls: {
          listCommits: jest.fn()
        }
      }
    }

    mockContext = {
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

  test('getPullRequestHeadSha returns the correct SHA', () => {
    expect(gitHubClient.getPullRequestHeadSha()).toBe('testSha')
  })

  test('getPullRequestMergeRef returns the correct ref', () => {
    expect(gitHubClient.getPullRequestMergeRef()).toBe('pull/1/merge')
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

  test('findCommitComment finds an existing comment', async () => {
    const mockComments = [
      {
        id: 1,
        body: 'Test comment',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        user: { id: 'testUserId' }
      },
      {
        id: 2,
        body: 'Another comment',
        created_at: '2023-01-02',
        updated_at: '2023-01-03',
        user: { id: 'testUserId' }
      }
    ]
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({
      data: mockComments
    })

    const comment = await gitHubClient.findCommitComment(
      'testSha',
      'testUserId',
      'Test comment'
    )
    expect(comment).toEqual(mockComments[0])
    expect(mockOctokit.rest.repos.listCommentsForCommit).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      commit_sha: 'testSha'
    })
  })

  test('findCommitComment returns null when no matching comment is found', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })

    const comment = await gitHubClient.findCommitComment(
      'testSha',
      'testUserId',
      'Non-existent comment'
    )
    expect(comment).toBeNull()
    expect(Logger.info).toHaveBeenCalledWith(
      'No matching commit comment found.'
    )
  })

  test('createCommitComment creates a new comment', async () => {
    const mockComment = { id: 1, html_url: 'http://test.com/comment' }
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: mockComment
    })

    const comment = await gitHubClient.createCommitComment(
      'testSha',
      'Test comment body'
    )
    expect(comment).toEqual(mockComment)
    expect(mockOctokit.rest.repos.createCommitComment).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      commit_sha: 'testSha',
      body: 'Test comment body'
    })
    expect(Logger.info).toHaveBeenCalledWith(
      `Created new commit comment: ${mockComment.url}`
    )
  })

  test('createCommitComment throws an error when comment creation fails', async () => {
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({ data: null })

    await expect(
      gitHubClient.createCommitComment('testSha', 'Test comment body')
    ).rejects.toThrow('Failed to create commit comment for approval.')
  })

  test('findPrComment finds an existing PR comment', async () => {
    const mockComments = [
      {
        id: 1,
        body: 'Test PR comment',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        user: { id: 'testUserId' }
      },
      {
        id: 2,
        body: 'Another PR comment',
        created_at: '2023-01-02',
        updated_at: '2023-01-03',
        user: { id: 'testUserId' }
      }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })

    const comment = await gitHubClient.findPrComment(
      'testUserId',
      'Test PR comment'
    )
    expect(comment).toEqual(mockComments[0])
    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1
    })
  })

  test('findPrComment returns null when no matching PR comment is found', async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] })

    const comment = await gitHubClient.findPrComment(
      'testUserId',
      'Non-existent PR comment'
    )
    expect(comment).toBeNull()
    expect(Logger.info).toHaveBeenCalledWith('No matching PR comment found.')
  })

  test('createPullRequestComment creates a new PR comment', async () => {
    const mockComment = { id: 1, html_url: 'http://test.com/pr-comment' }
    mockOctokit.rest.issues.createComment.mockResolvedValue({
      data: mockComment
    })

    const comment = await gitHubClient.createPullRequestComment(
      'Test PR comment body'
    )
    expect(comment).toEqual(mockComment)
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1,
      body: 'Test PR comment body'
    })
    expect(Logger.info).toHaveBeenCalledWith(
      `Created new PR comment: ${mockComment.url}`
    )
  })

  test('createPullRequestComment throws an error when comment creation fails', async () => {
    mockOctokit.rest.issues.createComment.mockResolvedValue({ data: null })

    await expect(
      gitHubClient.createPullRequestComment('Test PR comment body')
    ).rejects.toThrow('Failed to create PR comment for approval.')
  })

  test('listPullRequestComments returns all PR comments', async () => {
    const mockComments = [
      { id: 1, body: 'Comment 1' },
      { id: 2, body: 'Comment 2' }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })

    const comments = await gitHubClient.listPullRequestComments()
    expect(comments).toEqual(mockComments)
    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      issue_number: 1
    })
  })

  test('deleteStalePullRequestComments deletes stale comments', async () => {
    const mockComments = [
      {
        id: 1,
        body: 'Stale comment',
        user: { id: 'testUserId' },
        created_at: '2023-01-01',
        updated_at: '2023-01-01'
      },
      {
        id: 2,
        body: 'Fresh comment',
        user: { id: 'testUserId' },
        created_at: '2023-01-02',
        updated_at: '2023-01-03'
      }
    ]
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: mockComments
    })
    gitHubClient.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ id: 'testUserId' })

    await gitHubClient.deleteStalePullRequestComments('Stale')
    expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 1
    })
    expect(mockOctokit.rest.issues.deleteComment).toHaveBeenCalledTimes(1)
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

  test('createReactionForCommitComment creates a reaction', async () => {
    const mockReaction = { id: 1, content: '+1' }
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: mockReaction
    })

    const reaction = await gitHubClient.createReactionForCommitComment(
      123,
      '+1'
    )
    expect(reaction).toEqual(mockReaction)
    expect(
      mockOctokit.rest.reactions.createForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 123,
      content: '+1'
    })
  })

  test('deleteReactionForCommitComment deletes a reaction', async () => {
    await gitHubClient.deleteReactionForCommitComment(123, 456)
    expect(
      mockOctokit.rest.reactions.deleteForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 123,
      reaction_id: 456
    })
  })

  test('getReactionsForCommitComment returns reactions', async () => {
    const mockReactions = [
      { id: 1, content: '+1' },
      { id: 2, content: '-1' }
    ]
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: mockReactions
    })

    const reactions = await gitHubClient.getReactionsForCommitComment(123)
    expect(reactions).toEqual(mockReactions)
    expect(
      mockOctokit.rest.reactions.listForCommitComment
    ).toHaveBeenCalledWith({
      owner: 'testOwner',
      repo: 'testRepo',
      comment_id: 123
    })
  })
})
