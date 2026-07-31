const path = require('path');
const fs = require('fs-extra');
const Module = require('module');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { buildEngine, StatsQuery } = require('@cocos/ccbuild');

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, '..');
const engineDir = path.join(rootDir, 'packages', 'engine');
const packageRoot = path.join(rootDir, 'dist-npm', 'cocos');
const packageDist = path.join(packageRoot, 'dist');
const engineOut = path.join(packageDist, 'engine');
const packedPackage = path.join(packageRoot, 'cocos.tgz');
const enginePackageJson = require(path.join(engineDir, 'package.json'));

function hasArg(name) {
    return process.argv.includes(name);
}

function getArgValue(name, defaultValue) {
    const prefix = `${name}=`;
    const arg = process.argv.find((item) => item.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
}

function createPackageJson(version) {
    return {
        name: 'cocos',
        version,
        description: 'Cocos web-mobile engine runtime.',
        type: 'module',
        main: './dist/index.js',
        module: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
            '.': {
                types: './dist/index.d.ts',
                import: './dist/index.js',
            },
        },
        sideEffects: true,
        files: [
            'dist',
        ],
        license: enginePackageJson.license || 'MIT',
    };
}

async function copyDeclarations() {
    const declarationSource = path.join(engineDir, 'bin', '.declarations', 'cc.d.ts');
    const declarationTarget = path.join(packageDist, 'cc.d.ts');

    if (await fs.pathExists(declarationSource)) {
        await fs.copyFile(declarationSource, declarationTarget);
    } else {
        console.warn(`[npm-web-mobile] Missing declaration file: ${declarationSource}`);
        await fs.outputFile(declarationTarget, 'declare module "cc" {}\n', 'utf8');
    }

    await fs.outputFile(
        path.join(packageDist, 'index.d.ts'),
        [
            '/// <reference path="./cc.d.ts" />',
            "import * as cc from 'cc';",
            'export default cc;',
            "export * from 'cc';",
            '',
        ].join('\n'),
        'utf8',
    );
}

function stripBlockComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripLineComment(line) {
    return line.replace(/\/\/.*$/, '').trim();
}

function createEnum(body) {
    const result = {};
    const names = [];
    let previous = -1;
    const members = stripBlockComments(body).split(',');

    for (const rawMember of members) {
        const member = stripLineComment(rawMember);
        if (!member) {
            continue;
        }

        const parts = member.split('=');
        const name = parts[0].trim();
        if (!name) {
            continue;
        }

        let value;
        if (parts.length > 1) {
            const expression = parts.slice(1).join('=').trim();
            const args = names;
            const values = names.map((enumName) => result[enumName]);
            value = Function(...args, `"use strict"; return (${expression});`)(...values);
        } else {
            value = previous + 1;
        }

        result[name] = value;
        result[value] = name;
        names.push(name);
        previous = value;
    }

    return result;
}

function readEnum(source, enumName) {
    const match = source.match(new RegExp(`export\\s+enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!match) {
        throw new Error(`Failed to read enum ${enumName}`);
    }

    return createEnum(match[1]);
}

function murmurhash2_32_gc(input, seed) {
    let length = input.length;
    let hash = seed ^ length;
    let index = 0;
    const getUint8 = typeof input === 'string'
        ? String.prototype.charCodeAt
        : function getUint8ForArray(idx) { return this[idx]; };

    while (length >= 4) {
        let k = ((getUint8.call(input, index) & 0xff))
            | ((getUint8.call(input, ++index) & 0xff) << 8)
            | ((getUint8.call(input, ++index) & 0xff) << 16)
            | ((getUint8.call(input, ++index) & 0xff) << 24);

        k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));
        k ^= k >>> 24;
        k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));

        hash = (((hash & 0xffff) * 0x5bd1e995) + ((((hash >>> 16) * 0x5bd1e995) & 0xffff) << 16)) ^ k;

        length -= 4;
        ++index;
    }

    switch (length) {
        case 3:
            hash ^= (getUint8.call(input, index + 2) & 0xff) << 16;
        // falls through
        case 2:
            hash ^= (getUint8.call(input, index + 1) & 0xff) << 8;
        // falls through
        case 1:
            hash ^= (getUint8.call(input, index) & 0xff);
            hash = (((hash & 0xffff) * 0x5bd1e995) + ((((hash >>> 16) * 0x5bd1e995) & 0xffff) << 16));
            break;
        default:
            break;
    }

    hash ^= hash >>> 13;
    hash = (((hash & 0xffff) * 0x5bd1e995) + ((((hash >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    hash ^= hash >>> 15;

    return hash >>> 0;
}

function createFormatInfos(source, FormatType) {
    class FormatInfo {
        constructor(
            name = '',
            size = 0,
            count = 0,
            type = FormatType.NONE,
            hasAlpha = false,
            hasDepth = false,
            hasStencil = false,
            isCompressed = false,
        ) {
            this.name = name;
            this.size = size;
            this.count = count;
            this.type = type;
            this.hasAlpha = hasAlpha;
            this.hasDepth = hasDepth;
            this.hasStencil = hasStencil;
            this.isCompressed = isCompressed;
        }
    }

    const createFormatInfo = (...args) => new FormatInfo(...args);
    const createFormatInfo_ASTC_SRGBA = (nameSuffix) => new FormatInfo(`ASTC_SRGBA_${nameSuffix.toUpperCase()}`, 1, 4, FormatType.UNORM, true, false, false, true);
    const createFormatInfo_ASTC_RGBA = (nameSuffix) => new FormatInfo(`ASTC_RGBA_${nameSuffix.toUpperCase()}`, 1, 4, FormatType.UNORM, true, false, false, true);
    const match = source.match(/export const FormatInfos = Object\.freeze\(\[([\s\S]*?)\]\);/);

    if (!match) {
        throw new Error('Failed to read FormatInfos');
    }

    return Function(
        'FormatType',
        'createFormatInfo',
        'createFormatInfo_ASTC_SRGBA',
        'createFormatInfo_ASTC_RGBA',
        `"use strict"; return [${match[1]}];`,
    )(FormatType, createFormatInfo, createFormatInfo_ASTC_SRGBA, createFormatInfo_ASTC_RGBA);
}

function createEffectCompilerMappings() {
    const gfxDefine = fs.readFileSync(path.join(engineDir, 'cocos', 'gfx', 'base', 'define.ts'), 'utf8');
    const renderingDefine = fs.readFileSync(path.join(engineDir, 'cocos', 'rendering', 'define.ts'), 'utf8');

    const Format = readEnum(gfxDefine, 'Format');
    const FormatType = readEnum(gfxDefine, 'FormatType');
    const Type = readEnum(gfxDefine, 'Type');
    const MemoryAccessBit = readEnum(gfxDefine, 'MemoryAccessBit');
    const Filter = readEnum(gfxDefine, 'Filter');
    const Address = readEnum(gfxDefine, 'Address');
    const ComparisonFunc = readEnum(gfxDefine, 'ComparisonFunc');
    const StencilOp = readEnum(gfxDefine, 'StencilOp');
    const BlendFactor = readEnum(gfxDefine, 'BlendFactor');
    const BlendOp = readEnum(gfxDefine, 'BlendOp');
    const ColorMask = readEnum(gfxDefine, 'ColorMask');
    const ShaderStageFlagBit = readEnum(gfxDefine, 'ShaderStageFlagBit');
    const PrimitiveMode = readEnum(gfxDefine, 'PrimitiveMode');
    const PolygonMode = readEnum(gfxDefine, 'PolygonMode');
    const ShadeModel = readEnum(gfxDefine, 'ShadeModel');
    const CullMode = readEnum(gfxDefine, 'CullMode');
    const DynamicStateFlagBit = readEnum(gfxDefine, 'DynamicStateFlagBit');
    const DescriptorType = readEnum(gfxDefine, 'DescriptorType');
    const RenderPassStage = readEnum(renderingDefine, 'RenderPassStage');
    const RenderPriority = readEnum(renderingDefine, 'RenderPriority');
    const SetIndex = readEnum(renderingDefine, 'SetIndex');
    const FormatInfos = createFormatInfos(gfxDefine, FormatType);

    const typeMap = {};
    typeMap[typeMap.bool = Type.BOOL] = 'bool';
    typeMap[typeMap.bvec2 = Type.BOOL2] = 'bvec2';
    typeMap[typeMap.bvec3 = Type.BOOL3] = 'bvec3';
    typeMap[typeMap.bvec4 = Type.BOOL4] = 'bvec4';
    typeMap[typeMap.int = Type.INT] = 'int';
    typeMap[typeMap.ivec2 = Type.INT2] = 'ivec2';
    typeMap[typeMap.ivec3 = Type.INT3] = 'ivec3';
    typeMap[typeMap.ivec4 = Type.INT4] = 'ivec4';
    typeMap[typeMap.uint = Type.UINT] = 'uint';
    typeMap[typeMap.uvec2 = Type.UINT2] = 'uvec2';
    typeMap[typeMap.uvec3 = Type.UINT3] = 'uvec3';
    typeMap[typeMap.uvec4 = Type.UINT4] = 'uvec4';
    typeMap[typeMap.float = Type.FLOAT] = 'float';
    typeMap[typeMap.vec2 = Type.FLOAT2] = 'vec2';
    typeMap[typeMap.vec3 = Type.FLOAT3] = 'vec3';
    typeMap[typeMap.vec4 = Type.FLOAT4] = 'vec4';
    typeMap[typeMap.mat2 = Type.MAT2] = 'mat2';
    typeMap[typeMap.mat3 = Type.MAT3] = 'mat3';
    typeMap[typeMap.mat4 = Type.MAT4] = 'mat4';
    typeMap[typeMap.mat2x3 = Type.MAT2X3] = 'mat2x3';
    typeMap[typeMap.mat2x4 = Type.MAT2X4] = 'mat2x4';
    typeMap[typeMap.mat3x2 = Type.MAT3X2] = 'mat3x2';
    typeMap[typeMap.mat3x4 = Type.MAT3X4] = 'mat3x4';
    typeMap[typeMap.mat4x2 = Type.MAT4X2] = 'mat4x2';
    typeMap[typeMap.mat4x3 = Type.MAT4X3] = 'mat4x3';
    typeMap[typeMap.sampler1D = Type.SAMPLER1D] = 'sampler1D';
    typeMap[typeMap.sampler1DArray = Type.SAMPLER1D_ARRAY] = 'sampler1DArray';
    typeMap[typeMap.sampler2D = Type.SAMPLER2D] = 'sampler2D';
    typeMap[typeMap.sampler2DArray = Type.SAMPLER2D_ARRAY] = 'sampler2DArray';
    typeMap[typeMap.sampler3D = Type.SAMPLER3D] = 'sampler3D';
    typeMap[typeMap.samplerCube = Type.SAMPLER_CUBE] = 'samplerCube';
    typeMap[typeMap.sampler = Type.SAMPLER] = 'sampler';
    typeMap[typeMap.texture1D = Type.TEXTURE1D] = 'texture1D';
    typeMap[typeMap.texture1DArray = Type.TEXTURE1D_ARRAY] = 'texture1DArray';
    typeMap[typeMap.texture2D = Type.TEXTURE2D] = 'texture2D';
    typeMap[typeMap.texture2DArray = Type.TEXTURE2D_ARRAY] = 'texture2DArray';
    typeMap[typeMap.texture3D = Type.TEXTURE3D] = 'texture3D';
    typeMap[typeMap.textureCube = Type.TEXTURE_CUBE] = 'textureCube';
    typeMap[typeMap.image1D = Type.IMAGE1D] = 'image1D';
    typeMap[typeMap.image1DArray = Type.IMAGE1D_ARRAY] = 'image1DArray';
    typeMap[typeMap.image2D = Type.IMAGE2D] = 'image2D';
    typeMap[typeMap.image2DArray = Type.IMAGE2D_ARRAY] = 'image2DArray';
    typeMap[typeMap.image3D = Type.IMAGE3D] = 'image3D';
    typeMap[typeMap.imageCube = Type.IMAGE_CUBE] = 'imageCube';
    typeMap[typeMap.subpassInput = Type.SUBPASS_INPUT] = 'subpassInput';
    typeMap.int8_t = Type.INT;
    typeMap.i8vec2 = Type.INT2;
    typeMap.i8vec3 = Type.INT3;
    typeMap.i8vec4 = Type.INT4;
    typeMap.uint8_t = Type.UINT;
    typeMap.u8vec2 = Type.UINT2;
    typeMap.u8vec3 = Type.UINT3;
    typeMap.u8vec4 = Type.UINT4;
    typeMap.int16_t = Type.INT;
    typeMap.i16vec2 = Type.INT2;
    typeMap.i16vec3 = Type.INT3;
    typeMap.i16vec4 = Type.INT4;
    typeMap.uint16_t = Type.INT;
    typeMap.u16vec2 = Type.UINT2;
    typeMap.u16vec3 = Type.UINT3;
    typeMap.u16vec4 = Type.UINT4;
    typeMap.float16_t = Type.FLOAT;
    typeMap.f16vec2 = Type.FLOAT2;
    typeMap.f16vec3 = Type.FLOAT3;
    typeMap.f16vec4 = Type.FLOAT4;
    typeMap.mat2x2 = Type.MAT2;
    typeMap.mat3x3 = Type.MAT3;
    typeMap.mat4x4 = Type.MAT4;
    typeMap.isampler1D = Type.SAMPLER1D;
    typeMap.usampler1D = Type.SAMPLER1D;
    typeMap.sampler1DShadow = Type.SAMPLER1D;
    typeMap.isampler1DArray = Type.SAMPLER1D_ARRAY;
    typeMap.usampler1DArray = Type.SAMPLER1D_ARRAY;
    typeMap.sampler1DArrayShadow = Type.SAMPLER1D_ARRAY;
    typeMap.isampler2D = Type.SAMPLER2D;
    typeMap.usampler2D = Type.SAMPLER2D;
    typeMap.sampler2DShadow = Type.SAMPLER2D;
    typeMap.isampler2DArray = Type.SAMPLER2D_ARRAY;
    typeMap.usampler2DArray = Type.SAMPLER2D_ARRAY;
    typeMap.sampler2DArrayShadow = Type.SAMPLER2D_ARRAY;
    typeMap.isampler3D = Type.SAMPLER3D;
    typeMap.usampler3D = Type.SAMPLER3D;
    typeMap.isamplerCube = Type.SAMPLER_CUBE;
    typeMap.usamplerCube = Type.SAMPLER_CUBE;
    typeMap.samplerCubeShadow = Type.SAMPLER_CUBE;
    typeMap.iimage2D = Type.IMAGE2D;
    typeMap.uimage2D = Type.IMAGE2D;
    typeMap.usubpassInput = Type.SUBPASS_INPUT;
    typeMap.isubpassInput = Type.SUBPASS_INPUT;

    const formatMap = {
        bool: Format.R8,
        bvec2: Format.RG8,
        bvec3: Format.RGB8,
        bvec4: Format.RGBA8,
        int: Format.R32I,
        ivec2: Format.RG32I,
        ivec3: Format.RGB32I,
        ivec4: Format.RGBA32I,
        uint: Format.R32UI,
        uvec2: Format.RG32UI,
        uvec3: Format.RGB32UI,
        uvec4: Format.RGBA32UI,
        float: Format.R32F,
        vec2: Format.RG32F,
        vec3: Format.RGB32F,
        vec4: Format.RGBA32F,
        int8_t: Format.R8I,
        i8vec2: Format.RG8I,
        i8vec3: Format.RGB8I,
        i8vec4: Format.RGBA8I,
        uint8_t: Format.R8UI,
        u8vec2: Format.RG8UI,
        u8vec3: Format.RGB8UI,
        u8vec4: Format.RGBA8UI,
        int16_t: Format.R16I,
        i16vec2: Format.RG16I,
        i16vec3: Format.RGB16I,
        i16vec4: Format.RGBA16I,
        uint16_t: Format.R16UI,
        u16vec2: Format.RG16UI,
        u16vec3: Format.RGB16UI,
        u16vec4: Format.RGBA16UI,
        float16_t: Format.R16F,
        f16vec2: Format.RG16F,
        f16vec3: Format.RGB16F,
        f16vec4: Format.RGBA16F,
        mat2: Format.RGBA32F,
        mat3: Format.RGBA32F,
        mat4: Format.RGBA32F,
        mat2x2: Format.RGBA32F,
        mat3x3: Format.RGBA32F,
        mat4x4: Format.RGBA32F,
        mat2x3: Format.RGBA32F,
        mat2x4: Format.RGBA32F,
        mat3x2: Format.RGBA32F,
        mat3x4: Format.RGBA32F,
        mat4x2: Format.RGBA32F,
        mat4x3: Format.RGBA32F,
    };

    const type2size = [
        0, 4, 8, 12, 16, 4, 8, 12, 16, 4, 8, 12, 16, 4, 8, 12, 16,
        16, 24, 32, 24, 36, 48, 32, 48, 64, 4, 4, 4, 4, 4, 4,
    ];

    class SamplerInfo {
        constructor(
            minFilter = Filter.LINEAR,
            magFilter = Filter.LINEAR,
            mipFilter = Filter.NONE,
            addressU = Address.WRAP,
            addressV = Address.WRAP,
            addressW = Address.WRAP,
            maxAnisotropy = 0,
            cmpFunc = ComparisonFunc.ALWAYS,
        ) {
            this.minFilter = minFilter;
            this.magFilter = magFilter;
            this.mipFilter = mipFilter;
            this.addressU = addressU;
            this.addressV = addressV;
            this.addressW = addressW;
            this.maxAnisotropy = maxAnisotropy;
            this.cmpFunc = cmpFunc;
        }
    }

    const Sampler = {
        computeHash(info) {
            let hash = info.minFilter;
            hash |= info.magFilter << 2;
            hash |= info.mipFilter << 4;
            hash |= info.addressU << 6;
            hash |= info.addressV << 8;
            hash |= info.addressW << 10;
            hash |= Math.min(info.maxAnisotropy, 16) << 12;
            hash |= info.cmpFunc << 17;
            return hash;
        },
    };

    const effectStructure = {
        $techniques: [
            {
                $passes: [
                    {
                        depthStencilState: {},
                        rasterizerState: {},
                        blendState: { targets: [{}] },
                        properties: { any: { sampler: {}, editor: {} } },
                        migrations: { properties: { any: {} }, macros: { any: {} } },
                        embeddedMacros: {},
                    },
                ],
            },
        ],
    };

    const passParams = {
        NONE: ColorMask.NONE,
        R: ColorMask.R,
        G: ColorMask.G,
        B: ColorMask.B,
        A: ColorMask.A,
        RG: ColorMask.R | ColorMask.G,
        RB: ColorMask.R | ColorMask.B,
        RA: ColorMask.R | ColorMask.A,
        GB: ColorMask.G | ColorMask.B,
        GA: ColorMask.G | ColorMask.A,
        BA: ColorMask.B | ColorMask.A,
        RGB: ColorMask.R | ColorMask.G | ColorMask.B,
        RGA: ColorMask.R | ColorMask.G | ColorMask.A,
        RBA: ColorMask.R | ColorMask.B | ColorMask.A,
        GBA: ColorMask.G | ColorMask.B | ColorMask.A,
        ALL: ColorMask.ALL,
        ADD: BlendOp.ADD,
        SUB: BlendOp.SUB,
        REV_SUB: BlendOp.REV_SUB,
        MIN: BlendOp.MIN,
        MAX: BlendOp.MAX,
        ZERO: BlendFactor.ZERO,
        ONE: BlendFactor.ONE,
        SRC_ALPHA: BlendFactor.SRC_ALPHA,
        DST_ALPHA: BlendFactor.DST_ALPHA,
        ONE_MINUS_SRC_ALPHA: BlendFactor.ONE_MINUS_SRC_ALPHA,
        ONE_MINUS_DST_ALPHA: BlendFactor.ONE_MINUS_DST_ALPHA,
        SRC_COLOR: BlendFactor.SRC_COLOR,
        DST_COLOR: BlendFactor.DST_COLOR,
        ONE_MINUS_SRC_COLOR: BlendFactor.ONE_MINUS_SRC_COLOR,
        ONE_MINUS_DST_COLOR: BlendFactor.ONE_MINUS_DST_COLOR,
        SRC_ALPHA_SATURATE: BlendFactor.SRC_ALPHA_SATURATE,
        CONSTANT_COLOR: BlendFactor.CONSTANT_COLOR,
        ONE_MINUS_CONSTANT_COLOR: BlendFactor.ONE_MINUS_CONSTANT_COLOR,
        CONSTANT_ALPHA: BlendFactor.CONSTANT_ALPHA,
        ONE_MINUS_CONSTANT_ALPHA: BlendFactor.ONE_MINUS_CONSTANT_ALPHA,
        KEEP: StencilOp.KEEP,
        REPLACE: StencilOp.REPLACE,
        INCR: StencilOp.INCR,
        DECR: StencilOp.DECR,
        INVERT: StencilOp.INVERT,
        INCR_WRAP: StencilOp.INCR_WRAP,
        DECR_WRAP: StencilOp.DECR_WRAP,
        NEVER: ComparisonFunc.NEVER,
        LESS: ComparisonFunc.LESS,
        EQUAL: ComparisonFunc.EQUAL,
        LESS_EQUAL: ComparisonFunc.LESS_EQUAL,
        GREATER: ComparisonFunc.GREATER,
        NOT_EQUAL: ComparisonFunc.NOT_EQUAL,
        GREATER_EQUAL: ComparisonFunc.GREATER_EQUAL,
        ALWAYS: ComparisonFunc.ALWAYS,
        FRONT: CullMode.FRONT,
        BACK: CullMode.BACK,
        GOURAND: ShadeModel.GOURAND,
        FLAT: ShadeModel.FLAT,
        FILL: PolygonMode.FILL,
        LINE: PolygonMode.LINE,
        POINT_LIST: PrimitiveMode.POINT_LIST,
        LINE_LIST: PrimitiveMode.LINE_LIST,
        LINE_STRIP: PrimitiveMode.LINE_STRIP,
        LINE_LOOP: PrimitiveMode.LINE_LOOP,
        TRIANGLE_LIST: PrimitiveMode.TRIANGLE_LIST,
        TRIANGLE_STRIP: PrimitiveMode.TRIANGLE_STRIP,
        TRIANGLE_FAN: PrimitiveMode.TRIANGLE_FAN,
        LINE_LIST_ADJACENCY: PrimitiveMode.LINE_LIST_ADJACENCY,
        LINE_STRIP_ADJACENCY: PrimitiveMode.LINE_STRIP_ADJACENCY,
        TRIANGLE_LIST_ADJACENCY: PrimitiveMode.TRIANGLE_LIST_ADJACENCY,
        TRIANGLE_STRIP_ADJACENCY: PrimitiveMode.TRIANGLE_STRIP_ADJACENCY,
        TRIANGLE_PATCH_ADJACENCY: PrimitiveMode.TRIANGLE_PATCH_ADJACENCY,
        QUAD_PATCH_LIST: PrimitiveMode.QUAD_PATCH_LIST,
        ISO_LINE_LIST: PrimitiveMode.ISO_LINE_LIST,
        LINEAR: Filter.LINEAR,
        ANISOTROPIC: Filter.ANISOTROPIC,
        WRAP: Address.WRAP,
        MIRROR: Address.MIRROR,
        CLAMP: Address.CLAMP,
        BORDER: Address.BORDER,
        LINE_WIDTH: DynamicStateFlagBit.LINE_WIDTH,
        DEPTH_BIAS: DynamicStateFlagBit.DEPTH_BIAS,
        BLEND_CONSTANTS: DynamicStateFlagBit.BLEND_CONSTANTS,
        DEPTH_BOUNDS: DynamicStateFlagBit.DEPTH_BOUNDS,
        STENCIL_WRITE_MASK: DynamicStateFlagBit.STENCIL_WRITE_MASK,
        STENCIL_COMPARE_MASK: DynamicStateFlagBit.STENCIL_COMPARE_MASK,
        TRUE: true,
        FALSE: false,
        ...RenderPassStage,
    };

    return {
        murmurhash2_32_gc,
        Sampler,
        SamplerInfo,
        effectStructure,
        isSampler: (type) => type >= Type.SAMPLER1D,
        typeMap,
        formatMap,
        getFormat: (name) => Format[name.toUpperCase()],
        getShaderStage: (name) => ShaderStageFlagBit[name.toUpperCase()],
        getDescriptorType: (name) => DescriptorType[name.toUpperCase()],
        isNormalized: (format) => {
            const info = FormatInfos[format];
            return !!info && (info.type === FormatType.UNORM || info.type === FormatType.SNORM);
        },
        isPaddedMatrix: (type) => type >= Type.MAT2 && type < Type.MAT4,
        getMemoryAccessFlag: (access) => {
            if (access === 'writeonly') {
                return MemoryAccessBit.WRITE_ONLY;
            }
            if (access === 'readonly') {
                return MemoryAccessBit.READ_ONLY;
            }
            return MemoryAccessBit.READ_WRITE;
        },
        passParams,
        SetIndex,
        RenderPriority,
        GetTypeSize: (type) => type2size[type] || 0,
    };
}

function loadEffectCompiler(mappings, diagnostics) {
    const compilerDir = path.join(rootDir, 'src', 'core', 'assets', 'effect-compiler');
    const originalLoad = Module._load;
    const originalWarn = console.warn;
    const originalError = console.error;

    if (diagnostics) {
        const captureDiagnostic = () => {
            diagnostics.count += 1;
        };
        console.warn = captureDiagnostic;
        console.error = captureDiagnostic;
    }

    Module._load = function load(request, parent, isMain) {
        if (request === './offline-mappings' && parent?.filename?.startsWith(compilerDir)) {
            return mappings;
        }
        if (request === 'gl' && parent?.filename?.startsWith(compilerDir)) {
            return () => ({
                VERTEX_SHADER: 0x8b31,
                FRAGMENT_SHADER: 0x8b30,
                COMPILE_STATUS: 0x8b81,
                LINK_STATUS: 0x8b82,
                getSupportedExtensions: () => [],
                getExtension: () => null,
                createShader: () => ({}),
                shaderSource: () => {},
                compileShader: () => {},
                getShaderParameter: () => true,
                getShaderInfoLog: () => '',
                deleteShader: () => {},
                createProgram: () => ({}),
                attachShader: () => {},
                linkProgram: () => {},
                getProgramParameter: () => true,
                getProgramInfoLog: () => '',
                deleteProgram: () => {},
            });
        }
        return originalLoad.apply(this, arguments);
    };

    try {
        return require(path.join(compilerDir, 'index.js'));
    } finally {
        Module._load = originalLoad;
        console.warn = originalWarn;
        console.error = originalError;
    }
}

function getEffectOutputNames(sourceName) {
    const aliases = {
        'for2d/builtin-spine': 'builtin-spine',
        'for2d/builtin-sprite': 'builtin-sprite',
        'particles/builtin-billboard': 'builtin-billboard',
        'particles/builtin-particle': 'builtin-particle',
        'particles/builtin-particle-gpu': 'builtin-particle-gpu',
        'particles/builtin-particle-trail': 'builtin-particle-trail',
        'pipeline/post-process/bloom': 'pipeline/bloom',
        'pipeline/post-process/hbao': 'pipeline/hbao',
    };

    const alias = aliases[sourceName];
    return alias && alias !== sourceName ? [sourceName, alias] : [sourceName];
}

function isRuntimeEffect(sourceName) {
    return !sourceName.startsWith('internal/editor/');
}

function findFiles(dir, predicate, recursive = true) {
    const files = [];
    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (recursive) {
                files.push(...findFiles(file, predicate, recursive));
            }
        } else if (predicate(file)) {
            files.push(file);
        }
    }

    return files;
}

async function patchGeneratedEngineForBundlers() {
    const jsFiles = findFiles(engineOut, (file) => file.endsWith('.js'));
    let patched = 0;

    for (const file of jsFiles) {
        const source = await fs.readFile(file, 'utf8');
        const next = source
            // These imports are resolved at runtime. Webpack otherwise tries to
            // resolve the generated virtual URL during compilation.
            .replace(
                /import\("virtual:\/\/\/prerequisite-imports\/" \+ bundle\.name\)/g,
                'import(/* webpackIgnore: true */ "virtual:///prerequisite-imports/" + bundle.name)',
            )
            .replace(
                /import\(pack\)/g,
                'import(/* webpackIgnore: true */ pack)',
            )
            .replace(
                /new URL\(binaryUrl, import\.meta\.url\)/g,
                'new globalThis.URL(binaryUrl, globalThis.__cocosAssetBaseUrl || import.meta.url)',
            );

        if (next !== source) {
            await fs.writeFile(file, next, 'utf8');
            patched += 1;
        }
    }

    return patched;
}

async function packNpmPackage() {
    const files = await fs.readdir(packageRoot);
    await Promise.all(files
        .filter((file) => file.endsWith('.tgz'))
        .map((file) => fs.remove(path.join(packageRoot, file))));

    const npmCommand = 'npm';
    const { stdout } = await execFileAsync(npmCommand, ['pack', '--pack-destination', packageRoot], {
        cwd: packageRoot,
        shell: process.platform === 'win32',
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 16,
    });
    const tarballName = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    if (!tarballName) {
        throw new Error('Failed to pack cocos npm package.');
    }

    const tarballPath = path.join(packageRoot, tarballName);
    await fs.move(tarballPath, packedPackage, { overwrite: true });

    return packedPackage;
}

function collectEffectFiles() {
    const effectsDir = path.join(engineDir, 'editor', 'assets', 'effects');
    return findFiles(effectsDir, (file) => file.endsWith('.effect')).sort().flatMap((file) => {
        const relative = path.relative(effectsDir, file).replace(/\\/g, '/');
        const sourceName = relative.slice(0, -'.effect'.length);
        if (!isRuntimeEffect(sourceName)) {
            return [];
        }

        return getEffectOutputNames(sourceName).map((outputName) => ({
            file,
            sourceName,
            outputName,
        }));
    });
}

async function generateBuiltinEffectData({ webgpu }) {
    const mappings = createEffectCompilerMappings();
    const diagnostics = { count: 0 };
    const shdcLib = loadEffectCompiler(mappings, diagnostics);
    const chunksDir = path.join(engineDir, 'editor', 'assets', 'chunks');
    const currentEffectDir = { value: '' };

    shdcLib.options.noSource = false;
    shdcLib.options.throwOnWarning = false;
    shdcLib.options.throwOnError = true;
    shdcLib.options.skipParserTest = true;
    shdcLib.options.chunkSearchFn = (names) => {
        const result = { name: undefined, content: undefined };
        for (const name of names) {
            let file = path.resolve(currentEffectDir.value, `${name}.chunk`);
            if (!fs.existsSync(file)) {
                file = path.resolve(chunksDir, `${name}.chunk`);
            }
            if (fs.existsSync(file)) {
                result.name = name;
                result.content = fs.readFileSync(file, 'utf8');
                break;
            }
        }
        return result;
    };

    const chunkFiles = findFiles(chunksDir, (file) => file.endsWith('.chunk'), false);
    for (const file of chunkFiles) {
        shdcLib.addChunk(path.basename(file, '.chunk'), fs.readFileSync(file, 'utf8'));
    }

    const effects = [];
    const names = new Set();
    for (const { file, sourceName, outputName } of collectEffectFiles()) {
        const content = await fs.readFile(file, 'utf8');
        currentEffectDir.value = path.dirname(file);
        const effect = shdcLib.buildEffect(outputName, content);
        if (!effect) {
            continue;
        }
        if (names.has(effect.name)) {
            throw new Error(`Duplicate builtin effect name "${effect.name}" from ${sourceName}`);
        }
        shdcLib.stripEditorSupport(effect, { glsl1: true, glsl3: true, glsl4: webgpu });
        effects.push(effect);
        names.add(effect.name);
    }

    return {
        effects,
        diagnosticCount: diagnostics.count,
    };
}

async function writeBuiltinEffectData(options) {
    const { effects, diagnosticCount } = await generateBuiltinEffectData(options);

    await fs.outputFile(
        path.join(packageDist, 'builtin-effects.js'),
        `export const effects = ${JSON.stringify(effects)};\n`,
        'utf8',
    );
    await fs.outputFile(
        path.join(packageDist, 'register-builtins.js'),
        [
            "import { effects } from './builtin-effects.js';",
            '',
            'let installed = false;',
            'let registered = false;',
            '',
            'export function installBuiltinEffects(cc) {',
            '    if (installed) {',
            '        return;',
            '    }',
            '    installed = true;',
            '',
            '    const register = () => {',
            '        if (registered) {',
            '            return;',
            '        }',
            '        registered = true;',
            '',
            '        effects.forEach((effectData) => {',
            '            const effect = Object.assign(new cc.EffectAsset(), effectData);',
            '            effect.hideInEditor = true;',
            '            effect.onLoaded();',
            '        });',
            '    };',
            '',
            '    if (cc.game._engineInited) {',
            '        register();',
            '    } else {',
            '        cc.game.on(cc.Game.EVENT_POST_SUBSYSTEM_INIT, register);',
            '    }',
            '}',
            '',
        ].join('\n'),
        'utf8',
    );

    return {
        effectCount: effects.length,
        diagnosticCount,
    };
}

async function main() {
    const version = getArgValue('--version', enginePackageJson.version || '0.0.0');
    const debug = !hasArg('--release');
    const webgpu = hasArg('--webgpu');

    await fs.remove(packageRoot);
    await fs.ensureDir(packageDist);

    const statsQuery = await StatsQuery.create(engineDir);
    const features = statsQuery.getFeatures();

    console.log(`[npm-web-mobile] Build cocos@${version}`);
    console.log(`[npm-web-mobile] Engine: ${engineDir}`);
    console.log(`[npm-web-mobile] Output: ${packageRoot}`);
    console.log(`[npm-web-mobile] Features: ${features.length}`);
    console.log(`[npm-web-mobile] ESM, platform HTML5, WEBGPU=${webgpu}, DEBUG=${debug}`);

    const result = await buildEngine({
        engine: engineDir,
        out: engineOut,
        mode: 'BUILD',
        platform: 'HTML5',
        flags: {
            DEBUG: debug,
            WEBGPU: webgpu,
            LOAD_BULLET_MANUALLY: true,
            LOAD_BOX2D_MANUALLY: true,
            LOAD_PHYSX_MANUALLY: true,
            LOAD_SPINE_MANUALLY: true,
        },
        features,
        moduleFormat: 'esm',
        compress: !debug,
        split: false,
        nativeCodeBundleMode: 'both',
        assetURLFormat: 'runtime-resolved',
        sourceMap: false,
        mangleProperties: false,
        inlineEnum: true,
    });

    const patchedEngineFiles = await patchGeneratedEngineForBundlers();
    const ccEntry = result.exports.cc || 'cc.js';
    await fs.outputFile(
        path.join(packageDist, 'index.js'),
        [
            `import * as cc from './engine/${ccEntry}';`,
            "import { installBuiltinEffects } from './register-builtins.js';",
            '',
            'installBuiltinEffects(cc);',
            '',
            'export default cc;',
            `export * from './engine/${ccEntry}';`,
            '',
        ].join('\n'),
        'utf8',
    );

    const { effectCount, diagnosticCount } = await writeBuiltinEffectData({ webgpu });
    await copyDeclarations();

    await fs.writeJson(path.join(packageRoot, 'package.json'), createPackageJson(version), { spaces: 4 });
    await fs.writeJson(path.join(engineOut, 'features.json'), {
        platform: 'HTML5',
        moduleFormat: 'esm',
        assetURLFormat: 'runtime-resolved',
        debug,
        webgpu,
        features,
        exports: result.exports,
    }, { spaces: 4 });

    const files = await fs.readdir(engineOut);
    const tarball = await packNpmPackage();
    console.log(`[npm-web-mobile] Engine files: ${files.length}`);
    if (patchedEngineFiles > 0) {
        console.log(`[npm-web-mobile] Bundler compatibility patches: ${patchedEngineFiles}`);
    }
    console.log(`[npm-web-mobile] Builtin effects: ${effectCount}`);
    if (diagnosticCount > 0) {
        console.log(`[npm-web-mobile] Effect compiler diagnostics suppressed: ${diagnosticCount}`);
    }
    console.log(`[npm-web-mobile] Entry: dist/index.js -> dist/engine/${ccEntry}`);
    console.log(`[npm-web-mobile] Package: ${tarball}`);
    console.log('[npm-web-mobile] Done.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
