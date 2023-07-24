const core = require('@actions/core');
const axios = require('axios');

async function getLatestRelease(githubPat, githubRepository) {
    const [owner, repo] = githubRepository.split('/');
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        headers: {
            'Authorization': `token ${githubPat}`
        }
    });
    return response.data.tag_name;
}

async function run() {
  try {
    const ddApiKey = core.getInput('DD_API_KEY');
    const buildStatus = core.getInput('BUILD_STATUS');
    const githubRepository = core.getInput('GITHUB_REPOSITORY');
    const githubPat = core.getInput('GITHUB_PAT');
    const timestamp = Math.floor(Date.now() / 1000);

    // Get the latest semantic release version
    const latestBuildVersion = await getLatestRelease(githubPat, githubRepository);

    let alertType, eventTitle, eventText;

    if (buildStatus === 'success') {
      eventTitle = `New version deployed: ${githubRepository}`;
      eventText = `Version ${latestBuildVersion} of the service ${githubRepository} was successfully deployed.`;
      alertType = 'info';
    } else {
      eventTitle = `Build failure: ${githubRepository}`;
      eventText = `Build of the service ${githubRepository} failed.`;
      alertType = 'error';
    }

    const logEvent = {
      ddsource: "github-actions",
      ddtags: `build:${buildStatus},repo:${githubRepository},version:${latestBuildVersion},timestamp:${timestamp},alert_type:${alertType}`,
      hostname: "github.com",
      message: eventText,
      status: alertType,
      service: githubRepository,
      title: eventTitle,
    };

    const metricData = {
      "series": [
        {
          "metric": `build:${buildStatus}`,
          "points": [
            [timestamp, 1]
          ],
          "type": "count",
          "tags": [
            "github:actions",
            `repo:${githubRepository}`,
            `version:${latestBuildVersion}`,
            `timestamp:${timestamp}`
          ]
        }
      ]
    };

    // Send log to Datadog
    await axios.post(`https://http-intake.logs.datadoghq.com/v1/input/${ddApiKey}`, logEvent, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    // Send metric to Datadog
    await axios.post("https://api.datadoghq.com/api/v1/series", metricData, {
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

