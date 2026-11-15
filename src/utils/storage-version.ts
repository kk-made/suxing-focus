/**
 * 本地数据结构版本号
 * 单独一个小文件的原因：storage.ts 与各 store 都可能引用，避免循环依赖。
 * 每次修改持久化数据结构（增删字段/改语义）时 +1，并在 storage.ts 的
 * ensureSchemaVersion 中补充迁移逻辑。
 */
export const SCHEMA_VERSION = 1;
