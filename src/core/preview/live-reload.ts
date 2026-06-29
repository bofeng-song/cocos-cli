import { socketService } from '../../server/socket';
import { invalidatePreviewSettings } from './preview-settings';

/**
 * 浏览器热重载。
 *
 * 对齐编辑器：脚本重编译完成或资源刷新结束后，通过 socket.io 广播 `browser:reload`，
 * 浏览器端收到后整页刷新。先清空预览 settings 缓存，保证刷新后取到最新数据。
 *
 * 注意：cocos-cli 没有逐资源级别的变更事件，`assets:refresh-finish` 是整批刷新结束的
 * 粗粒度信号，对整页刷新已足够。
 */
let timer: NodeJS.Timeout | null = null;
let registered = false;

function scheduleReload(): void {
    invalidatePreviewSettings();
    if (timer) {
        clearTimeout(timer);
    }
    // 去抖：编译/刷新可能短时间内多次触发，合并成一次刷新
    timer = setTimeout(() => {
        timer = null;
        socketService.io?.emit('browser:reload');
    }, 200);
}

/**
 * 主动触发一次浏览器热重载（去抖）。
 * 供扩展宿主映射 Creator 的预览刷新信号（preview/reload-terminal、scene/soft-reload）使用。
 */
export function triggerPreviewReload(): void {
    scheduleReload();
}

/**
 * 注册热重载监听。仅生效一次。
 */
export async function registerLiveReload(): Promise<void> {
    if (registered) {
        return;
    }
    registered = true;

    const { default: scripting } = await import('../scripting');
    const { assetDBManager } = await import('../assets');

    // 脚本重编译成功
    scripting.on('compiled', () => scheduleReload());
    // 资源批量刷新结束
    assetDBManager.on('assets:refresh-finish', () => scheduleReload());
}
