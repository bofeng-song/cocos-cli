import { startCompileEngineProcess } from '../../core/engine/compile-process';

export class EngineApi {

    /**
     * 在独立的子进程中运行引擎编译
     * 以避免阻塞主进程
     */
    public async startCompileProcess(force: boolean = false) {
        await startCompileEngineProcess(force);
    }
}
