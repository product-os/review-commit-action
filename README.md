# Review Commit Action

This GitHub Action waits for approval from a repository maintainer via a
reaction on a commit comment. It's designed to be used in pull request workflows
where you need manual approval before proceeding with certain actions.

## How It Works

1. When triggered in a PR workflow, the action creates a commit comment on the
   tip of HEAD.
2. The comment requests that a repository maintainer react with the specified
   approval reaction (default: 👍) to approve the workflow.
3. The action then enters a loop, waiting for a reaction from someone with write
   access to the repository.
4. If the required reaction is not found, it will continue looping until the job
   times out.
5. If a denial reaction is received from someone with write access, the action
   will exit with an error.

### Additional details

- Reviews are completed by reacting with emoji 👍 or 👎 on the generated commit
  comment.
- If the review is rejected, the action will throw an error and exit the
  workflow.
- If the review is approved, the action will log the approver name and continue
  the workflow.
- If the action times out, it will throw an error and exit the workflow. It can
  still be re-run manually at this point.
- Users must have at least `write` access to the repository to have their
  reactions considered as eligible. Read
  [this](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2022-11-28#get-repository-permissions-for-a-user)
  to see how permissions are mapped.
- The user associated with the token running the action is excluded from
  eligible reviewers. It is advised to use the actions `GITHUB_TOKEN` secret or
  App Installation tokens.
- By default, authors of commits on the PR are excluded from eligible reviewers,
  but this can be toggled via an input.
- The commit comment requiring review is always associated with the latest SHA
  that triggered the PR workflow. This is done to prevent Actions Time Of Check
  to Time Of Use (TOCTOU) attacks. Read more
  [here](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
  and [here](https://github.com/AdnaneKhan/ActionsTOCTOU/blob/main/README.md).
- A helper PR comment is created for convenience, always pointing to the current
  static commit comment requiring review. This PR comment is purely for
  convenience and is not part of the chain of trust.

## Usage

To use this action in your workflow, add the following step:

```yaml
- name: Wait for Approval
  uses: product-os/review-commit-action@main
  with:
    check-interval: '10'
    timeout-seconds: 600
    allow-authors: false
```

### Permissions

This action requires a token with the following permissions:

- `contents:write`: Required to create comments on commits.
- `pull-requests:write`: Required to create comments on pull requests.

The automatic actions `GITHUB_TOKEN` secret should work fine, and is the
default. Read how to adjust the permissions of the automatic token
[here](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token).

### Inputs

- `github-token`: GitHub token for authentication. The user associated with this
  token is not eligible to review. Uses the actions `GITHUB_TOKEN` secret if
  unset.
- `check-interval`: Interval in seconds between checks for reactions. Default is
  `10`.
- `timeout-seconds`: Timeout in seconds to wait for eligible reactions. Set to
  `0` to disable timeout. Overall job timeout takes precedence.
- `allow-authors`: Allow pull request commit authors to approve or reject the
  workflow. Default is `false`.

### Outputs

- `comment-id`: ID of the commit comment requiring review.
- `approved-by`: Username of the user who approved the commit.
- `rejected-by`: Username of the user who rejected the commit.

## Example Workflow

Here's an example of how to use this action in your workflow:

```yaml
name: PR Approval Workflow

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions: {}

jobs:
  approval-check:
    runs-on: ubuntu-latest

    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Wait for Approval
        uses: product-os/review-commit-action@main
        id: commit-review

      - name: Run after approval
        run: |
          echo "Comment ID: ${{ steps.commit-review.outputs.comment-id }}"
          echo "Approved by: ${{ steps.commit-review.outputs.approved-by }}"
          echo "Rejected by: ${{ steps.commit-review.outputs.rejected-by }}"
```

## Contributing

Contributions to improve the action are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to your branch
5. Create a new Pull Request

Please make sure to update tests as appropriate and adhere to the existing
coding style.

## License

This project is licensed under Apache 2.0 - see the [LICENSE](LICENSE) file for
details.

## Support

If you encounter any problems or have any questions, please open an issue in the
GitHub repository.
