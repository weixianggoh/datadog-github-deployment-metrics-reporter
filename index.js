const core = require('@actions/core');
const axios = require('axios');

async function getLatestRelease(githubPat, githubRepository) {
  try {
    const [owner, repo] = githubRepository.split('/');
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubPat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      }
    });
    return response.data.tag_name;
  } catch (error) {
    console.error('Error getting latest release:', error.response.data);
    throw error;
  }
}

async function run() {
  try {
    const ddApiKey = core.getInput('DD_API_KEY');
    const buildStatus = core.getInput('BUILD_STATUS');
    const githubRepository = core.getInput('GITHUB_REPOSITORY');
    const githubPat = core.getInput('GITHUB_PAT');
    const timestamp = Math.floor(Date.now() / 1000);

    // Get the latest semantic release version
    const latestBuildVersion = await getLatestRelease(githubPat, githubRepository) ?? 'unknown';

    let metricName;
    if (buildStatus === 'success') {
      metricName = 'build.success';
    } else {
      metricName = 'build.failure';
    }

    // Send metric to Datadog
    await axios.post("https://api.datadoghq.com/api/v1/series", {
      "series": [
        {
          "metric": metricName,
          "points": [
            [timestamp, 1]
          ],
          "type": "count",
          "tags": ["github:actions", `build:${buildStatus}`, `repo:${githubRepository}`, `version:${latestBuildVersion}`]
        }
      ]
    }, {
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": ddApiKey
      }
    });

  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

run();

