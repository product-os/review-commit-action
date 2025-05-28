# Review Commit Action

This GitHub Action checks for approval from a repository maintainer via pull
request reviews on the workflow run commit. It's designed to be used in pull
request workflows where you need manual approval before proceeding with certain
actions.

## How It Works

1. When triggered in a pull request workflow, the action creates an
   instructional comment on the pull request explaining the review requirements.
2. The action then checks for reviews on the current workflow run commit SHA.
3. The action looks for either:
   - **Approval reviews**: Standard GitHub pull request reviews with "APPROVED"
     state
   - **Comment reviews with deploy command**: Review comments starting with
     `/deploy`
4. Reviewers must have at least `write` access to the repository to have their
   reviews considered as eligible. Read more about
   [collaborator permissions](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user).
5. If eligible approval is found, the action logs a success message and exits.
   If no approval is found, the action fails.

### Additional details

- By default, authors of commits on the pull request are excluded from eligible
  reviewers, but this can be toggled via an input.
- Only reviews on the specific commit SHA of the current workflow run are
  considered. This prevents Actions Time Of Check to Time Of Use (TOCTOU)
  attacks. Read more on
  [preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
  and [TOCTOU](https://github.com/AdnaneKhan/ActionsTOCTOU/blob/main/README.md).

## Usage

To use this action in your workflow, add the following step:

```yaml
- name: Check for Approval
  uses: product-os/review-commit-action@main
  with:
    allow-authors: false
```

### Permissions

This action requires a token with the following permissions:

- `pull-requests:write`: Required to create instructional comments on pull
  requests and read reviews.

The automatic actions `GITHUB_TOKEN` secret should work fine, and is the
default. See
[how to adjust the permissions of the automatic token](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token).

### Inputs

- `github-token`: GitHub token for authentication. Uses the actions
  `GITHUB_TOKEN` secret if unset.
- `allow-authors`: Allow pull request commit authors to approve or reject the
  workflow. Default is `false`.

### Outputs

- `approved-by`: Username of the user who approved the commit.
- `review-id`: ID of the review that approved the workflow run.
- `review-type`: Type of approval found ('approval' or 'comment').

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
      # Required to create comments on pull requests and read reviews.
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Check for Approval
        uses: product-os/review-commit-action@main
        id: commit-review

      - name: Run after approval
        run: |
          echo "Approved by: ${{ steps.commit-review.outputs.approved-by }}"
          echo "Review ID: ${{ steps.commit-review.outputs.review-id }}"
          echo "Review type: ${{ steps.commit-review.outputs.review-type }}"
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
