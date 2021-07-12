import ExtractTextPlugin from 'mini-css-extract-plugin';
import common from '@srejs/common';

export const possLoader = {
    loader: 'postcss-loader',
    options: {
        postcssOptions: {
            plugins: [
                require('autoprefixer')({ overrideBrowserslist: ['last 2 versions'] }),
                !common.isDev() ? require('cssnano') : null
            ]
        }
    }
};

const getCssLoader = () => {
    return {
        loader: 'css-loader',
        options: {
            url: true,
            modules: {
                auto: /\.module\.\w+$/i //https://github.com/webpack-contrib/css-loader#auto 通过文件格式来区分开启cssmodule 默认第三方组件库就不要使用css module
            }
        }
    };
};

export const loaderRules = (isServer = false) => {
    const cssLoader = getCssLoader();
    let envOptions = {
        modules: false
    };
    if (!isServer) {
        Object.assign(envOptions, {
            corejs: {
                version: 3.8,
                proposals: true
            },
            useBuiltIns: 'usage'
        });
    }
    return [
        {
            test: /\.(js|mjs|jsx|ts|tsx)$/,
            use: {
                loader: 'babel-loader',
                options: {
                    cacheDirectory: true,
                    cacheCompression: false,
                    presets: [
                        '@babel/preset-react',
                        ['@babel/preset-env', envOptions],
                        '@babel/preset-typescript'
                    ],
                    plugins: [
                        '@babel/plugin-syntax-jsx',
                        ['@babel/plugin-transform-runtime', { helpers: false, regenerator: true }],
                        '@babel/plugin-transform-modules-commonjs',
                        '@babel/plugin-proposal-class-properties'
                    ]
                }
            },
            exclude: /node_modules/
        },
        {
            test: /\.css$/,
            use: [
                'css-hot-loader',
                ExtractTextPlugin.loader,
                cssLoader,
                possLoader,
                'sass-loader' // 兼容历史方案，老版本css和scss一样的配置
            ]
        },
        {
            test: /\.scss$/,
            use: ['css-hot-loader', ExtractTextPlugin.loader, cssLoader, possLoader, 'sass-loader']
        },
        {
            test: /\.less$/,
            use: ['css-hot-loader', ExtractTextPlugin.loader, cssLoader, possLoader, 'less-loader']
        },
        {
            test: /\.(png|jpg|jpeg|gif|svg)$/,
            use: [
                {
                    loader: 'url-loader',
                    options: {
                        name: '[hash:8].[name].[ext]',
                        limit: 8192,
                        outputPath: 'images/'
                    }
                }
            ]
        }
    ];
};
