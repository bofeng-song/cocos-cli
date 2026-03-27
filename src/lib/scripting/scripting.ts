import { GlobalPaths } from '../../global';
import scripting, { AssetChangeInfo } from '../../core/scripting';
import { startCompileScriptProcess } from '../../core/scripting/compile-process';
import { ProgrammingFacet } from '../../core/scripting/programming/Facet';
import { join } from 'path';
import { Engine } from '../../core/engine';

export type * from '../../core/scripting/interface';

export async function init(projectPath: string): Promise<void> {
    return await scripting.initialize(
        projectPath,
        GlobalPaths.enginePath,
        Engine.getConfig().includeModules);
}

let programmingFacet: ProgrammingFacet | null;

export async function createProgrammingFacet(): Promise<ProgrammingFacet> {
    const features = Engine.getConfig().includeModules || [];
    const enginePath = GlobalPaths.enginePath;

    programmingFacet = await ProgrammingFacet.create(
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
    const features = Engine.getConfig().includeModules;
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


