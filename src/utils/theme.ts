/**
 * 主题（深浅色）控制 —— 三态：跟随系统 / 浅色 / 深色
 *
 * V5.0 · 暗夜模式（V5.2 起为「暖调深灰」）：
 * - H5 / App：切换 html 根节点的 .theme-dark 类，皮肤统一定义在 styles/dark.scss
 *   （底色 #1A1A18 + 8% 微光星座底图 + 暖面卡片 + 陶土暖橙点缀）；
 * - 宿主底色、原生导航栏与 tabBar 同步切换（syncNavBar / setTabBarStyle）；
 * - 微信小程序：不支持运行时切换根类名，保持纸白（浅色）不受影响。
 *
 * 所有 DOM/uni API 调用都做了平台条件编译与 try/catch，
 * 保证任一端不支持某个能力时不会阻断主流程。
 */

import type { ThemeMode } from '@/types/models';
import { ref } from 'vue';

/**
 * 当前是否处于暗夜模式（响应式）
 * ------------------------------------------------------------
 * App 的逻辑层跑在独立 JS 引擎里，`document.documentElement` 是不存在的，
 * 所以页面皮肤不能只靠 html 上的类名。各页把 `theme-dark` 绑到自己的根 view 上
 * （见各页根节点的 :class），dark.scss 里 `html .theme-dark X` 的规则因此生效。
 */
export const darkActive = ref(false);

/** 原生 UI 配色（导航栏 / tabBar） */
const NATIVE_UI = {
  light: {
    navFront: '#000000',
    navBg: '#ffffff',
    tabColor: '#8c8c86',
    tabSelected: '#b87b5a',
    tabBg: '#ffffff',
    tabBorder: 'black',
  },
  dark: {
    navFront: '#ffffff',
    navBg: '#1a1a18',
    tabColor: '#8c8c86',
    tabSelected: '#b87b5a',
    tabBg: '#1a1a18',
    tabBorder: 'black',
  },
} as const;

/** 最近一次生效的深浅状态（供各页 onShow 同步导航栏配色） */
let lastDark = false;

/** 当前是否处于暗夜模式 */
export function isDarkActive(): boolean {
  return lastDark;
}

/** 把当前主题同步到导航栏（各页 onShow 调用；不支持的端静默忽略） */
export function syncNavBar(): void {
  const ui = lastDark ? NATIVE_UI.dark : NATIVE_UI.light;
  try {
    uni.setNavigationBarColor({
      frontColor: ui.navFront,
      backgroundColor: ui.navBg,
      fail: () => {
        // 部分端（如未开启虚拟导航栏的场景）不支持：静默忽略
      },
    });
  } catch {
    // 同步抛错的端兜底：忽略即可
  }
  // H5：底部 Tab 选中项果冻回弹（V5.8）——随各页 onShow 顺带触发
  bounceTabbar();
}

/** H5 Tab 页路径（与 pages.json tabBar.list 顺序一致）——果冻回弹按序号定位选中项 */
const TAB_PATHS = ['/pages/index/index', '/pages/goal/list', '/pages/stats/index', '/pages/mine/index'];

/**
 * H5：底部 Tab 切换时给选中项一个果冻回弹（V5.8「笨拙手账」）
 * - 由 syncNavBar 在每次页面 onShow 时顺带触发，非 Tab 页静默跳过；
 * - uni-h5 的 Tab 选中态用行内样式固化（无 active 类），因此按 hash 序号找节点；
 * - 摘类 → 强制回流 → 挂类，保证连续切换也能重播动画。
 */
export function bounceTabbar(): void {
  // #ifdef H5
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }
  // 优先用页面栈拿当前路由：uni-h5 里 onShow 与 hash 更新的先后顺序不稳定，
  // 但 onShow 触发时页面栈必然已切到新页——比读 location.hash 可靠。
  let path = '';
  try {
    const pages = getCurrentPages();
    const current = pages && pages.length > 0 ? pages[pages.length - 1] : null;
    path = current && current.route ? `/${current.route}` : '';
  } catch {
    // 极少数环境无页面栈：走 hash 兜底
  }
  if (!path) {
    // 兜底：读 hash（uni-h5 会把「今日」这个首页 Tab 归一化成 "#/" 或空，补一道别名）
    const raw = window.location.hash.replace(/^#/, '').split('?')[0];
    path = raw === '' || raw === '/' ? TAB_PATHS[0] : raw;
  }
  const index = TAB_PATHS.indexOf(path);
  if (index < 0) {
    return;
  }
  const item = document.querySelectorAll('uni-tabbar .uni-tabbar__item')[index];
  if (!item) {
    return;
  }
  const target = (item.querySelector('img') ?? item) as HTMLElement;
  target.classList.remove('tab-jelly');
  void target.offsetWidth; // 强制回流：让下一帧的挂类必然重播动画
  target.classList.add('tab-jelly');
  setTimeout(() => {
    target.classList.remove('tab-jelly');
  }, 620);
  // #endif
}

/** 读取系统当前主题（App / 小程序读系统信息；H5 读媒体查询） */
export function getSystemTheme(): 'light' | 'dark' {
  let dark = false;
  // #ifdef APP-PLUS || MP-WEIXIN
  dark = uni.getSystemInfoSync().theme === 'dark';
  // #endif
  // #ifdef H5
  dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  // #endif
  return dark ? 'dark' : 'light';
}

/** 把三态模式解析为最终生效的浅/深色 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemTheme() : mode;
}

/**
 * 应用主题（切换 CSS 类 + 同步原生导航栏 / tabBar 配色）
 * 该函数幂等：重复调用同一主题无副作用。
 */
export function applyTheme(mode: ThemeMode): void {
  const dark = resolveTheme(mode) === 'dark';
  lastDark = dark;
  darkActive.value = dark;

  // 1) 页面内样式：html 根节点类名（H5 生效；App 里没有 document，走各页根节点的 :class）
  // #ifdef H5 || APP-PLUS
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('theme-dark', dark);
  }
  // #endif

  // 1.5) 宿主窗口底色：页面根节点之外的留白（下拉回弹 / 底部安全区）也要跟着变，
  //      否则暗色下会从边缘漏出一条白边。
  const bg = dark ? '#1a1a18' : '#ffffff';
  try {
    uni.setBackgroundColor?.({
      backgroundColor: bg,
      backgroundColorTop: bg,
      backgroundColorBottom: bg,
      fail: () => {
        // 部分端不支持窗口底色：忽略
      },
    });
  } catch {
    // 忽略
  }

  // 2) 原生 UI：导航栏与 tabBar
  syncNavBar();
  const ui = dark ? NATIVE_UI.dark : NATIVE_UI.light;
  try {
    uni.setTabBarStyle({
      color: ui.tabColor,
      selectedColor: ui.tabSelected,
      backgroundColor: ui.tabBg,
      borderStyle: ui.tabBorder,
      fail: () => {
        // H5 在非 tabBar 页面（以及启动早期 tabBar 尚未挂载时）会异步 reject；
        // 必须用 fail 回调接住——该 API 是 Promise 化的，同步 try/catch 捕不到，
        // 不接住的话 uni-h5 会把 unhandled rejection 打印到控制台。
      },
    });
  } catch {
    // 同步抛错的端兜底：忽略即可
  }
}

/** 是否已绑定系统主题变化监听（防止重复绑定） */
let systemListenerBound = false;

/**
 * 监听系统主题变化（仅在「跟随系统」模式下由调用方决定是否重新应用）
 * @param onChange 系统主题变化回调（'light' | 'dark'）
 */
export function watchSystemTheme(onChange: (theme: 'light' | 'dark') => void): void {
  if (systemListenerBound) {
    return;
  }
  systemListenerBound = true;

  // #ifdef APP-PLUS
  uni.onThemeChange?.((res) => {
    onChange(res.theme === 'dark' ? 'dark' : 'light');
  });
  // #endif

  // #ifdef H5
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      onChange(e.matches ? 'dark' : 'light');
    });
  }
  // #endif

  // #ifdef MP-WEIXIN
  // 小程序端 onThemeChange 需 app.json 开启 darkmode；
  // 纸白体系下无需跟随系统深色，暂不注册该监听
  // #endif
}
