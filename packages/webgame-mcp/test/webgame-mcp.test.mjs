import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  createComponent,
  createProject,
  modifyComponent,
  modifyGame,
  removeComponent,
  startMcpServer,
} from '../dist/index.js';

function makeTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-webgame-mcp-'));
  return path.join(root, 'game');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

test('creates a code-first Cocos npm web game project', () => {
  const project = makeTempProject();

  const created = createProject({
    target: project,
    cocosPackage: 'file:../cocos.tgz',
  });

  assert.equal(readJson(path.join(project, 'package.json')).dependencies.cocos, 'file:../cocos.tgz');
  assert.ok(created.files.includes('.gitignore'));
  assert.ok(created.files.includes('src/main.ts'));
  assert.ok(created.files.includes('src/game.ts'));
  assert.ok(created.files.includes('src/runtime/cocos-ui.ts'));
  assert.ok(created.files.includes('src/components/Rotator.ts'));
  assert.ok(fs.existsSync(path.join(project, 'src', 'runtime', 'cocos-assets.ts')));
  assert.ok(fs.existsSync(path.join(project, 'src', 'runtime', 'cocos-ui.ts')));
  assert.match(readText(path.join(project, '.gitignore')), /node_modules\//);
  assert.match(readText(path.join(project, '.gitignore')), /dist\//);
  assert.match(readText(path.join(project, '.gitignore')), /public\/assets\//);
  assert.match(readText(path.join(project, 'src', 'main.ts')), /import \{ Game \} from '\.\/game';/);
  assert.match(readText(path.join(project, 'src', 'game.ts')), /createDefaultUI/);
  assert.match(readText(path.join(project, 'src', 'game.ts')), /createButton/);
  assert.match(readText(path.join(project, 'src', 'runtime', 'cocos-ui.ts')), /setBackgroundColor/);
  assert.match(readText(path.join(project, 'src', 'runtime', 'cocos-ui.ts')), /setTextColor/);
});

test('creates, modifies, and removes component files', () => {
  const project = makeTempProject();
  createProject({ target: project, cocosPackage: 'cocos' });

  const created = createComponent({
    project,
    name: 'Counter',
    content: `import { _decorator, Component } from 'cocos';
const { ccclass } = _decorator;
@ccclass('Counter')
export class Counter extends Component {}
`,
  });

  assert.equal(path.basename(created.file), 'Counter.ts');
  assert.match(readText(created.file), /class Counter/);

  modifyComponent({
    project,
    name: 'Counter',
    content: `import { _decorator, Component } from 'cocos';
const { ccclass } = _decorator;
@ccclass('Counter')
export class Counter extends Component {
  public value = 1;
}
`,
  });

  assert.match(readText(created.file), /public value = 1/);

  removeComponent({ project, name: 'Counter' });
  assert.equal(fs.existsSync(created.file), false);
});

test('modifies game.ts while main.ts remains fixed', () => {
  const project = makeTempProject();
  createProject({ target: project, cocosPackage: 'cocos' });
  const mainBefore = readText(path.join(project, 'src', 'main.ts'));

  modifyGame({
    project,
    content: `import { director, Scene } from 'cocos';

export class Game {
  start() {
    director.runSceneImmediate(new Scene('CustomGame'));
  }
}
`,
  });

  assert.equal(readText(path.join(project, 'src', 'main.ts')), mainBefore);
  assert.match(readText(path.join(project, 'src', 'game.ts')), /CustomGame/);
});

test('serves browser debug endpoints with code-first tools only', async () => {
  const project = makeTempProject();
  createProject({ target: project, cocosPackage: 'cocos' });

  const server = await startMcpServer({
    project,
    host: '127.0.0.1',
    port: 0,
  });

  try {
    const debug = await fetch(`${server.baseUrl}/debug`);
    const health = await fetch(`${server.baseUrl}/health`);
    const tools = await fetch(`${server.baseUrl}/tools`);

    const healthJson = await health.json();
    const toolsJson = await tools.json();
    const names = toolsJson.tools.map((tool) => tool.name);

    assert.equal(debug.status, 200);
    assert.equal(healthJson.toolCount, 6);
    assert.deepEqual(names, [
      'webgame-create-project',
      'webgame-create-component',
      'webgame-modify-component',
      'webgame-remove-component',
      'webgame-modify-game',
      'webgame-build-project',
    ]);
  } finally {
    await server.close();
  }
});

test('exposes code-first tools through MCP streamable HTTP', async () => {
  const project = makeTempProject();
  createProject({ target: project, cocosPackage: 'cocos' });

  const server = await startMcpServer({
    project,
    host: '127.0.0.1',
    port: 0,
  });

  const client = new Client({ name: 'webgame-mcp-test', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(server.url));

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    const result = await client.callTool({
      name: 'webgame-create-component',
      arguments: {
        name: 'Clicker',
        content: `import { _decorator, Component } from 'cocos';
const { ccclass } = _decorator;
@ccclass('Clicker')
export class Clicker extends Component {}
`,
      },
    });

    assert.ok(names.includes('webgame-create-component'));
    assert.equal(names.includes('webgame-add-node'), false);
    assert.equal(result.structuredContent.result.name, 'Clicker');
    assert.ok(fs.existsSync(path.join(project, 'src', 'components', 'Clicker.ts')));
  } finally {
    await client.close();
    await server.close();
  }
});
