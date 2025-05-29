const core = require('@actions/core')
const github = require('@actions/github')
const { GitHubClient } = require('../src/client')
const { ApprovalProcess } = require('../src/approval')
const { PostProcess } = require('../src/post')

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/client')
jest.mock('../src/approval')
jest.mock('../src/post')

describe('index.js', () => {
  let run

  beforeEach(() => {
    jest.clearAllMocks()
    run = require('../src/index').run
  })

  test('run executes the approval process successfully', async () => {
    // Mock input values
    core.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'mock-token'
      }
      return inputs[name]
    })

    core.getBooleanInput.mockImplementation(name => {
      const inputs = {
        'allow-authors': false
      }
      return inputs[name]
    })

    // Mock GitHub client
    const mockOctokit = {}
    github.getOctokit.mockReturnValue(mockOctokit)

    // Mock ApprovalProcess run method
    ApprovalProcess.mockImplementation(() => ({
      run: jest.fn().mockResolvedValue(undefined)
    }))

    await run()

    // Verify that the GitHub client was created
    expect(github.getOctokit).toHaveBeenCalledWith('mock-token')
    expect(GitHubClient).toHaveBeenCalledWith(mockOctokit, github.context)

    // Verify that ApprovalProcess was created with correct config
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.objectContaining({
        token: 'mock-token',
        authorsCanReview: false,
        reviewerPermissions: ['write', 'admin']
      })
    )

    // Verify that the approval process was run
    expect(ApprovalProcess.mock.instances[0].run).toHaveBeenCalled()

    // Verify that no error was set
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  test('run handles errors and sets action as failed', async () => {
    const mockError = new Error('Test error')

    // Mock ApprovalProcess to throw an error
    ApprovalProcess.mockImplementation(() => ({
      run: jest.fn().mockRejectedValue(mockError)
    }))

    await run()

    // Verify that the error was handled and the action was set as failed
    expect(core.setFailed).toHaveBeenCalledWith('Test error')
  })

  test('run uses default values when inputs are not provided', async () => {
    // Mock input values with defaults
    core.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'default-token'
      }
      return inputs[name]
    })

    core.getBooleanInput.mockImplementation(name => {
      const inputs = {
        'allow-authors': false
      }
      return inputs[name]
    })

    await run()

    // Verify that ApprovalProcess was created with default config values
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.objectContaining({
        token: 'default-token',
        authorsCanReview: false,
        reviewerPermissions: ['write', 'admin']
      })
    )
  })

  test('run handles boolean input values correctly', async () => {
    // Mock input values with allow-authors true
    core.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'mock-token'
      }
      return inputs[name]
    })

    core.getBooleanInput.mockImplementation(name => {
      const inputs = {
        'allow-authors': true
      }
      return inputs[name]
    })

    await run()

    // Verify that ApprovalProcess was created with correct boolean config
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.objectContaining({
        token: 'mock-token',
        authorsCanReview: true,
        reviewerPermissions: ['write', 'admin']
      })
    )
  })

  test('run executes the post process successfully', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'mock-token'
      }
      return inputs[name]
    })

    core.getState.mockImplementation(key => {
      const states = {
        'comment-id': 'test-comment-id',
        'approved-by': 'test-approver',
        isPost: 'true'
      }
      return states[key]
    })

    // Mock GitHub client
    const mockOctokit = {}
    github.getOctokit.mockReturnValue(mockOctokit)

    // Mock PostProcess run method
    // PostProcess.mockImplementation(() => ({
    //   run: jest.fn().mockResolvedValue(undefined)
    // }))
    // FIXME: Why does the above not mock the run method?
    jest.mock('../src/post', () => ({
      PostProcess: jest.fn().mockImplementation(() => ({
        run: jest.fn().mockResolvedValue(undefined)
      }))
    }))

    await run()

    // Verify that the GitHub client was created
    expect(github.getOctokit).toHaveBeenCalledWith('mock-token')
    expect(GitHubClient).toHaveBeenCalledWith(mockOctokit, github.context)

    // Verify that PostProcess was created
    expect(PostProcess).toHaveBeenCalledWith(expect.any(GitHubClient))

    // Verify that the post process was run
    expect(PostProcess.mock.instances[0].run).toHaveBeenCalled()

    // Verify that no error was set
    expect(core.setFailed).not.toHaveBeenCalled()
  })
})
