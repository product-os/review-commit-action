# Review Commit Action

This GitHub Action waits for approval from a repository maintainer via a
reaction on a commit comment. It's designed to be used in pull request workflows
where you need manual approval before proceeding with certain actions.

## How It Works

1. When triggered in a pull request workflow, the action creates new a comment
   on the pull request. Reviews are completed by reacting with emoji 👍 or 👎 on
   the comment to approve or reject respectively.
2. The action then enters a loop, waiting for a reaction from an eligible
   reviewer. Reviewers must have at least `write` access to the repository to
   have their reactions considered as eligible. Read more about collaborator
   permissions
   [here](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user)
3. If the required reaction is not found, it will continue looping until the
   step times out.

### Additional details

- By default, authors of commits on the pull request are excluded from eligible
  reviewers, but this can be toggled via an input.
- The comment requiring review is always associated with the current run of the
  workflow. Reacting to previous comments has no effect. This is done to prevent
  Actions Time Of Check to Time Of Use (TOCTOU) attacks. Read more
  [here](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
  and [here](https://github.com/AdnaneKhan/ActionsTOCTOU/blob/main/README.md).

## Usage

To use this action in your workflow, add the following step:

```yaml
- name: Wait for Approval
  uses: product-os/review-commit-action@main
  timeout-minutes: 60
  with:
    poll-interval: '10'
    allow-authors: false
```

### Permissions

This action requires a token with the following permissions:

- `pull-requests:write`: Required to create comments on pull requests.

The automatic actions `GITHUB_TOKEN` secret should work fine, and is the
default. Read how to adjust the permissions of the automatic token
[here](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token).

### Inputs

- `github-token`: GitHub token for authentication. Uses the actions
  `GITHUB_TOKEN` secret if unset.
- `poll-interval`: Interval in seconds between checks for reactions. Default is
  `10`.
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
      # Required to create comments on pull requests.
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Wait for Approval
        uses: product-os/review-commit-action@main
        id: commit-review
        timeout-minutes: 60

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
