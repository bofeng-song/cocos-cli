import ps from 'path';
import { ProgrammingFacet } from './Facet';
import ScriptManager from '../index';


let programmingFacet: ProgrammingFacet | null;
let createProgrammingFacetPromise: Promise<void> | null = null;

// Mock Editor if not exists (for CLI environment)
// This is used by the main process to delegate IPC requests from child processes
if (typeof Editor === 'undefined') {
    (globalThis as any).Editor = {
        Message: {
            async request(pkg: string, message: string, ...args: any[]) {
                console.warn(`[Editor Mock Main] Requesting ${pkg}:${message}`);
                if (pkg === 'engine' && message === 'query-engine-info') {
                    const { GlobalPaths } = await import('../../../global');
                    return {
                        typescript: {
                            path: GlobalPaths.enginePath,
                        }
                    };
                }
                if (pkg === 'engine' && message === 'query-engine-modules-profile') {
                    const { Engine } = await import('../../engine');
                    return { includeModules: Engine.getConfig().includeModules || [] };
                }
                if (pkg === 'programming') {
                    if (message === 'packer-driver/get-loader-context') {
                        return ScriptManager.getPackerDriverLoaderContext(args[0]);
                    }
                }
                return {};
            }
        }
    };
}

export async function createProgrammingFacet() {
    const { GlobalPaths } = await import('../../../global');
    const features = (await Editor.Message.request('engine', 'query-engine-modules-profile'))?.includeModules || [];

    programmingFacet = await ProgrammingFacet.create(
        {
            root: GlobalPaths.enginePath,
            distRoot: ps.join(GlobalPaths.enginePath, 'bin', '.cache', 'dev', 'preview'),
            baseUrl: '/scripting/engine',
            features,
        },
        GlobalPaths.workspace
    );
}

export async function waitForProgrammingFacet() {
    if (!createProgrammingFacetPromise) {
        createProgrammingFacetPromise = createProgrammingFacet();
    }
    await createProgrammingFacetPromise;
    return programmingFacet!;
}

export function getPreviewFacet() {
    return programmingFacet;
}
