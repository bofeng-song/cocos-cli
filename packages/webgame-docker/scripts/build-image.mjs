import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dockerDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(dockerDir, '../..');
const args = process.argv.slice(2);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${commandArgs.join(' ')}`);
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function commandOutput(command, commandArgs, fallback = 'unknown') {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : fallback;
}

function packageMetadataFromTgz(file) {
  const result = spawnSync('tar', ['-xOf', file, 'package/package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to read package/package.json from ${file}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

if (!hasFlag('--skip-prepare')) {
  await run('node', ['packages/webgame-docker/scripts/prepare-packages.mjs']);
}

const release = await readJson(path.join(dockerDir, 'release.json'));
const cocosPackage = packageMetadataFromTgz(path.join(repoRoot, 'packages', 'cocos.tgz'));
const webgameMcpPackage = packageMetadataFromTgz(path.join(repoRoot, 'packages', 'cocos-webgame-mcp.tgz'));

if (release.cocosVersion !== cocosPackage.version) {
  throw new Error(`release.json cocosVersion ${release.cocosVersion} does not match cocos package ${cocosPackage.version}`);
}
if (release.webgameMcpVersion !== webgameMcpPackage.version) {
  throw new Error(`release.json webgameMcpVersion ${release.webgameMcpVersion} does not match webgame-mcp package ${webgameMcpPackage.version}`);
}

const imageVersion = optionValue('--image-version', process.env.WEBGAME_IMAGE_VERSION || release.imageVersion);
const imageRepository = optionValue('--repository', process.env.WEBGAME_MCP_REPOSITORY || 'cocos-webgame-mcp');
const image = optionValue('--image', process.env.WEBGAME_MCP_IMAGE || `${imageRepository}:${imageVersion}`);
const nodeImage = optionValue('--node-image', process.env.NODE_IMAGE || 'node:22-bookworm-slim');
const registry = optionValue('--npm-registry', process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org/');
const vcsRef = optionValue('--vcs-ref', process.env.VCS_REF || commandOutput('git', ['rev-parse', '--short=12', 'HEAD']));
const buildDate = optionValue('--build-date', process.env.BUILD_DATE || new Date().toISOString());

if (hasFlag('--validate-only')) {
  console.log('Docker release versions are valid:');
  console.log(`- image version: ${imageVersion}`);
  console.log(`- cocos: ${release.cocosVersion}`);
  console.log(`- webgame-mcp: ${release.webgameMcpVersion}`);
  process.exit(0);
}

await run('docker', [
  'build',
  '-f',
  'packages/webgame-docker/Dockerfile',
  '-t',
  image,
  '--build-arg',
  `NODE_IMAGE=${nodeImage}`,
  '--build-arg',
  `NPM_CONFIG_REGISTRY=${registry}`,
  '--build-arg',
  `IMAGE_VERSION=${imageVersion}`,
  '--build-arg',
  `COCOS_VERSION=${release.cocosVersion}`,
  '--build-arg',
  `WEBGAME_MCP_VERSION=${release.webgameMcpVersion}`,
  '--build-arg',
  `VCS_REF=${vcsRef}`,
  '--build-arg',
  `BUILD_DATE=${buildDate}`,
  '.',
]);

console.log(`\nBuilt image: ${image}`);
console.log(`- image version: ${imageVersion}`);
console.log(`- cocos: ${release.cocosVersion}`);
console.log(`- webgame-mcp: ${release.webgameMcpVersion}`);
console.log(`- revision: ${vcsRef}`);
