import scripting from '../../core/scripting';
import { GlobalPaths } from '../../global';
import { AssetChangeInfo } from '../../core/scripting';
import { startCompileScriptProcess } from '../../core/scripting/compile-process';

export class ProgrammingApi {
    /**
     * 编译项目脚本 (阻塞主进程)
     */
    public async compile() {
        await scripting.compileScripts();
    }
    
    /**
     * 在独立的子进程中运行项目脚本编译
     * 以避免阻塞主进程
     */
    public async startCompileProcess(assetChanges?: AssetChangeInfo[]) {
        // 由于是新进程，需要传递初始化参数
        // 这里的 features 我们通过 CCEModuleMap 或者简化的配置来获取
        // 对于预览/打包，如果是完整的功能，通常可以传空数组或从配置读取
        const features = Object.keys(scripting.queryCCEModuleMap() || {});
        
        await startCompileScriptProcess({
            projectPath: GlobalPaths.workspace,
            enginePath: GlobalPaths.enginePath,
            features,
            assetChanges
        });
    }

    /**
     * 获取指定目标的 Loader 上下文 (序列化后的)
     * @param targetName 目标名称，如 'editor' 或 'preview'
     */
    public getLoaderContext(targetName: string) {
        return scripting.getPackerDriverLoaderContext(targetName);
    }

    /**
     * 检查编译状态
     */
    public isCompiling() {
        return scripting.isCompiling();
    }
}
