import { init as sceneInit } from '../../core/scene';
import { GlobalPaths } from '../../global';

/**
 * The service event bus type, obtained at runtime via
 * `serviceManager.getServiceEvents()`. The service map itself
 * (`IServiceManager` / `Service`) is exported from `../service`.
 */
export type { GlobalEventManager } from '../../core/scene/scene-process/service/core/global-events';

/**
 * Initialize the scene module.
 * Registers the scene middleware and initializes scene config.
 */
export async function init(): Promise<void> {
    await sceneInit();
}

/**
 * Start the scene worker process.
 *
 * @param projectPath Path to the project directory
 */
export async function startupWorker(projectPath: string): Promise<void> {
    const { sceneWorker } = await import('../../core/scene/main-process/scene-worker');
    await sceneWorker.start(GlobalPaths.enginePath, projectPath);
}
