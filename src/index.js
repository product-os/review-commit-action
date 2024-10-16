/**
 * The entrypoint for the action.
 */
const core = require('@actions/core')
const github = require('@actions/github')
const { GitHubClient } = require('./client')
const { ReactionManager } = require('./reactions')
const { ApprovalProcess } = require('./approval')

async function run() {
  try {
    const config = {
      token: core.getInput('github-token'),
      pollInterval: parseInt(core.getInput('poll-interval')) || 10,
      authorsCanReview: core.getBooleanInput('allow-authors'),
      reviewerPermissions: ['write', 'admin'],
      commentHeader:
        'A repository maintainer needs to approve this workflow run.',
      commentFooter:
        'Maintainers, please review all changes and react with :+1: to approve or :-1: to reject.'
    }

    const octokit = github.getOctokit(config.token)
    const gitHubClient = new GitHubClient(octokit, github.context)
    const reactionManager = new ReactionManager(gitHubClient)
    const approvalProcess = new ApprovalProcess(
      gitHubClient,
      reactionManager,
      config
    )

    await approvalProcess.run()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

module.exports = { run }
