import fs from 'fs';
import { createRenderer } from 'vue-server-renderer';
import serialize from 'serialize-javascript';
import {
    VueDevMiddlewareFileSystem as DevMiddlewareFileSystem,
    getVueEntryList,
    WebpackVue as webPack
} from '@srejs/vue-webpack';
import common, {
    clientDir,
    serverDir,
    cacheDir,
    SSRKEY,
    Logger,
    filterXssByJson,
    writeCacheSsr,
    renderDocumentHead
} from '@srejs/common';

/**
 * 用Promise封装异步读取文件方法
 * @param  {string} page html文件名称
 * @return {promise}
 */
export const readPageHtml = (page) => {
    return new Promise(async (resolve, reject) => {
        let viewUrl = `${clientDir}/${page}/${page}.html`;
        const readFileSync = () => {
            fs.readFile(viewUrl, 'utf8', (err, htmlString) => {
                if (err) {
                    reject(err);
                    Logger.error(
                        'SSR: The client code is being compiled, please refresh the browser later...'
                    );
                } else {
                    resolve(htmlString);
                }
            });
        };
        if (common.isDev()) {
            try {
                let htmlString = DevMiddlewareFileSystem.readFileSync(viewUrl, 'utf-8');
                resolve(htmlString);
            } catch (error) {
                readFileSync();
            }
        } else {
            readFileSync();
        }
    });
};

/**
 *  生成环境编译代码检查
 * @param {*} page
 * @returns
 */
export const checkModules = async (page) => {
    let jspath = `${serverDir}/${page}/${page}.js`;
    let jsClientdir = `${clientDir}/${page}`;
    if (!fs.existsSync(jspath)) {
        //服务端代码打包
        let compiler = new webPack(page, common.isDev(), true);
        await compiler.run();
    }
    if (!fs.existsSync(jsClientdir) && !common.isDev()) {
        //客户端代码打包
        let compiler = new webPack(page, common.isDev());
        await compiler.run();
    }
    return jspath;
};
/**
 * Router类型页面渲染解析
 * @param {*} ctx
 * @param {*} next
 */
export const renderServer = async (ctx, initProps = {}, ssr = true) => {
    let context = { url: ctx.req.url };
    let { page, query, path, options } = ctx[SSRKEY];
    path = encodeURI(path);
    query = filterXssByJson(query);
    if (!getVueEntryList().has(page)) {
        return `Page component ${page} does not exist, please check the pages folder`;
    }
    if (typeof initProps === 'object') {
        context = Object.assign(
            {
                title: '',
                meta: ''
            },
            context,
            initProps
        );
    }
    context.ssrData = {
        page,
        path,
        query,
        options
    };
    let Html = '';
    if (ssr) {
        let createApp;
        let jspath = await checkModules(page);
        try {
            // eslint-disable-next-line no-undef
            if (common.isDev()) {
                delete require.cache[require.resolve(jspath)];
            }
            createApp = require(jspath);
            createApp = createApp.default ? createApp.default : createApp;
        } catch (error) {
            // eslint-disable-next-line no-console
            Logger.error(
                `SSR: ${page}页面服务端加载入口文件异常，请检查是否在代码程序中使用到浏览器宿主对象特定的API(包括第三方模块需支持SSR模式安装)
             Please check whether there are api in the code that the server does not support when rendering,
             such as window, locaction, navigator, etc`
            );
            Logger.error(error.stack);
        }
        try {
            const App = await createApp(context);
            Html = await renderTostring(App, context, page);
        } catch (error) {
            ctx[SSRKEY].options.ssr = false;
            context.ssrData = {
                page,
                path,
                query,
                options
            }; // 修正数据
            Logger.warn(`SSR: 服务端渲染异常，降级使用客户端渲染:${error.stack}`);
            Html = await readPageHtml(page);
        }
    } else {
        Html = await readPageHtml(page);
    }
    let document = renderDocumentHead(Html, context);
    // vue-server-renderer模板注入漏洞 将变量注入模板时机放在模板渲染之后
    document = injectScriptInitProps(document, context);
    return document;
};

/**
 * 客户端渲染时直接读取HTML注入变量
 * @param {*} page
 * @param {*} context
 * @returns
 */
// const readPageString = async (page, context) => {
//     let temp = await readPageHtml(page);
//     return injectScriptInitProps(temp, context);
// };

/**
 * vue2.0 服务端渲染renderToString解析DOM返回字符串
 * @param {*} App
 * @param {*} context
 * @param {*} page
 * @returns
 */
const renderTostring = async (App, context, page) => {
    const template = await readPageHtml(page, context);
    const renderer = createRenderer({
        template
    });
    return new Promise((resove, reject) => {
        renderer.renderToString(App, context, (err, html) => {
            if (err) {
                reject(err);
                return;
            }
            resove(html);
        });
    });
};

/**
 * 在HTML中注入__SSR_DATA__
 * @param {*} temp
 * @param {*} context
 * @returns
 */
const injectScriptInitProps = (temp, context) => {
    // const contents = temp.split('<!--vue-ssr-outlet-->');
    // if (contents.length == 1) {
    //     console.error(
    //         'SSR:警告！自定义html文件中请在body下追加<!--vue-ssr-outlet-->占位符！https://ssr.vuejs.org/zh/guide/#%E4%BD%BF%E7%94%A8%E4%B8%80%E4%B8%AA%E9%A1%B5%E9%9D%A2%E6%A8%A1%E6%9D%BF'
    //     );
    // }
    const data = Object.assign({}, context);
    const ssrData = data.ssrData;
    delete data.state;
    delete data.ssrData;
    delete context.ssrData;
    ssrData.initProps = data;
    const contents = temp.split('</head>');
    if (contents.length == 1) {
        console.error('SSR:警告！自定义html文件中必须包含</head>闭合标签。');
    }

    return (
        contents[0] +
        '<script>window.__SSR_DATA__=' +
        serialize(ssrData, { isJSON: true }) +
        '</script>' +
        '</head>' +
        contents[1]
    );

    // return (
    //     contents[0] +
    //     '<!--vue-ssr-outlet-->' +
    //     '<script>window.__SSR_DATA__=' +
    //     serialize(ssrData, { isJSON: true }) +
    //     '</script>' +
    //     contents[1]
    // );
};
/**
 * 获取服务端渲染直出资源
 * @param {*} ctx
 */
export const render = async (ctx, initProps) => {
    let page = ctx[SSRKEY].page;
    let { cache, ssr } = ctx[SSRKEY].options;
    return new Promise(async (resolve) => {
        if (!ssr) {
            // 客户端渲染模式
            return resolve(await renderServer(ctx, initProps, false));
        }

        let ssrCacheDir = `${cacheDir}${ctx.url}/`;
        let ssrCacheUrl = `${cacheDir}${ctx.url}/${page}.html`;
        if (common.isDev() || !cache) {
            // ssr无缓存模式，适用每次请求都是动态渲染页面场景
            return resolve(await renderServer(ctx, initProps, true));
        } else {
            if (fs.existsSync(ssrCacheUrl)) {
                // ssr缓存模式，执行一次ssr 第二次直接返回缓存后的html静态资源
                let rs = fs.createReadStream(ssrCacheUrl, 'utf-8');

                return resolve(rs);
            } else {
                // ssr缓存模式,首次执行
                let document = await renderServer(ctx, initProps, true);
                process.nextTick(() => {
                    writeCacheSsr(ssrCacheDir, ssrCacheUrl, document); //异步写入服务器缓存目录
                });

                return resolve(document);
            }
        }
    });
};
