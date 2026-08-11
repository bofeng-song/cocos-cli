import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dockerDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(dockerDir, '../..');
const webgameMcpDir = path.join(repoRoot, 'packages', 'webgame-mcp');
const distNpmDir = path.join(repoRoot, 'dist-npm');
const distCocosTgz = path.join(distNpmDir, 'cocos', 'cocos.tgz');
const distWebgameMcpDir = path.join(distNpmDir, 'webgame-mcp');
const distWebgameMcpTgz = path.join(distWebgameMcpDir, 'cocos-webgame-mcp.tgz');
const dockerPackageDir = path.join(repoRoot, 'packages');
const dockerCocosTgz = path.join(dockerPackageDir, 'cocos.tgz');
const dockerWebgameMcpTgz = path.join(dockerPackageDir, 'cocos-webgame-mcp.tgz');

const args = new Set(process.argv.slice(2));
const skipCocos = args.has('--skip-cocos');
const skipWebgameMcp = args.has('--skip-webgame-mcp');

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${commandArgs.join(' ')}`);
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
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

async function latestTgz(directory) {
  const entries = await readdir(directory);
  const tgzFiles = await Promise.all(
    entries
      .filter((name) => name.endsWith('.tgz'))
      .map(async (name) => {
        const file = path.join(directory, name);
        return {
          file,
          mtimeMs: (await stat(file)).mtimeMs,
        };
      }),
  );
  if (tgzFiles.length === 0) {
    throw new Error(`No .tgz file found in ${directory}`);
  }
  tgzFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return tgzFiles[0].file;
}

async function buildCocosPackage() {
  if (skipCocos) {
    console.log('Skipping cocos package build.');
    return;
  }
  await run('npm', ['run', 'build:npm-web-mobile']);
  if (!existsSync(distCocosTgz)) {
    throw new Error(`Expected cocos tgz was not generated: ${distCocosTgz}`);
  }
}

async function buildWebgameMcpPackage() {
  if (skipWebgameMcp) {
    console.log('Skipping webgame-mcp package build.');
    return;
  }
  await mkdir(distWebgameMcpDir, { recursive: true });
  await rm(distWebgameMcpDir, { recursive: true, force: true });
  await mkdir(distWebgameMcpDir, { recursive: true });
  await run('npm', ['run', 'build'], { cwd: webgameMcpDir });
  await run('npm', ['pack', '--pack-destination', distWebgameMcpDir], { cwd: webgameMcpDir });
  const packed = await latestTgz(distWebgameMcpDir);
  if (path.resolve(packed) !== path.resolve(distWebgameMcpTgz)) {
    await copyFile(packed, distWebgameMcpTgz);
  }
  if (!existsSync(distWebgameMcpTgz)) {
    throw new Error(`Expected webgame-mcp tgz was not generated: ${distWebgameMcpTgz}`);
  }
}

async function copyDockerInputs() {
  if (!existsSync(distCocosTgz)) {
    throw new Error(`Missing cocos tgz: ${distCocosTgz}`);
  }
  if (!existsSync(distWebgameMcpTgz)) {
    throw new Error(`Missing webgame-mcp tgz: ${distWebgameMcpTgz}`);
  }
  await copyFile(distCocosTgz, dockerCocosTgz);
  await copyFile(distWebgameMcpTgz, dockerWebgameMcpTgz);
  console.log('\nDocker package inputs are ready:');
  console.log(`- ${path.relative(repoRoot, dockerCocosTgz)}`);
  console.log(`- ${path.relative(repoRoot, dockerWebgameMcpTgz)}`);
}

await buildCocosPackage();
await buildWebgameMcpPackage();
await copyDockerInputs();
