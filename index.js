const core = require('@actions/core');
const axios = require('axios');

async function run() {
  try {
    const ddApikey = core.getInput('DD_API_KEY');
    const buildStatus = core.getInput('BUILD_STATUS');
    const repoName = core.getInput('GITHUB_REPOSITORY');
    const timestamp = Math.floor(Date.now() / 1000);

    if (buildStatus === 'success') {
      metricName = 'build.success';
      eventTitle = `New version deployed: ${repoName}`;
      eventText = `Version of the service ${repoName} was successfully deployed.`;
      alertType = 'info';
    } else {
      metricName = 'build.failure';
      eventTitle = `Build failure: ${repoName}`;
      eventText = `Build of the service ${repoName} failed.`;
      alertType = 'error';
    }

    const data = {
      "series": [
          {
              "metric": `build:${buildStatus}`,
              "points": [
                  [timestamp, 1]
              ],
              "type": "count",
              "tags": [
                  "github:actions"
                  `repo:${repoName}`
              ]
          }
      ]
    };

    // Send metric to Datadog
    await axios.post("https://api.datadoghq.com/api/v1/series", data, {
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": ddApikey
      }
    });

  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

run();

