const core = require('@actions/core')
const github = require('@actions/github')
const { ApprovalAction } = require('../src/main')
const { CommitComment } = require('../src/comment')

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/comment')

describe('ApprovalAction', () => {
  let action
  const mockOctokit = {
    rest: {
      repos: {
        listCommentsForCommit: jest.fn(),
        createCommitComment: jest.fn(),
        getCollaboratorPermissionLevel: jest.fn()
      },
      reactions: {
        createForCommitComment: jest.fn(),
        deleteForCommitComment: jest.fn(),
        listForCommitComment: jest.fn()
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    github.getOctokit.mockReturnValue(mockOctokit)
    github.context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      payload: {
        pull_request: {
          head: { sha: 'test-sha' }
        }
      },
      actor: 'test-actor'
    }
    core.getInput.mockImplementation(name => {
      if (name === 'github-token') return 'test-token'
      if (name === 'check-interval') return '10'
      if (name === 'timeout-seconds') return '0'
      return ''
    })
    action = new ApprovalAction()
  })

  test('constructor sets up properties correctly', () => {
    expect(action.token).toBe('test-token')
    expect(action.checkInterval).toBe(10)
    expect(action.approveReaction).toBe('+1')
    expect(action.rejectReaction).toBe('-1')
    expect(action.waitReaction).toBe('eyes')
    expect(action.successReaction).toBe('rocket')
    expect(action.failedReaction).toBe('confused')
  })

  test('run method handles approval correctly', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: { id: 123 }
    })
    CommitComment.prototype.setReaction.mockResolvedValue({})
    CommitComment.prototype.getReactionsByPermissions.mockResolvedValue([
      { content: '+1', user: { login: 'approver' } }
    ])

    await action.run()

    expect(core.setOutput).toHaveBeenCalledWith('comment-id', 123)
    expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
    expect(CommitComment.prototype.setReaction).toHaveBeenCalledWith('eyes')
    expect(CommitComment.prototype.setReaction).toHaveBeenCalledWith('rocket')
  })

  test('run method handles rejection correctly', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: { id: 123 }
    })
    CommitComment.prototype.setReaction.mockResolvedValue({})
    CommitComment.prototype.getReactionsByPermissions.mockResolvedValue([
      { content: '-1', user: { login: 'rejector' } }
    ])

    await expect(action.run()).rejects.toThrow('Workflow rejected by rejector')

    expect(core.setOutput).toHaveBeenCalledWith('comment-id', 123)
    expect(core.setOutput).toHaveBeenCalledWith('rejected-by', 'rejector')
    expect(core.setFailed).toHaveBeenCalledWith('Workflow rejected by rejector')
    expect(CommitComment.prototype.setReaction).toHaveBeenCalledWith('eyes')
    expect(CommitComment.prototype.setReaction).toHaveBeenCalledWith('confused')
  })

  test('run method throws error when not in a pull request context', async () => {
    github.context.payload.pull_request = undefined

    await expect(action.run()).rejects.toThrow(
      'This action only works on pull requests.'
    )
  })

  test('findCommitComment finds existing comment', async () => {
    const mockComment = {
      id: 456,
      body: action.commentBody,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      user: { login: 'test-actor' }
    }
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({
      data: [mockComment]
    })

    const result = await action.findCommitComment('test-sha', 'test-actor')
    expect(result).toEqual(mockComment)
  })

  test('findCommitComment returns null when no matching comment found', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({
      data: []
    })

    const result = await action.findCommitComment('test-sha', 'test-actor')
    expect(result).toBeNull()
  })

  test('createCommitComment creates a new comment', async () => {
    const mockComment = { id: 789 }
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: mockComment
    })

    const result = await action.createCommitComment('test-sha')
    expect(result).toEqual(mockComment)
    expect(mockOctokit.rest.repos.createCommitComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      commit_sha: 'test-sha',
      body: action.commentBody
    })
  })

  test('createCommitComment throws error when comment creation fails', async () => {
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: {}
    })

    await expect(action.createCommitComment('test-sha')).rejects.toThrow(
      'Failed to create commit comment for approval.'
    )
  })

  test('waitForApproval handles timeout', async () => {
    jest.useFakeTimers()
    const mockComment = {
      getReactionsByPermissions: jest.fn().mockResolvedValue([])
    }

    // Set a 5 second timeout
    action.timeoutSeconds = 5

    const waitPromise = action.waitForApproval(mockComment, 1)

    // Function to advance time and run all timers
    const advanceTimeAndRunAllTimers = async () => {
      jest.advanceTimersByTime(1000) // Advance by 1 second
      jest.runAllTimers() // Run any timers that were queued
      await Promise.resolve() // Allow any pending promise callbacks to execute
    }

    // Advance time just past the timeout
    for (let i = 0; i <= 5; i++) {
      await advanceTimeAndRunAllTimers()
    }

    await expect(waitPromise).rejects.toThrow('Approval process timed out')

    expect(mockComment.getReactionsByPermissions).toHaveBeenCalledTimes(5)

    jest.useRealTimers()
  })
})
