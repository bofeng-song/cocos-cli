export {
  createProject,
  createComponent,
  listProjectFiles,
  modifyComponent,
  removeComponent,
  modifyGame,
  readProjectFile,
} from './project.js';

export { runDev, buildProject } from './process.js';

export async function startMcpServer(options) {
  const server = await import('./mcp-server.js');
  return server.startMcpServer(options);
}
