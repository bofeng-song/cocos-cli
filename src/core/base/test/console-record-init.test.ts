import { Console } from 'console';
import { PassThrough } from 'stream';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Use the production console implementation and native timer methods, without Launcher initialization.
describe('console recording initialization', () => {
    let originalConsole: Console;
    let nativeConsole: Console;
    let output: PassThrough;
    let logger: import('../console').NewConsole;
    let tempDir: string;

    beforeEach(() => {
        originalConsole = globalThis.console;
        output = new PassThrough();
        nativeConsole = new Console(output, output);
        globalThis.console = nativeConsole;
        tempDir = mkdtempSync(join(tmpdir(), 'cli-console-init-'));
        jest.isolateModules(() => {
            const { NewConsole } = require('../console') as typeof import('../console');
            logger = new NewConsole();
        });
    });

    afterEach(() => {
        try {
            if ((logger as any)._start) logger.stopRecord();
            logger.flush();
        } finally {
            globalThis.console = originalConsole;
            output.destroy();
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    function checkTimers(label: string): void {
        expect(typeof console.time).toBe('function');
        expect(typeof console.timeEnd).toBe('function');
        expect(() => {
            console.time(label);
            console.timeEnd(label);
        }).not.toThrow();
    }

    it('preserves native timers on first recording and restores the original console', () => {
        expect(logger._init).toBe(false);
        const restore = logger.createLogSinkRestorer();
        logger.record(join(tempDir, 'first.log'));
        expect(logger._init).toBe(true);
        expect(globalThis.console).toBe(logger);
        checkTimers('first-record');
        expect(output.read()?.toString()).toContain('first-record:');
        restore();
        restore();
        expect(globalThis.console).toBe(nativeConsole);
        expect((logger as any)._start).toBe(false);
        checkTimers('after-restore');
    });

    it('keeps timers and the previous sink across repeated recording and temporary switches', () => {
        const first = join(tempDir, 'first.log');
        logger.record(first);
        const restore = logger.createLogSinkRestorer();
        logger.record(join(tempDir, 'second.log'));
        checkTimers('second-record');
        restore();
        restore();
        expect((logger as any).logDest).toBe(first);
        expect(globalThis.console).toBe(logger);
        checkTimers('restored-sink');
        logger.stopRecord();
        logger.record(join(tempDir, 'third.log'));
        checkTimers('restarted-record');
    });

    it('preserves an existing Launcher initialization', () => {
        logger.init(join(tempDir, 'launcher.log'), true);
        logger.record(join(tempDir, 'build.log'));
        expect((logger as any).cacheLogs).toBe(true);
        checkTimers('launcher-record');
    });

    it('initializes before handing the console to a host switchConsole hook', () => {
        const switchConsole = jest.fn();
        (nativeConsole as any).switchConsole = switchConsole;
        logger.record(join(tempDir, 'host.log'));
        expect(switchConsole).toHaveBeenCalledWith(logger);
        expect(logger._init).toBe(true);
        expect(typeof (logger as any).time).toBe('function');
        expect(() => {
            (logger as any).time('host-record');
            (logger as any).timeEnd('host-record');
        }).not.toThrow();
    });
});
