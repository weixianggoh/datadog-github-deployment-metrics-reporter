const core = require('@actions/core');
const axios = require('axios');
const { StatsD } = require('datadog-metrics');

async function getLatestRelease(githubPat, githubRepository) {
  const [owner, repo] = githubRepository.split('/');
  const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${githubPat}`,
      'Content-Type': 'application/json',
    }
  });
  return response.data.tag_name;
}

async function getPullRequestData(githubPat, githubRepository) {
  const [owner, repo] = githubRepository.split('/');
  return axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${githubPat}`,
      'Content-Type': 'application/json',
    }
  });
}

async function getVersionData(githubPat, githubRepository) {
  const [owner, repo] = githubRepository.split('/');
  return axios.get(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${githubPat}`,
      'Content-Type': 'application/json',
    }
  });
}

async function run() {
  try {
    const ddApiKey = core.getInput('DD_API_KEY');
    const buildStatus = core.getInput('BUILD_STATUS');
    const githubRepository = core.getInput('GITHUB_REPOSITORY');
    const githubPat = core.getInput('GITHUB_PAT');

    // Initialize Datadog client
    const datadog = new StatsD({ apiKey: ddApiKey });

    // Get the latest semantic release version
    const latestBuildVersion = await getLatestRelease(githubPat, githubRepository) ?? 'unknown';

    // Validate buildStatus
    if (!['success', 'failure'].includes(buildStatus)) {
      throw new Error(`Invalid build status: ${buildStatus}`);
    }

    // Send build status metric
    const metricName = buildStatus === 'success' ? 'build.success' : 'build.failure';
    datadog.increment(metricName, 1, ["github:actions", `build:${buildStatus}`, `repo:${githubRepository}`, `version:${latestBuildVersion}`]);

    // Get PR data
    const prData = await getPullRequestData(githubPat, githubRepository);
    prData.data.forEach(pr => {
      if (pr.merged_at) { // Check if PR is merged
        const createdAt = new Date(pr.created_at);
        const mergedAt = new Date(pr.merged_at);
        const leadTime = (mergedAt - createdAt) / 1000;
        datadog.gauge('pr.lead_time', leadTime, [`repo:${githubRepository}`, `pr:${pr.number}`]);
      }
    });

    // Get version data
    const versionData = await getVersionData(githubPat, githubRepository);
    if (versionData.data.length < 2) {
      console.warn('Not enough releases to calculate version lead time');
      return;
    }

    const latestVersion = versionData.data[0];
    const previousVersion = versionData.data[1];

    const fromTime = new Date(previousVersion.created_at);
    const toTime = new Date(latestVersion.created_at);

    const versionLeadTime = (toTime - fromTime) / 1000;
    datadog.gauge('version.lead_time', versionLeadTime, [`repo:${githubRepository}`, `from:${previousVersion.tag_name}`, `to:${latestVersion.tag_name}`]);

    // Send latest build version
    datadog.gauge('build.latest_version', latestBuildVersion, [`repo:${githubRepository}`]);

    // Close Datadog connection
    datadog.close();

  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

run();