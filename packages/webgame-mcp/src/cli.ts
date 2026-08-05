import { inspect } from 'node:util';
import {
  createComponent,
  createProject,
  modifyComponent,
  modifyGame,
  removeComponent,
} from './project.js';
import { buildProject, runDev } from './process.js';

function parseArgs(argv: string[]): any {
  const result: any = {
    _: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function parseJsonOption(value: string | undefined, fallback: any) {
  if (!value) {
    return fallback;
  }
  return JSON.parse(value);
}

function printResult(result: any) {
  console.log(inspect(result, { depth: null, colors: true }));
}

function help() {
  console.log(`Usage:
  cocos-webgame-mcp start --project <path> [--port 9527]
  cocos-webgame-mcp create-project --target <path> [--package <cocos-dep>] [--force]
  cocos-webgame-mcp create-component --project <path> --name Player
  cocos-webgame-mcp modify-component --project <path> --name Player --content <source>
  cocos-webgame-mcp remove-component --project <path> --name Player
  cocos-webgame-mcp modify-game --project <path> --content <source>
  cocos-webgame-mcp run-dev --project <path> [--port 5173]
  cocos-webgame-mcp build-project --project <path>
`);
}

export async function runCli(argv: string[]) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === 'help' || command === '--help') {
    help();
    return;
  }

  if (command === 'start') {
    const { startMcpServer } = await import('./mcp-server.js');
    await startMcpServer({
      project: args.project,
      host: args.host || '127.0.0.1',
      port: args.port ? Number(args.port) : 9527,
    });
    return;
  }

  if (command === 'create-project') {
    printResult(createProject({
      target: args.target || args.project,
      name: args.name,
      template: args.template || 'vite',
      cocosPackage: args.package || args.cocosPackage,
      force: !!args.force,
    }));
    return;
  }

  if (command === 'create-component') {
    printResult(createComponent({
      project: args.project,
      name: args.name,
      path: args.path,
      content: args.content,
      overwrite: !!args.overwrite,
    }));
    return;
  }

  if (command === 'modify-component') {
    printResult(modifyComponent({
      project: args.project,
      name: args.name,
      path: args.path,
      content: args.content,
    }));
    return;
  }

  if (command === 'remove-component') {
    printResult(removeComponent({
      project: args.project,
      name: args.name,
      path: args.path,
    }));
    return;
  }

  if (command === 'modify-game') {
    printResult(modifyGame({
      project: args.project,
      content: args.content,
    }));
    return;
  }

  if (command === 'run-dev') {
    printResult(await runDev({
      project: args.project,
      host: args.host,
      port: args.port ? Number(args.port) : undefined,
    }));
    return;
  }

  if (command === 'build-project' || command === 'build') {
    printResult(await buildProject({
      project: args.project,
    }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
