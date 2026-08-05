import fs from 'node:fs';
import path from 'node:path';

export function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

export function resolveProjectPath(project) {
  return path.resolve(project || process.cwd());
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function pathExists(file) {
  return fs.existsSync(file);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

export function assertInsideProject(projectRoot, target) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside project: ${target}`);
  }
  return resolved;
}

export function sceneFilePath(projectRoot, scene) {
  const sceneName = String(scene || 'main');
  const fileName = sceneName.endsWith('.scene.json') ? sceneName : `${sceneName}.scene.json`;
  return assertInsideProject(projectRoot, path.join(projectRoot, 'src', 'scenes', fileName));
}

export function scriptFilePath(projectRoot, scriptPathOrName) {
  const input = String(scriptPathOrName || '').trim();
  if (!input) {
    throw new Error('Script name or path is required.');
  }
  const relative = input.includes('/') || input.includes('\\')
    ? input
    : path.join('src', 'scripts', `${input}.ts`);
  const withExtension = relative.endsWith('.ts') ? relative : `${relative}.ts`;
  return assertInsideProject(projectRoot, path.join(projectRoot, withExtension));
}

export function listFilesRecursive(dir, predicate) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(file, predicate));
    } else if (!predicate || predicate(file)) {
      results.push(file);
    }
  }
  return results;
}
