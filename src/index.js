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
      checkInterval: parseInt(core.getInput('check-interval')) || 10,
      timeoutSeconds: parseInt(core.getInput('timeout-seconds')) || 0,
      authorsCanReview: core.getBooleanInput('allow-authors'),
      approveReaction: '+1',
      rejectReaction: '-1',
      waitReaction: 'eyes',
      successReaction: 'rocket',
      failedReaction: 'confused',
      commentHeader:
        'A repository maintainer needs to approve the commit(s) for this workflow.',
      commentFooter: 'React with :+1: to approve or :-1: to reject.',
      reviewerPermissions: ['write', 'admin']
    }

    const octokit = github.getOctokit(config.token)
    const gitHubClient = new GitHubClient(octokit, github.context)
    const reactionManager = new ReactionManager(gitHubClient, config)
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
