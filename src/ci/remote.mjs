const SAFE_NAME = /^[\w.\- ]{1,100}$/;

const GITHUB = [
  /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
];
const AZURE = [
  /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)\/?$/,
  /^(?:ssh:\/\/)?git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)$/,
];
const AZURE_LEGACY =
  /^https:\/\/(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)\/?$/;

const decode = part => {
  try {
    return decodeURIComponent(part);
  } catch {
    return '';
  }
};

const safe = parts => parts.every(part => SAFE_NAME.test(part));

function github(url) {
  for (const pattern of GITHUB) {
    const match = pattern.exec(url);
    if (!match) continue;
    const [owner, repo] = [match[1], match[2]].map(decode);
    return safe([owner, repo]) ? { provider: 'github', owner, repo } : null;
  }
  return null;
}

function azure(url) {
  const match = AZURE.map(pattern => pattern.exec(url)).find(Boolean) || AZURE_LEGACY.exec(url);
  if (!match) return null;
  const [org, project, repo] = [match[1], match[2], match[3]].map(decode);
  return safe([org, project, repo]) ? { provider: 'azure', org, project, repo } : null;
}

export function parseRemote(url) {
  const text = String(url || '').trim();
  return github(text) || azure(text);
}
