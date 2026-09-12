const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { wrap } = require('node:module');
const yaml = require('js-yaml');

const source = fs.readFileSync(path.join(__dirname, 'postinstall.js'), 'utf8');

async function runPostinstall(env = {}, development = true) {
    const calls = [];
    let complete;
    const completed = new Promise(resolve => { complete = resolve; });
    const utils = {
        hasDevelopmentEnvironment: () => development,
        runCommand: async (command, args) => { calls.push({ command, args: Array.from(args) }); },
    };
    const requireMock = name => {
        if (name === './utils') return utils;
        if (name === 'readline') return {
            createInterface: () => ({ question: (_prompt, answer) => answer('n'), close() {} }),
        };
        throw new Error(`Unexpected dependency: ${name}`);
    };
    const execute = vm.runInNewContext(wrap(source), {
        process: { env, stdin: {}, stdout: {} },
        console: { log: message => { if (message.includes('所有模块构建完成')) complete(); } },
        setTimeout: () => 1,
        clearTimeout() {},
    });
    const module = { exports: {} };
    execute(module.exports, requireMock, module, path.join(__dirname, 'postinstall.js'), __dirname);
    if (development) await completed;
    return calls;
}

function scripts(calls) {
    return calls.map(call => call.args.find(arg => arg.startsWith('./workflow/')));
}

const preparation = [
    './workflow/compiler-engine.js',
    './workflow/build-cc-module.js',
    './workflow/generate-i18n-types.js',
];

test('normal local installation still builds the CLI and downloads tools', async () => {
    assert.deepEqual(scripts(await runPostinstall()), [
        ...preparation, './workflow/build-ts.js', './workflow/download-tools.js',
    ]);
});

test('only an explicit true defers the postinstall build', async () => {
    for (const value of ['false', '0', '']) {
        assert.ok(scripts(await runPostinstall({ COCOS_SKIP_POSTINSTALL_BUILD: value })).includes('./workflow/build-ts.js'));
    }
    assert.deepEqual(scripts(await runPostinstall({ COCOS_SKIP_POSTINSTALL_BUILD: 'true' })), [
        ...preparation, './workflow/download-tools.js',
    ]);
});

test('deferring the CLI build preserves forced preparation and minimal downloads', async () => {
    const calls = await runPostinstall({
        COCOS_SKIP_POSTINSTALL_BUILD: 'true', FORCE_UPDATE: 'true', MINIMAL_DOWNLOAD_TOOLS: 'true',
    });
    assert.equal(calls.length, 4);
    assert.ok(calls.every(call => call.command === 'node' && call.args.includes('--force')));
    assert.ok(calls[0].args.includes('--max-old-space-size=8192'));
    assert.deepEqual(calls.at(-1).args, ['./workflow/download-tools.js', '--force', '--minimal']);
});

test('non-development installations remain a no-op', async () => {
    assert.deepEqual(await runPostinstall({}, false), []);
    assert.deepEqual(await runPostinstall({ COCOS_SKIP_POSTINSTALL_BUILD: 'true' }, false), []);
});

test('shared CI setup prepares dependencies and tools before exactly one explicit build', async () => {
    const action = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/actions/setup-env/action.yml'), 'utf8'));
    const steps = action.runs.steps;
    const installs = steps.filter(step => step.run === 'npm ci');
    assert.equal(installs.length, 1);
    const install = installs[0];
    const calls = await runPostinstall(install.env);
    assert.deepEqual(scripts(calls), [...preparation, './workflow/download-tools.js']);
    const builds = steps.filter(step => step.run === 'npm run build');
    assert.equal(builds.length, 1);
    assert.ok(steps.indexOf(install) < steps.indexOf(builds[0]));
    assert.ok(!builds[0].env?.COCOS_SKIP_POSTINSTALL_BUILD);
});

test('DTS publishing reuses the installation from shared setup', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/publish-dts.yml'), 'utf8'));
    const steps = workflow.jobs.publish.steps;
    const setup = steps.findIndex(step => step.uses === './.github/actions/setup-env');
    assert.ok(setup >= 0);
    assert.ok(!steps.slice(setup + 1).some(step => step.run === 'npm ci' && !step['working-directory']));
    assert.ok(steps.slice(setup + 1).some(step => step.run === 'npm run generate:dts'));
});
