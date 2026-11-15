/// <reference types="vite/client" />

/** 插画虚拟模块：`virtual:doodle/<name>` → static/doodles/<name>.svg 源码文本（见 vite.config.ts 的 spa-doodle-raw 插件） */
declare module 'virtual:doodle/*' {
  const content: string;
  export default content;
}

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
