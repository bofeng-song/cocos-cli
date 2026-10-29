import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { EventEmitter } from 'events';
import { CompilationState } from '../compilation-state';

// Execute production methods without loading the engine and asset database.
const source = ts.createSourceFile('packer.ts', fs.readFileSync(path.join(__dirname, '../packer-driver/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
function method(name: string): string {
    let result = '';
    function visit(node: ts.Node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) result = node.getText(source);
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (!result) throw new Error('Missing production method: ' + name);
    return ts.transpileModule(`class Harness { ${result} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn new Harness();';
}

describe('script compilation failure recovery', () => {
    function driver(target: any) {
        const state = new CompilationState();
        const events = new EventEmitter();
        const compiled = jest.fn(); events.on('compiled', compiled);
        const driver = new Function('compilationState', 'eventEmitter', 'AssetActionEnum', method('_startBuild'))(state, events, { change: 'change' });
        const change = { filePath: 'Importer.ts', type: 'change' };
        Object.assign(driver, { _logger: { clear() {}, debug() {} }, _assetChangeQueue: [change], _beforeBuildTasks: [], _featureChanged: false, _targets: { preview: target }, beforeEditorBuildDelegate: { dispatch: async () => {} } });
        return { driver, change, state, compiled };
    }

    it('clears busy state, retains changes and preserves the original error, then retries', async () => {
        const error = new Error('Missing dependency');
        const target = { applyAssetChanges: jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined), build: jest.fn().mockResolvedValue({}) };
        const { driver: d, change, state, compiled } = driver(target);
        await expect(d._startBuild('failed-task')).rejects.toBe(error);
        expect(d._building).toBe(false);
        expect(d._currentTaskId).toBeNull();
        expect(d._assetChangeQueue).toEqual([change]);
        expect(compiled).not.toHaveBeenCalled();
        expect(state.getStatus()).toMatchObject({ state: 'failed', error: { message: error.message } });
        await d._startBuild('retry');
        expect(target.applyAssetChanges).toHaveBeenLastCalledWith([change]);
        expect(d._assetChangeQueue).toEqual([]);
        expect(state.getStatus()).toEqual({ state: 'ready', revision: 1 });
        expect(compiled).toHaveBeenCalledTimes(1);
    });

    it('does not publish success when a target returns an error', async () => {
        const error = Object.assign(new Error('Syntax error'), { file: 'Broken.ts' });
        const { driver: d, state, compiled } = driver({ applyAssetChanges: async () => {}, build: async () => ({ err: error }), deleteCacheFile: jest.fn() });
        await expect(d._startBuild()).rejects.toBe(error);
        expect(compiled).not.toHaveBeenCalled();
        expect(d._assetChangeQueue).toEqual([]);
        expect(state.getStatus()).toMatchObject({ state: 'failed', error: { file: 'Broken.ts' } });
    });

    it('does not re-register a rejected script when importing another script or fixing it later', async () => {
        const entries = new Set<string>();
        let broken = true;
        const error = Object.assign(new SyntaxError('Unexpected token'), { file: 'Broken.ts' });
        const target = {
            applyAssetChanges: jest.fn(async (changes: any[]) => {
                for (const change of changes) entries.add(change.filePath);
            }),
            build: jest.fn(async () => entries.has('Broken.ts') && broken ? { err: error } : {}),
            deleteCacheFile: jest.fn((file: string) => entries.delete(file)),
        };
        const { driver: d, state, compiled } = driver(target);
        const bad = { filePath: 'Broken.ts', type: 'change' };
        const good = { filePath: 'Good.ts', type: 'change' };
        d._assetChangeQueue = [bad];
        await expect(d._startBuild()).rejects.toBe(error);
        expect(entries.has('Broken.ts')).toBe(false);
        d._assetChangeQueue.push(good);
        await expect(d._startBuild()).resolves.toBeUndefined();
        expect(target.applyAssetChanges).toHaveBeenLastCalledWith([good]);
        expect(entries.has('Broken.ts')).toBe(false);
        expect(state.getStatus()).toMatchObject({ state: 'ready', revision: 1 });
        broken = false;
        d._assetChangeQueue.push(bad);
        await expect(d._startBuild()).resolves.toBeUndefined();
        expect(entries.has('Broken.ts')).toBe(true);
        expect(compiled).toHaveBeenCalledTimes(2);
    });

    it('retries an interrupted application across all targets before building any target', async () => {
        const error = new Error('Entry update failed');
        const first = { applyAssetChanges: jest.fn(async () => {}), build: jest.fn(async () => ({})) };
        const second = {
            applyAssetChanges: jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined),
            build: jest.fn(async () => ({})),
        };
        const { driver: d, change } = driver(first);
        d._targets = { editor: first, preview: second };
        await expect(d._startBuild()).rejects.toBe(error);
        expect(d._assetChangeQueue).toEqual([change]);
        expect(first.build).not.toHaveBeenCalled();
        expect(second.build).not.toHaveBeenCalled();
        await d._startBuild();
        expect(first.applyAssetChanges).toHaveBeenCalledTimes(2);
        expect(second.applyAssetChanges).toHaveBeenCalledTimes(2);
        expect(first.build).toHaveBeenCalledTimes(1);
        expect(second.build).toHaveBeenCalledTimes(1);
    });

    it('preserves newer queued changes without replaying applied changes or engine features', async () => {
        const error = Object.assign(new Error('Syntax error'), { file: 'Broken.ts' });
        const { driver: d, change } = driver({
            applyAssetChanges: async () => {},
            build: async () => { d._assetChangeQueue.push({ filePath: 'New.ts', type: 'change' }); return { err: error }; },
            deleteCacheFile: jest.fn(),
        });
        d._featureChanged = true;
        d._syncEngineFeatures = jest.fn(async () => {});
        await expect(d._startBuild()).rejects.toBe(error);
        expect(d._assetChangeQueue).toEqual([{ filePath: 'New.ts', type: 'change' }]);
        expect(d._assetChangeQueue).not.toContain(change);
        expect(d._featureChanged).toBe(false);
    });

    it('serializes overlapping iterations', async () => {
        const state = new CompilationState();
        let release!: () => void;
        const first = state.run(() => new Promise<void>(resolve => { release = resolve; }));
        const secondBuild = jest.fn(async () => {});
        const second = state.run(secondBuild);
        await Promise.resolve();
        expect(secondBuild).not.toHaveBeenCalled();
        expect(state.getStatus().state).toBe('compiling');
        release(); await Promise.all([first, second]);
        expect(state.getStatus()).toEqual({ state: 'ready', revision: 2 });
    });

    it.each([undefined, 42])('updates the entry with non-callable console timers (%s)', async timer => {
        const runtimeConsole = { time: timer, timeEnd: timer };
        const makeSource = () => 'export const value = 2;';
        const target = new Function('console', 'performance', 'makePrerequisiteImportsMod', 'makeTentativePrerequisiteImports', 'OPTIMIZE_ENTRY_SOURCE_COMPILATION', 'AssetActionEnum', method('applyAssetChanges'))(runtimeConsole, { now: () => 1 }, makeSource, makeSource, true, {});
        Object.assign(target, { _ensureIdle() {}, _getPrerequisiteAssetModsWithFilter: async () => [], _entryMod: { source: '' }, _entryModSource: '', _logger: { debug() {} } });
        await expect(target.applyAssetChanges([])).resolves.toBeUndefined();
        expect(target._entryMod.source).toBe(makeSource());
    });
});
