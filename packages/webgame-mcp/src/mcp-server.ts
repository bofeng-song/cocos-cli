import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  createComponent,
  createProject,
  modifyComponent,
  modifyGame,
  removeComponent,
} from './project.js';
import { buildProject, runDev } from './process.js';

function withProject(defaultProject: string, args: any) {
  return {
    ...args,
    project: args.project || defaultProject,
  };
}

function textResult(result: any) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: {
      result,
    },
  };
}

const toolSummaries = [
  ['webgame-create-project', 'Create a Vite Cocos npm web game project.'],
  ['webgame-create-component', 'Create a TypeScript component file under src/components.'],
  ['webgame-modify-component', 'Replace a TypeScript component file.'],
  ['webgame-remove-component', 'Remove a TypeScript component file.'],
  ['webgame-modify-game', 'Replace src/game.ts.'],
  ['webgame-build-project', 'Run npm run build for the web game project.'],
].map(([name, description]) => ({ name, description }));

const toolHandlers: Record<string, (args: any) => any> = {
  'webgame-create-project': createProject,
  'webgame-create-component': createComponent,
  'webgame-modify-component': modifyComponent,
  'webgame-remove-component': removeComponent,
  'webgame-modify-game': modifyGame,
  'webgame-build-project': buildProject,
};

const debugExamples: Record<string, any> = {
  'webgame-create-project': {
    target: './my-game',
    cocosPackage: 'cocos',
    force: true,
  },
  'webgame-create-component': {
    name: 'Rotator',
    overwrite: true,
  },
  'webgame-modify-component': {
    name: 'Rotator',
    content: '',
  },
  'webgame-remove-component': {
    name: 'Rotator',
  },
  'webgame-modify-game': {
    content: '',
  },
  'webgame-build-project': {},
};

function registerTool(server: McpServer, defaultProject: string, name: string, description: string, schema: any, handler: (args: any) => any) {
  server.tool(name, description, schema, async (args) => {
    const result = await handler(withProject(defaultProject, args));
    return textResult(result);
  });
}

async function executeDebugTool(project: string, toolName: string, args: any) {
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return handler(withProject(project, args || {}));
}

export function createMcpServer(options: any = {}) {
  const defaultProject = options.project || process.cwd();
  const server = new McpServer({
    name: '@cocos/webgame-mcp',
    version: '0.0.1-alpha.0',
  });

  registerTool(server, defaultProject, 'webgame-create-project', 'Create a Vite Cocos npm web game project.', {
    target: z.string().describe('Target project directory.'),
    name: z.string().optional(),
    template: z.literal('vite').optional(),
    cocosPackage: z.string().optional().describe('Dependency value for package.json dependencies.cocos.'),
    packageSource: z.string().optional().describe('Alias for cocosPackage.'),
    force: z.boolean().optional(),
  }, createProject);

  registerTool(server, defaultProject, 'webgame-create-component', 'Create a TypeScript component file under src/components.', {
    project: z.string().optional(),
    name: z.string(),
    path: z.string().optional(),
    content: z.string().optional(),
    overwrite: z.boolean().optional(),
  }, createComponent);

  registerTool(server, defaultProject, 'webgame-modify-component', 'Replace a TypeScript component file.', {
    project: z.string().optional(),
    name: z.string().optional(),
    path: z.string().optional(),
    content: z.string(),
  }, modifyComponent);

  registerTool(server, defaultProject, 'webgame-remove-component', 'Remove a TypeScript component file.', {
    project: z.string().optional(),
    name: z.string().optional(),
    path: z.string().optional(),
  }, removeComponent);

  registerTool(server, defaultProject, 'webgame-modify-game', 'Replace src/game.ts.', {
    project: z.string().optional(),
    content: z.string(),
  }, modifyGame);

  registerTool(server, defaultProject, 'webgame-build-project', 'Run npm run build for the web game project.', {
    project: z.string().optional(),
  }, buildProject);

  return server;
}

export async function startMcpServer(options: any = {}) {
  const port = Number(options.port ?? 9527);
  const host = options.host || '127.0.0.1';
  const project = options.project || process.cwd();
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>@cocos/webgame-mcp</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; line-height: 1.5; color: #20242a; }
    code { background: #f2f4f7; padding: 2px 6px; border-radius: 4px; }
    table { border-collapse: collapse; margin-top: 16px; min-width: 720px; }
    th, td { border: 1px solid #d8dee8; padding: 8px 10px; text-align: left; }
    th { background: #f6f8fb; }
  </style>
</head>
<body>
  <h1>@cocos/webgame-mcp</h1>
  <p>Status: running</p>
  <p>Project: <code>${escapeHtml(project)}</code></p>
  <p>MCP endpoint: <code>POST /mcp</code></p>
  <p>Browser endpoints: <a href="/debug">/debug</a>, <a href="/health">/health</a>, <a href="/tools">/tools</a></p>
  <table>
    <thead><tr><th>Tool</th><th>Description</th></tr></thead>
    <tbody>
      ${toolSummaries.map((tool) => `<tr><td><code>${tool.name}</code></td><td>${escapeHtml(tool.description)}</td></tr>`).join('\n')}
    </tbody>
  </table>
</body>
</html>`);
  });

  app.get('/health', (_req, res) => {
    res.json({
      name: '@cocos/webgame-mcp',
      status: 'running',
      project,
      mcpEndpoint: '/mcp',
      debugEndpoint: '/debug',
      toolsEndpoint: '/tools',
      toolCount: toolSummaries.length,
    });
  });

  app.get('/tools', (_req, res) => {
    res.json({
      tools: toolSummaries,
    });
  });

  app.get('/debug', (_req, res) => {
    res.type('html').send(debugPage(project));
  });

  app.post('/debug/tool/:name', async (req, res) => {
    try {
      const result = await executeDebugTool(project, req.params.name, req.body || {});
      res.json({
        ok: true,
        tool: req.params.name,
        result,
      });
    } catch (error: any) {
      res.status(400).json({
        ok: false,
        tool: req.params.name,
        error: error?.message || String(error),
      });
    }
  });

  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      transport.close();
    });
    const server = createMcpServer({ project });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', (_req, res) => {
    res
      .status(405)
      .set('Allow', 'POST')
      .type('text')
      .send('Method Not Allowed. The MCP endpoint only accepts POST Streamable HTTP requests. Open / for browser debug information.');
  });

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(port, host);
    httpServer.once('error', reject);
    httpServer.once('listening', () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const baseUrl = `http://${host}:${actualPort}`;
      const url = `${baseUrl}/mcp`;
      console.log(`[webgame-mcp] listening on ${url}`);
      console.log(`[webgame-mcp] debug page: ${baseUrl}/`);
      resolve({
        baseUrl,
        url,
      close: () => new Promise<void>((done, fail) => httpServer.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debugPage(project: string) {
  const firstTool = toolSummaries[0]?.name || '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>@cocos/webgame-mcp debug</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #20242a; }
    label { display: block; font-weight: 600; margin: 18px 0 8px; }
    select, textarea, button { font: inherit; }
    select { min-width: 360px; padding: 6px; }
    textarea { width: min(960px, 100%); height: 280px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    button { margin-top: 12px; padding: 8px 14px; cursor: pointer; }
    pre { width: min(960px, 100%); min-height: 180px; overflow: auto; background: #111827; color: #e5e7eb; padding: 16px; border-radius: 6px; }
    code { background: #f2f4f7; padding: 2px 6px; border-radius: 4px; }
    .row { margin-bottom: 14px; }
  </style>
</head>
<body>
  <h1>@cocos/webgame-mcp Debug</h1>
  <div class="row">Project: <code>${escapeHtml(project)}</code></div>
  <div class="row">MCP endpoint for real clients: <code>POST /mcp</code></div>
  <label for="tool">Tool</label>
  <select id="tool">
    ${toolSummaries.map((tool) => `<option value="${tool.name}">${tool.name} - ${escapeHtml(tool.description)}</option>`).join('\n')}
  </select>
  <label for="args">JSON arguments</label>
  <textarea id="args" spellcheck="false"></textarea>
  <br>
  <button id="run">Run Tool</button>
  <label for="result">Result</label>
  <pre id="result">Ready.</pre>
  <script>
    const examples = ${JSON.stringify(debugExamples, null, 2)};
    const tool = document.getElementById('tool');
    const args = document.getElementById('args');
    const result = document.getElementById('result');

    function setExample() {
      args.value = JSON.stringify(examples[tool.value] || {}, null, 2);
    }

    tool.addEventListener('change', setExample);
    document.getElementById('run').addEventListener('click', async () => {
      result.textContent = 'Running...';
      let body;
      try {
        body = JSON.parse(args.value || '{}');
      } catch (error) {
        result.textContent = 'Invalid JSON: ' + error.message;
        return;
      }
      try {
        const response = await fetch('/debug/tool/' + encodeURIComponent(tool.value), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        result.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        result.textContent = String(error?.stack || error);
      }
    });

    tool.value = ${JSON.stringify(firstTool)};
    setExample();
  </script>
</body>
</html>`;
}
