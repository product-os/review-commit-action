# Approved Commit Action

This GitHub Action waits for approval from a repository maintainer via a reaction on a commit comment.
It's designed to be used in pull request workflows where you need manual approval before proceeding with certain actions.

## Features

- Creates a commit comment on the tip of HEAD in pull request workflows
- Waits for a reaction from a collaborator with write access to the repository
- Supports custom reactions for approval and denial

## Usage

To use this action in your workflow, add the following step:

```yaml
- name: Wait for Approval
  uses: balena-io-experimental/review-commit-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    approve-reaction: '+1'
    reject-reaction: '-1'
    check-interval: '10'
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for authentication | No | `${{ github.token }}` |
| `check-interval` | Interval in seconds between checks for reactions | No | `'10'` |

### Outputs

| Output | Description |
|--------|-------------|
| `comment-id` | `ID of the commit comment` |
| `approved-by` | `Login of the user who approved the commit` |
| `rejected-by` | `Login of the user who rejected the commit` |

## Workflow

1. When triggered in a PR workflow, the action creates a commit comment on the tip of HEAD.
2. The comment requests that a repo maintainer react with the specified approval reaction (default: 👍) to approve the workflow.
3. The action then enters a loop, waiting for a reaction from someone with write access to the repository.
4. If the required reaction is not found, it will continue looping until the job times out.
5. If a denial reaction is received from someone with write access, the action will exit with an error.

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
      contents: read
      actions: read
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Wait for Approval
        uses: balena-io-experimental/review-commit-action@v1
        id: commit-review
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Run after approval
        run: echo "Approved by ${{ steps.commit-review.outputs.approved-by }}! Proceeding with the workflow."
```

## Permissions

This action requires a token with the following permissions:

- `contents:read`
- `actions:read`
- `pull-requests:write`

## Contributing

Contributions to improve the action are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to your branch
5. Create a new Pull Request

Please make sure to update tests as appropriate and adhere to the existing coding style.

## License

This project is licensed under Apache 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems or have any questions, please open an issue in the GitHub repository.
