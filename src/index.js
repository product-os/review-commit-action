/**
 * The entrypoint for the action.
 */
const core = require('@actions/core')
const github = require('@actions/github')

const { GitHubClient } = require('./client')
const { ApprovalProcess } = require('./approval')
const { PostProcess } = require('./post')

async function run() {
  try {
    const config = {
      token: core.getInput('github-token'),
      authorsCanReview: core.getBooleanInput('allow-authors'),
      reviewerPermissions: ['write', 'admin']
    }

    const octokit = github.getOctokit(config.token)
    const gitHubClient = new GitHubClient(octokit, github.context)

    // Check if this is a post-execution run
    // eslint-disable-next-line no-extra-boolean-cast
    if (!!core.getState('isPost')) {
      const postProcess = new PostProcess(gitHubClient)
      await postProcess.run()
      return
    }

    core.saveState('isPost', 'true')
    const approvalProcess = new ApprovalProcess(gitHubClient, config)
    await approvalProcess.run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

module.exports = { run }
