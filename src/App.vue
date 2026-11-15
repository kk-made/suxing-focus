<script setup lang="ts">
/**
 * 应用根组件：全局样式 + 主题初始化 + 计时恢复
 * 本地单机：不登录、不发起业务网络请求，数据只写入 localStorage。
 * 注意：App.vue 的 <style> 在所有页面全局生效（uni-app 约定），
 *      因此 common.scss / dark.scss 在此引入一次即可全项目可用。
 */
import { onLaunch } from '@dcloudio/uni-app';
import { ensureSchemaVersion } from '@/utils/storage';
import { useUserStore } from '@/stores/user';
import { useTimerStore } from '@/stores/timer';
import { applyTheme, watchSystemTheme } from '@/utils/theme';

onLaunch(() => {
  // 1) 本地数据结构版本检查（为将来升级迁移预留入口）
  ensureSchemaVersion();

  // 2) 用户设置初始化：首次启动写入默认值；已有数据做字段容错补齐
  //    内部会按保存的 themeMode 立即应用主题（浅色基线 / 暗夜星座皮肤）
  const userStore = useUserStore();
  userStore.init();

  // 3) 学习计时恢复：应用被杀后重启时，按最后一次心跳截断运行时间并自动暂停
  //    （避免把离线数天的时间误算为学习时长），由首页计时卡片提示继续/结束
  const timerStore = useTimerStore();
  timerStore.restoreAfterLaunch();

  // 4) 监听系统主题变化：仅「跟随系统」模式需要实时响应
  //    App 端必须先让原生 UI 跟随系统（plus.nativeUI.setUIStyle('auto')），
  //    uni.onThemeChange 才会在系统深浅切换时触发（DCloud 暗黑模式文档）。
  // #ifdef APP-PLUS
  try {
    const plusApi = (
      globalThis as { plus?: { nativeUI?: { setUIStyle?: (style: string) => void } } }
    ).plus;
    plusApi?.nativeUI?.setUIStyle?.('auto');
  } catch {
    // 旧基座不支持该 API：忽略，系统主题变化时下次启动再对齐
  }
  // #endif
  watchSystemTheme(() => {
    if (userStore.settings.themeMode === 'system') {
      applyTheme('system');
    }
  });

  // 5) H5 启动瞬间 tabBar 尚未挂载，applyTheme 里的 setTabBarStyle 会被静默忽略
  //    （表现为：重启后直接进深色，tabBar 却停留在 pages.json 的浅色默认值）。
  //    等首屏渲染完成后补一次，让选中色等原生配色跟上持久化的主题。
  setTimeout(() => {
    applyTheme(userStore.settings.themeMode);
  }, 600);
});
</script>

<style lang="scss">
/* 本地手写字体：悠哉字体（Yozai，SIL OFL 1.1），按 unicode-range 分片懒加载 */
@import '@/styles/yozai.scss';
/* 全局基础样式：浅色纸白基线（common.scss）+ 暗夜星座皮肤（dark.scss，html.theme-dark 作用域） */
@import '@/styles/common.scss';
@import '@/styles/dark.scss';

/* 宿主层底色：浅色纯白 / 暗夜暖调深灰。
 * body 的 !important 兜底说明：uni H5 构建会把 `page` 开头选择器里的 background-color
 * 镜像成一条裸 `body` 规则，按源顺序可能反向覆盖 body 底色；
 * html.theme-dark 版本特异性更高且同样是 !important，深色下依然稳胜。 */
html,
body {
  background-color: #ffffff;
  /* 单字重手写字体：禁止浏览器合成粗体/斜体，避免笔画被算法加粗后变形 */
  font-synthesis: none;
}

body {
  background-color: #ffffff !important;
}

html.theme-dark,
html.theme-dark body {
  background-color: #1a1a18 !important;
}

/* 中间宿主容器全部透明：让 body 的底色与星座底图透到页面之下 */
#app,
uni-page,
uni-page-body {
  background-color: transparent;
}

/* V5.62 本地单机：uni H5 runtime 自带一张远程 tabbar 阴影预加载（cdn.dcloud.net.cn）。
   本应用不需要该阴影，彻底去掉，避免离线时产生任何外部图片请求。 */
body:after {
  animation: none !important;
  background-image: none !important;
}

[class*='uni-page-head-shadow']:after {
  background-image: none !important;
}

/* H5：底部 Tab 按压反馈（浅色暖橘 / 夜晚低亮暖光） */
uni-tabbar .uni-tabbar__item {
  transition: background-color 200ms ease;

  &:active {
    background-color: rgba(245, 213, 184, 0.3);
  }
}

html.theme-dark uni-tabbar .uni-tabbar__item:active {
  background-color: rgba(245, 213, 184, 0.16);
}

/* 手写体：全站已统一为 Yozai，此类保留作「日记口气」的字距/字号钩子；
   不加载外部字体，缺字由楷体栈兜底 */
.hand {
  font-family: inherit;
  letter-spacing: 0.08em;
}

/* H5：底部 Tab 选中项果冻回弹（V5.8「笨拙手账」），
   .tab-jelly 由 utils/theme.ts 在切页时挂到选中的图标上 */
@keyframes tab-jelly {
  0% {
    transform: scale(1, 1);
  }
  35% {
    transform: scale(0.84, 0.72) translateY(3px);
  }
  62% {
    transform: scale(1.14, 1.2) translateY(-2px);
  }
  82% {
    transform: scale(0.95, 0.92) translateY(1px);
  }
  100% {
    transform: scale(1, 1);
  }
}

uni-tabbar .uni-tabbar__item .tab-jelly {
  animation: tab-jelly 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
