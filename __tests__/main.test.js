const core = require('@actions/core')
const github = require('@actions/github')
const { ApprovalAction } = require('../src/main')

jest.mock('@actions/core')
jest.mock('@actions/github')

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
      }
    }
    action = new ApprovalAction()
  })

  test('constructor sets up properties correctly', () => {
    expect(action.checkInterval).toBe(10)
    expect(action.approveReaction).toBe('+1')
    expect(action.rejectReaction).toBe('-1')
  })

  test('run method handles approval correctly', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: { id: 123 }
    })
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: { id: 456 }
    })
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: [{ content: '+1', user: { login: 'approver' } }]
    })
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: 'write' }
    })

    await action.run()

    expect(core.setOutput).toHaveBeenCalledWith('comment-id', 123)
    expect(core.setOutput).toHaveBeenCalledWith('approved-by', 'approver')
  })

  test('run method handles rejection correctly', async () => {
    mockOctokit.rest.repos.listCommentsForCommit.mockResolvedValue({ data: [] })
    mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
      data: { id: 123 }
    })
    mockOctokit.rest.reactions.createForCommitComment.mockResolvedValue({
      data: { id: 456 }
    })
    mockOctokit.rest.reactions.listForCommitComment.mockResolvedValue({
      data: [{ content: '-1', user: { login: 'rejector' } }]
    })
    mockOctokit.rest.repos.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: 'write' }
    })

    await expect(action.run()).rejects.toThrow('Workflow rejected by rejector')

    expect(core.setOutput).toHaveBeenCalledWith('comment-id', 123)
    expect(core.setOutput).toHaveBeenCalledWith('rejected-by', 'rejector')
    expect(core.setFailed).toHaveBeenCalledWith('Workflow rejected by rejector')
  })

  // Add more tests for other methods like findCommitComment, createCommitComment, etc.
})
