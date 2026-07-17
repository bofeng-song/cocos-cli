import { assetManager, EffectAsset } from 'cc';
import { BaseService, register } from './core';
import { Rpc } from '../rpc';
import { messageManager } from './message';

interface IEffectAssetInfo {
    uuid: string;
}

@register('Effect' as any)
export class EffectService extends BaseService<Record<string, any[]>> {
    private _uuidSet = new Set<string>();
    private _initialized = false;

    async init() {
        if (this._initialized) {
            return;
        }
        this._initialized = true;

        const uuids = await this.queryEffectUuids();
        await Promise.all(uuids.map((uuid) => this.registerEffect(uuid)));
    }

    public registerEffects(uuids: string[]) {
        uuids.forEach((uuid) => {
            void this.registerEffect(uuid);
        });
    }

    public registerEffect(uuid: string) {
        return new Promise<void>((resolve) => {
            if (!uuid) {
                resolve();
                return;
            }

            assetManager.loadAny(uuid, (err: any) => {
                if (err) {
                    console.error(err);
                    resolve();
                    return;
                }
                this._uuidSet.add(uuid);
                messageManager.broadcast('scene:effect-update', uuid);
                resolve();
            });
        });
    }

    public removeEffect(uuid: string) {
        if (!this._uuidSet.has(uuid)) {
            return false;
        }
        if (EffectAsset && EffectAsset.remove) {
            this._uuidSet.delete(uuid);
            EffectAsset.remove(uuid);
            messageManager.broadcast('scene:effect-update', uuid);
            return true;
        }
        console.warn('cannot call method cc.EffectAsset.remove');
        return false;
    }

    public removeEffects(uuids: string[]) {
        uuids.forEach((uuid) => {
            this.removeEffect(uuid);
        });
    }

    public updateEffect(uuid: string) {
        this.removeEffect(uuid);
        void this.registerEffect(uuid);
    }

    private async queryEffectUuids(): Promise<string[]> {
        try {
            const assets = await Rpc.getInstance().request('assetManager', 'queryAssetInfos', [{
                importer: 'effect',
                ccType: 'cc.EffectAsset',
            }]) as IEffectAssetInfo[];
            return (assets || [])
                .map((asset) => asset.uuid)
                .filter((uuid): uuid is string => typeof uuid === 'string' && uuid.length > 0);
        } catch (err) {
            console.warn('[Effect] Failed to query effects:', err);
            return [];
        }
    }
}
