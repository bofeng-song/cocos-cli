import { spawn } from 'node:child_process';
import { resolveProjectPath } from './fs-utils.js';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShellForNpm = process.platform === 'win32';

function runNpm(project: string | undefined, args: string[], options: any = {}): Promise<any> {
  const projectRoot = resolveProjectPath(project);
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: projectRoot,
      shell: useShellForNpm,
      stdio: options.detach ? 'ignore' : 'pipe',
      detached: !!options.detach,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    if (options.detach) {
      child.unref();
      resolve({
        pid: child.pid,
        project: projectRoot,
      });
      return;
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr, project: projectRoot });
      } else {
        const error: any = new Error(`npm ${args.join(' ')} failed with code ${code}\n${stderr || stdout}`);
        error.code = code;
        reject(error);
      }
    });
  });
}

export async function runDev(options: any = {}) {
  const args = ['run', 'dev'];
  const passthrough = [];
  if (options.host) {
    passthrough.push('--host', options.host);
  }
  if (options.port) {
    passthrough.push('--port', String(options.port));
  }
  if (passthrough.length) {
    args.push('--', ...passthrough);
  }
  const result = await runNpm(options.project, args, { detach: options.detach !== false });
  return {
    ...result,
    url: `http://${options.host || '127.0.0.1'}:${options.port || 5173}`,
  };
}

export async function buildProject(options: any = {}) {
  return runNpm(options.project, ['run', 'build']);
}
