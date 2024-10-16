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
          listCommits: jest.fn()
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

  test('throwOnContextMismatch throws an error when the context repo does not match the payload base repo', () => {
    gitHubClient.context.payload.pull_request.base.repo.owner.login =
      'otherOwner'
    expect(() => gitHubClient.throwOnContextMismatch()).toThrow(
      'Context repo does not match payload pull request base repo!'
    )
  })

  test('throwOnContextMismatch does not throw an error when the context repo matches the payload base repo', () => {
    expect(() => gitHubClient.throwOnContextMismatch()).not.toThrow()
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

  test('deleteStaleIssueComments deletes stale comments', async () => {
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

    await gitHubClient.deleteStaleIssueComments('Stale')
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
})
