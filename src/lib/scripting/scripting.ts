import { GlobalPaths } from '../../global';
import scripting from '../../core/scripting';
import type { AssetChangeInfo } from '../../core/scripting';
import type { ProgrammingFacet } from '../../core/scripting/programming/Facet';
import { join } from 'path';

export type * from '../../core/scripting/interface';

export async function init(projectPath: string): Promise<void> {
    const { Engine } = await import('../../core/engine');
    return await scripting.initialize(
        projectPath,
        GlobalPaths.enginePath,
        Engine.getConfig().includeModules);
}

let programmingFacet: ProgrammingFacet | null;

export async function createProgrammingFacet(): Promise<ProgrammingFacet> {
    const { Engine } = await import('../../core/engine');
    const features = Engine.getConfig().includeModules || [];
    const enginePath = GlobalPaths.enginePath;

    const module = await import('../../core/scripting/programming/Facet');
    const Facet = module.ProgrammingFacet;
    programmingFacet = await Facet.create(
        {
            root: enginePath,
            distRoot: join(enginePath, 'bin', '.cache', 'dev-cli', 'web'),
            baseUrl: '/scripting/engine',
            features,
        },
        scripting.projectPath
    );
    return programmingFacet;
}


/**
 * 在独立的子进程中运行项目脚本编译
 * 以避免阻塞主进程
 */
export async function startCompileScript(assetChanges?: AssetChangeInfo[]) {
    const { Engine } = await import('../../core/engine');
    const features = Engine.getConfig().includeModules;

    const { startCompileScriptProcess } = await import('../../core/scripting/compile-process');
    await startCompileScriptProcess({
        projectPath: scripting.projectPath,
        enginePath: GlobalPaths.enginePath,
        features,
        assetChanges
    }, () => {
        if (programmingFacet) {
            programmingFacet.notifyPackDriverUpdated();
        }
    });
}


