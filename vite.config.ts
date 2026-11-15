import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type HmrContext, type Plugin } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

/**
 * 插画源码虚拟模块：`virtual:doodle/<name>` → static/doodles/<name>.svg 的源码文本。
 * 为什么不用 `?raw`：uni 的资源管线会把任何 .svg 导入改写为资源 URL（`?raw` 会被吞掉），
 * 虚拟模块带自定义协议、不触发资源处理；构建期直接读文件文本，供 DoodleIcon 内联渲染，
 * 这样 CSS 变量（--doodle-*）才能穿进 SVG 内部。
 */
function doodleRaw(): Plugin {
  const prefix = 'virtual:doodle/';
  let doodlesDir = '';
  return {
    name: 'spa-doodle-raw',
    configResolved(config) {
      doodlesDir = path.resolve(config.root, 'src/static/doodles');
    },
    resolveId(id) {
      if (id.startsWith(prefix)) return '\0' + id;
    },
    load(id) {
      if (!id.startsWith('\0' + prefix)) return;
      const name = id.slice(('\0' + prefix).length);
      const file = path.join(doodlesDir, `${name}.svg`);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`;
    },
    handleHotUpdate(ctx: HmrContext) {
      if (!doodlesDir) return;
      const file = path.normalize(ctx.file);
      if (!file.startsWith(doodlesDir + path.sep) || !file.endsWith('.svg')) return;
      const name = path.basename(file, '.svg');
      const mod = ctx.server.moduleGraph.getModuleById('\0' + prefix + name);
      if (mod) {
        ctx.server.moduleGraph.invalidateModule(mod);
        return [mod];
      }
      return;
    },
  };
}

/**
 * 本地单机约束：生产构建注入 CSP，只允许 same-origin 资源。
 * 即使 uni H5 runtime 内含统计/广告等联网代码，也无法连接外部域名或加载远程图片。
 * 开发模式不注入，避免影响 Vite HMR 的本地 WebSocket。
 */
function offlineCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join('; ');

  return {
    name: 'spa-offline-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), offlineCsp(), doodleRaw()],
});
