const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function cacheKey(entry, cli, scripts, environment = process.env) {
    const files = cli.files.filter(file => file.path.startsWith('packages/engine-compiler/') || file.path.startsWith('node_modules/') || file.path.startsWith('static/tools/'));
    return 'engine-sdk-v2-' + hash(JSON.stringify({
        repository: entry.repository, commit: entry.commit, external: entry.external, version: entry.version,
        platform: process.platform, arch: process.arch, node: process.version,
        abi: process.versions.modules, files, scripts,
        toolsMode: environment.MINIMAL_DOWNLOAD_TOOLS || '',
        spine: environment.SIMULATOR_SPINE_FEATURE || '',
        image: [environment.ImageOS || '', environment.ImageVersion || ''],
    }));
}

async function checkFiles(directory, descriptor) {
    const { validateManifest, describeArtifact } = require('./sdk-matrix');
    const current = await describeArtifact(directory, 'engine');
    if (current.manifestSha256 !== descriptor.manifestSha256) throw Error('Cached SDK manifest changed');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'engine-sdk.json'), 'utf8'));
    validateManifest(manifest, descriptor, 'engine');
    for (const entry of manifest.files) {
        const file = path.join(directory, entry.path);
        const stat = fs.lstatSync(file);
        const relative = path.relative(fs.realpathSync(directory), fs.realpathSync(file));
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Cached SDK link escapes root');
        if (process.platform !== 'win32' && (stat.mode & 0o777) !== entry.mode) throw Error('Cached SDK file mode changed');
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) throw Error('Cached SDK file changed: ' + entry.path);
        const digest = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
        if (digest.digest('hex') !== entry.sha256) throw Error('Cached SDK content changed: ' + entry.path);
    }
    return current;
}

function storageKey(key) {
    return process.env.GITHUB_RUN_ID ? key + '-' + process.env.GITHUB_RUN_ID + '-' + (process.env.GITHUB_RUN_ATTEMPT || '1') : key;
}

async function restore(key, directory, client = require('@actions/cache')) {
    const start = Date.now();
    try {
        if (!await client.restoreCache([directory], storageKey(key), [key + '-'])) return null;
        const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'cache.json'), 'utf8'));
        if (metadata.key !== key) throw Error('Cached build identity mismatch');
        const { extract } = require('./sdk-ci-shards');
        const sdk = directory + '.sdk';
        await extract(directory, 'engine.tar', sdk, metadata.archiveSha256);
        const descriptor = await checkFiles(sdk, metadata.descriptor);
        console.log('[Engine SDK cache] hit ' + key + ' in ' + (Date.now() - start) + 'ms');
        return { ...descriptor, preparedArchive: { location: path.join(directory, 'engine.tar'), sha256: metadata.archiveSha256 } };
    } catch (error) {
        console.warn('[Engine SDK cache] restore rejected; rebuilding: ' + error.message);
        return null;
    }
}

async function save(key, directory, descriptor, client = require('@actions/cache')) {
    try {
        // Save only tar and its identity record; never cache writable test directories.
        const output = directory;
        fs.mkdirSync(output, { recursive: true });
        const { archive } = require('./sdk-ci-shards');
        const tar = path.join(output, 'engine.tar');
        archive(descriptor.location, tar);
        const digest = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(tar)) digest.update(chunk);
        const archiveSha256 = digest.digest('hex');
        fs.writeFileSync(path.join(output, 'cache.json'), JSON.stringify({ key, descriptor, archiveSha256 }));
        try { await client.saveCache([output], storageKey(key)); }
        catch (error) { console.warn('[Engine SDK cache] upload skipped: ' + error.message); }
        return { location: tar, sha256: archiveSha256 };
    } catch (error) { console.warn('[Engine SDK cache] save skipped: ' + error.message); }
}
module.exports = { cacheKey, checkFiles, restore, save };
