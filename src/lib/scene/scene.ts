import { init as sceneInit } from '../../core/scene';
import { GlobalPaths } from '../../global';

/**
 * Public scene service interface, shared by external IDEs and cli's own browser
 * pages (scene editor / preview). `Services` is the typed service map
 * (Engine / Editor / Camera / Preview / ...); obtain the live instance at
 * runtime via `serviceManager.getServices()`. `GlobalEventManager` is the
 * service event bus, obtained via `serviceManager.getServiceEvents()`.
 */
export type {
    IServiceManager as Services,
    IPublicServiceManager,
} from '../../core/scene/scene-process/service/interfaces';
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
