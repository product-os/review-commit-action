const { ApprovalAction } = require('../src/main')
const core = require('@actions/core')
const github = require('@actions/github')
const { CommitComment } = require('../src/comment')

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/comment')

describe('ApprovalAction', () => {
  let action
  let mockOctokit

  beforeEach(() => {
    jest.clearAllMocks()
    core.getInput.mockImplementation(name => {
      if (name === 'github-token') return 'mock-token'
      if (name === 'check-interval') return '10'
      if (name === 'timeout-seconds') return '300'
      return ''
    })
    mockOctokit = {
      rest: {
        repos: {
          listCommentsForCommit: jest.fn(),
          createCommitComment: jest.fn(),
          getCollaboratorPermissionLevel: jest.fn()
        },
        reactions: {
          createForCommitComment: jest.fn(),
          deleteForCommitComment: jest.fn()
        }
      },
      graphql: jest.fn()
    }
    github.getOctokit.mockReturnValue(mockOctokit)
    github.context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      payload: { pull_request: { head: { sha: 'test-sha' } } }
    }
    action = new ApprovalAction()
  })

  test('constructor initializes properties correctly', () => {
    expect(action.token).toBe('mock-token')
    expect(action.checkInterval).toBe(10)
    expect(action.timeoutSeconds).toBe(300)
    expect(action.approveReaction).toBe('+1')
    expect(action.rejectReaction).toBe('-1')
    expect(action.waitReaction).toBe('eyes')
    expect(action.successReaction).toBe('rocket')
    expect(action.failedReaction).toBe('confused')
  })

  test('getAuthenticatedUser returns viewer data', async () => {
    const mockViewer = { databaseId: 123, login: 'test-user' }
    mockOctokit.graphql.mockResolvedValue({ viewer: mockViewer })

    const result = await action.getAuthenticatedUser()
    expect(result).toEqual(mockViewer)
  })

  test('getAuthenticatedUser throws error on failure', async () => {
    mockOctokit.graphql.mockRejectedValue(new Error('API error'))

    await expect(action.getAuthenticatedUser()).rejects.toThrow('API error')
    expect(core.error).toHaveBeenCalledWith(
      'Failed to get authenticated user: API error'
    )
  })

  test('findCommitComment returns matching comment', async () => {
    const mockComments = [
      {
        id: 1,
        body: action.commentBody,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        user: { id: 123 }
      }
    ]
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({
      data: mockComments
    })

    const result = await action.findCommitComment('test-sha', 123)
    expect(result).toEqual(mockComments[0])
  })

  test('findCommitComment returns null when no matching comment', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })

    const result = await action.findCommitComment('test-sha', 123)
    expect(result).toBeNull()
  })

  test('createCommitComment creates new comment', async () => {
    const mockComment = { id: 2, body: action.commentBody }
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: mockComment
    })

    const result = await action.createCommitComment('test-sha')
    expect(result).toEqual(mockComment)
  })

  test('createCommitComment throws error when comment creation fails', async () => {
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({ data: {} })

    await expect(action.createCommitComment('test-sha')).rejects.toThrow(
      'Failed to create commit comment for approval.'
    )
  })

  test('waitForApproval resolves on approval', async () => {
    const mockReactions = [{ content: '+1', user: { login: 'approver' } }]
    action.getReactionsByPermissions = jest
      .fn()
      .mockResolvedValue(mockReactions)
    action.commitComment = new CommitComment()

    await expect(action.waitForApproval(1)).resolves.not.toThrow()
    expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
  })

  test('waitForApproval throws on rejection', async () => {
    const mockReactions = [{ content: '-1', user: { login: 'rejector' } }]
    action.getReactionsByPermissions = jest
      .fn()
      .mockResolvedValue(mockReactions)
    action.commitComment = new CommitComment()

    await expect(action.waitForApproval(1)).rejects.toThrow(
      'Workflow rejected by rejector'
    )
    expect(core.setOutput).toHaveBeenCalledWith('rejected-by', 'rejector')
  })

  test('waitForApproval times out', async () => {
    action.timeoutSeconds = 1
    action.getReactionsByPermissions = jest.fn().mockResolvedValue([])
    action.commitComment = new CommitComment()

    await expect(action.waitForApproval(0.5)).rejects.toThrow(
      'Approval process timed out'
    )
  })

  test('getUserPermission returns correct permission', async () => {
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: 'write' }
    })

    const result = await action.getUserPermission('test-user')
    expect(result).toBe('write')
  })

  test('getReactionsByPermissions filters reactions correctly', async () => {
    const mockReactions = [
      { content: '+1', user: { login: 'admin-user' } },
      { content: '-1', user: { login: 'write-user' } },
      { content: 'eyes', user: { login: 'read-user' } }
    ]
    action.commitComment = {
      getReactions: jest.fn().mockResolvedValue(mockReactions)
    }
    action.getUserPermission = jest
      .fn()
      .mockResolvedValueOnce('admin')
      .mockResolvedValueOnce('write')
      .mockResolvedValueOnce('read')

    const result = await action.getReactionsByPermissions(['write', 'admin'])
    expect(result).toEqual([mockReactions[0], mockReactions[1]])
  })

  test('getReactionsByUser filters reactions by user', async () => {
    const mockReactions = [
      { user: { id: 123 }, content: '+1' },
      { user: { id: 456 }, content: '-1' },
      { user: { id: 123 }, content: 'eyes' }
    ]
    action.commitComment = {
      getReactions: jest.fn().mockResolvedValue(mockReactions)
    }

    const result = await action.getReactionsByUser(123)
    expect(result).toEqual([mockReactions[0], mockReactions[2]])
  })

  test('removeReactionsByUser removes reactions for a user', async () => {
    const mockReactions = [
      { id: 1, user: { id: 123 }, content: '+1' },
      { id: 2, user: { id: 123 }, content: 'eyes' }
    ]
    action.getReactionsByUser = jest.fn().mockResolvedValue(mockReactions)
    action.commitComment = {
      deleteReaction: jest.fn()
    }

    await action.removeReactionsByUser(123)
    expect(action.commitComment.deleteReaction).toHaveBeenCalledTimes(2)
    expect(action.commitComment.deleteReaction).toHaveBeenCalledWith(1)
    expect(action.commitComment.deleteReaction).toHaveBeenCalledWith(2)
  })

  test('setReaction sets a reaction and removes others', async () => {
    action.tokenUser = { databaseId: 123 }
    action.removeReactionsByUser = jest.fn()
    action.commitComment = {
      createReaction: jest.fn()
    }

    await action.setReaction('rocket')
    expect(action.removeReactionsByUser).toHaveBeenCalledWith(123)
    expect(action.commitComment.createReaction).toHaveBeenCalledWith('rocket')
  })

  test('run executes the entire workflow', async () => {
    const mockComment = { id: 1 }
    action.getAuthenticatedUser = jest
      .fn()
      .mockResolvedValue({ databaseId: 123, login: 'test-user' })
    action.findCommitComment = jest.fn().mockResolvedValue(null)
    action.createCommitComment = jest.fn().mockResolvedValue(mockComment)
    action.setReaction = jest.fn()
    action.waitForApproval = jest.fn()

    await action.run()

    expect(action.getAuthenticatedUser).toHaveBeenCalled()
    expect(action.findCommitComment).toHaveBeenCalled()
    expect(action.createCommitComment).toHaveBeenCalled()
    expect(action.setReaction).toHaveBeenCalledWith('eyes')
    expect(action.waitForApproval).toHaveBeenCalled()
    expect(action.setReaction).toHaveBeenCalledWith('rocket')
  })

  test('run handles errors and sets failed reaction', async () => {
    action.getAuthenticatedUser = jest
      .fn()
      .mockRejectedValue(new Error('Test error'))
    action.setReaction = jest.fn()

    await expect(action.run()).rejects.toThrow('Test error')
    expect(action.setReaction).toHaveBeenCalledWith('confused')
    expect(core.setFailed).toHaveBeenCalledWith('Test error')
  })
})
