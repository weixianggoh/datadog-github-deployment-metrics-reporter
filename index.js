const core = require('@actions/core');
const axios = require('axios');
const metrics = require('datadog-metrics');

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

    core.setOutput('dd_api_key', ddApiKey);
    core.setOutput('build_status', buildStatus);
    core.setOutput('github_repository', githubRepository);
    core.setOutput('github_pat', githubPat);
    
    // Initialize Datadog client
    metrics.init({ apiKey: ddApiKey});

    // Get the latest semantic release version
    const latestBuildVersion = await getLatestRelease(githubPat, githubRepository) ?? 'unknown';
    core.setOutput('latest_build_version', latestBuildVersion);

    // Validate buildStatus
    if (!['success', 'failure'].includes(buildStatus)) {
      throw new Error(`Invalid build status: ${buildStatus}`);
    }

    // Send build status metric
    const metricName = buildStatus === 'success' ? 'build.success' : 'build.failure';
    metrics.increment(metricName, 1, ["github:actions", `build:${buildStatus}`, `repo:${githubRepository}`, `version:${latestBuildVersion}`]);

    core.setOutput('build_status', buildStatus);
    core.setOutput('build_status_metric', metricName);
    core.setOutput('build_status_metric_tags', ["github:actions", `build:${buildStatus}`, `repo:${githubRepository}`, `version:${latestBuildVersion}`]);
    core.setOutput('build_status_metric_value', 1);
    core.setOutput('build_status_metric_type', 'increment');

    // Get PR data
    const prData = await getPullRequestData(githubPat, githubRepository);

    core.setOutput('pr_count', prData.data.length);
    core.setOutput('pr_data', JSON.stringify(prData.data));
    core.setOutput('pr_data_json', prData.data);

    prData.data.forEach(pr => {
      if (pr.merged_at) { // Check if PR is merged
        const createdAt = new Date(pr.created_at);
        const mergedAt = new Date(pr.merged_at);
        const leadTime = (mergedAt - createdAt) / 1000;
        metrics.gauge('pr.lead_time', leadTime, [`repo:${githubRepository}`, `pr:${pr.number}`]);
      }
    });

    // Get version data
    const versionData = await getVersionData(githubPat, githubRepository);

    core.setOutput('version_data', JSON.stringify(versionData.data));
    core.setOutput('version_data_json', versionData.data);
    core.setOutput('version_count', versionData.data.length);

    if (versionData.data.length < 2) {
      console.warn('Not enough releases to calculate version lead time');
      return;
    }

    const latestVersion = versionData.data[0];
    const previousVersion = versionData.data[1];

    const fromTime = new Date(previousVersion.created_at);
    const toTime = new Date(latestVersion.created_at);

    core.setOutput('version_lead_time', (toTime - fromTime) / 1000);
    core.setOutput('version_lead_time_from', previousVersion.tag_name);
    core.setOutput('version_lead_time_to', latestVersion.tag_name);
    core.setOutput('version_lead_time_repo', githubRepository);
    core.setOutput('version_lead_time_metric', 'version.lead_time');
    core.setOutput('version_lead_time_metric_tags', [`repo:${githubRepository}`, `from:${previousVersion.tag_name}`, `to:${latestVersion.tag_name}`]);

    const versionLeadTime = (toTime - fromTime) / 1000;
    metrics.gauge('version.lead_time', versionLeadTime, [`repo:${githubRepository}`, `from:${previousVersion.tag_name}`, `to:${latestVersion.tag_name}`]);

    // Send latest build version
    metrics.gauge('build.latest_version', latestBuildVersion, [`repo:${githubRepository}`]);

  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

run();