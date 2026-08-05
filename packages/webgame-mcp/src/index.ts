export {
  createProject,
  createComponent,
  modifyComponent,
  removeComponent,
  modifyGame,
} from './project.js';

export { runDev, buildProject } from './process.js';

export async function startMcpServer(options) {
  const server = await import('./mcp-server.js');
  return server.startMcpServer(options);
}
