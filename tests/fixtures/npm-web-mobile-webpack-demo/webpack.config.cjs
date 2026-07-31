const path = require('node:path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const cocosRoot = path.resolve(__dirname, 'node_modules', 'cocos');

module.exports = {
    mode: 'development',
    entry: './main.js',
    output: {
        filename: 'assets/[name].[contenthash].js',
        chunkFilename: 'assets/[name].[contenthash].js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    devtool: false,
    experiments: {
        topLevelAwait: true,
    },
    performance: {
        hints: false,
    },
    ignoreWarnings: [
        {
            module: /_virtual_cc.*\.js$/,
            message: /Critical dependency: the request of a dependency is an expression/,
        },
    ],
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './index.html',
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(cocosRoot, 'dist', 'engine', 'assets'),
                    to: 'assets',
                },
            ],
        }),
    ],
    devServer: {
        static: {
            directory: path.resolve(__dirname, 'dist'),
        },
        client: {
            overlay: false,
        },
    },
};
