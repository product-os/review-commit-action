const core = require('@actions/core')
const github = require('@actions/github')
const { GitHubClient } = require('../src/client')
const { ReactionManager } = require('../src/reactions')
const { ApprovalProcess } = require('../src/approval')

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('../src/client')
jest.mock('../src/reactions')
jest.mock('../src/approval')

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
        'github-token': 'mock-token',
        'check-interval': '10',
        'timeout-seconds': '300'
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

    // Verify that ReactionManager was created
    expect(ReactionManager).toHaveBeenCalled()

    // Verify that ApprovalProcess was created with correct config
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.any(ReactionManager),
      expect.objectContaining({
        token: 'mock-token',
        checkInterval: 10,
        timeoutSeconds: 300
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
        'github-token': 'default-token',
        'check-interval': '',
        'timeout-seconds': ''
      }
      return inputs[name]
    })

    await run()

    // Verify that ApprovalProcess was created with default config values
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.any(ReactionManager),
      expect.objectContaining({
        token: 'default-token',
        checkInterval: 10, // default value
        timeoutSeconds: 0 // default value
      })
    )
  })

  test('run handles invalid input values', async () => {
    // Mock input values with invalid data
    core.getInput.mockImplementation(name => {
      const inputs = {
        'github-token': 'mock-token',
        'check-interval': 'invalid',
        'timeout-seconds': 'invalid'
      }
      return inputs[name]
    })

    await run()

    // Verify that ApprovalProcess was created with default config values for invalid inputs
    expect(ApprovalProcess).toHaveBeenCalledWith(
      expect.any(GitHubClient),
      expect.any(ReactionManager),
      expect.objectContaining({
        token: 'mock-token',
        checkInterval: 10, // default value
        timeoutSeconds: 0 // default value
      })
    )
  })
})
