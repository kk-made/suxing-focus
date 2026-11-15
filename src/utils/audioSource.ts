/**
 * 本地音频地址候选
 * ============================================================
 * H5 直接走同源 `/static/...`；App（app-vue）的逻辑层读代码包资源需要
 * `_www/` 前缀，部分运行环境也能吃 `/static/...`，所以给出候选让播放器
 * 在 onError 时依次重试；最后再尝试 HTML5+ 转出的绝对文件路径。
 *
 * 只处理本地 `/static/` 资源，网络地址原样返回（本项目不加载远程音频）。
 */
export function localAudioSources(src: string): string[] {
  if (!src.startsWith('/static/')) {
    return [src];
  }
  if (typeof window !== 'undefined') {
    return [src];
  }
  const list: string[] = [];
  const direct = [`_www${src}`, src];
  // 打包后的原生播放器最认可绝对文件路径（DCloud 官方对 APK 无声的建议做法）
  try {
    const plus = (
      globalThis as {
        plus?: { io?: { convertLocalFileSystemURL?: (path: string) => string } };
      }
    ).plus;
    direct.forEach((path) => {
      const absolute = plus?.io?.convertLocalFileSystemURL?.(path);
      if (absolute && !list.includes(absolute)) {
        list.push(absolute);
      }
    });
  } catch {
    // HTML5+ 未就绪：退回直接路径
  }
  direct.forEach((candidate) => {
    if (!list.includes(candidate)) {
      list.push(candidate);
    }
  });
  return list;
}
