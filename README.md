# Datadog Github Deployment Metrics Reporter

This Github Action sends Github deployment metrics and events to Datadog.

## Usage

You can use this action by defining a step in your Github Actions workflow file (for example: `.github/workflows/main.yml`) as follows:

```yaml
steps:
  - name: Report to Datadog
    uses: weixianggoh/datadog-github-deployment-metrics-reporter@v1
    with:
      DD_API_KEY: ${{ secrets.DD_API_KEY }}
      BUILD_STATUS: ${{ job.status }}
      GITHUB_REPOSITORY: ${{ github.repository }}
