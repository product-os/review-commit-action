const core = require('@actions/core')
const { PostProcess } = require('../src/post')

jest.mock('@actions/core')

describe('PostProcess', () => {
  let postProcess
  let mockGitHubClient

  beforeEach(() => {
    jest.clearAllMocks()

    mockGitHubClient = {}

    postProcess = new PostProcess(mockGitHubClient)
  })

  describe('run', () => {
    test('completes successfully and logs info message', async () => {
      await postProcess.run()

      expect(core.info).toHaveBeenCalledWith(
        'Post-process completed - no cleanup required for review-based approval'
      )
    })

    test('does not access any state', async () => {
      await postProcess.run()

      // Verify no state methods were called
      expect(core.getState).not.toHaveBeenCalled()
    })
  })
})
