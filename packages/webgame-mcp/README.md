# @cocos/webgame-mcp

`@cocos/webgame-mcp` provides MCP tools for creating and modifying Cocos npm web games.

This package owns the MCP server, tool schemas, project templates, and local CLI entrypoint.

## Tools

- `webgame-create-project`: create a Vite Cocos npm web game project.
- `webgame-create-component`: create a TypeScript component under `src/components`.
- `webgame-modify-component`: replace a TypeScript component file.
- `webgame-remove-component`: remove a TypeScript component file.
- `webgame-modify-game`: replace `src/game.ts`.
- `webgame-build-project`: run `npm run build`.
- `webgame-list-files`: list files in a web game project.
- `webgame-read-file`: read a text file from a web game project.

## Install

From a packed tgz:

```bash
npm install -g ./cocos-webgame-mcp.tgz
```

From this package during development:

```bash
npm install
npm run build
```

## Start MCP Server

```bash
cocos-webgame-mcp start --host 127.0.0.1 --port 9527
```

With a default project:

```bash
cocos-webgame-mcp start --project ./my-game --host 127.0.0.1 --port 9527
```

HTTP endpoints:

```text
GET  /          Browser debug page
GET  /health    Health information
GET  /tools     Tool list
POST /mcp       Streamable HTTP MCP endpoint
```

## Create Project

CLI:

```bash
cocos-webgame-mcp create-project \
  --target ./my-game \
  --cocosPackage file:../../packages/cocos.tgz \
  --force
```

MCP tool arguments:

```json
{
  "target": "./my-game",
  "name": "my-game",
  "cocosPackage": "file:../../packages/cocos.tgz",
  "force": true,
  "install": true
}
```

`cocosPackage` is written to `package.json` as `dependencies.cocos`.

## Component Operations

Create a component:

```bash
cocos-webgame-mcp create-component \
  --project ./my-game \
  --name Player
```

Replace a component:

```bash
cocos-webgame-mcp modify-component \
  --project ./my-game \
  --name Player \
  --content "export class Player {}"
```

Remove a component:

```bash
cocos-webgame-mcp remove-component \
  --project ./my-game \
  --name Player
```

Replace `src/game.ts`:

```bash
cocos-webgame-mcp modify-game \
  --project ./my-game \
  --content "console.log('game');"
```

## File Inspection

List project files:

```json
{
  "project": "./my-game",
  "path": ".",
  "recursive": true,
  "includeDirectories": true,
  "includeGenerated": false,
  "maxFiles": 500
}
```

Read a project file:

```json
{
  "project": "./my-game",
  "path": "src/game.ts",
  "maxBytes": 200000
}
```

## Build

```bash
cocos-webgame-mcp build-project --project ./my-game
```

## Development

```bash
npm install
npm run build
npm test
```

The package entrypoint is:

```text
bin/cocos-webgame-mcp.js
```

The MCP server implementation is:

```text
src/mcp-server.ts
```
