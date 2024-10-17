/**
 * The entrypoint for the action.
 */
const core = require('@actions/core')
const github = require('@actions/github')
const { GitHubClient } = require('./client')
const { ReactionManager } = require('./reactions')
const { ApprovalProcess } = require('./approval')
const { PostProcess } = require('./post')

async function run() {
  try {
    const config = {
      token: core.getInput('github-token'),
      pollInterval: parseInt(core.getInput('poll-interval')) || 10,
      authorsCanReview: core.getBooleanInput('allow-authors'),
      reviewerPermissions: ['write', 'admin'],
      commentHeaders: [
        'A repository maintainer needs to approve this workflow run.'
      ],
      commentFooters: [
        'Maintainers, please review all commits and react with :+1: to approve or :-1: to reject.',
        'Things to look for: [GitHub Actions Security Cheat Sheet](https://0xn3va.gitbook.io/cheat-sheets/ci-cd/github/actions)'
      ]
    }

    const octokit = github.getOctokit(config.token)
    const gitHubClient = new GitHubClient(octokit, github.context)
    const reactionManager = new ReactionManager(gitHubClient)

    // Check if this is a post-execution run
    // eslint-disable-next-line no-extra-boolean-cast
    if (!!core.getState('isPost')) {
      const postProcess = new PostProcess(gitHubClient, reactionManager)
      await postProcess.run()
      return
    }

    core.saveState('isPost', 'true')
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
