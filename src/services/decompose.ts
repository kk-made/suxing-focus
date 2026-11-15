/**
 * 目标文本拆解 —— 本地规则引擎（DESIGN.md V5.19 · 智能排期）
 * ============================================================
 * 输入一句自然语言目标（如「三个月背完六级单词」），输出：
 * 1. 清理后的目标标题（移除时长短语）；
 * 2. 解析出的时长（天；null = 未识别）；
 * 3. 按目标内容识别学习领域，生成贴合的 4 个学习步骤（含预估时长与优先级）。
 *
 * 领域识别 = 关键词打分（每命中一个关键词记 1 分，取最高分的领域）；
 * 同分取领域表顺序靠前者；一个都没命中 = 默认四阶段模板兜底。
 * 手动新建目标与智能排期共用本服务（defaultStageTasks(title)）。
 * 纯函数、无副作用、有单测；本地规则引擎，完全离线运行；
 * 页面层与数据契约（GoalDraft / TaskDraft）保持不变。
 */

import type { Priority } from '@/types/models';

/** 拆解出的单条任务（落库前形态） */
export interface DecomposedTask {
  title: string;
  estimateMinutes: number;
  priority: Priority;
}

/** 拆解结果：目标草稿 + 任务列表 */
export interface DecomposedGoal {
  /** 清理后的标题（已移除时长短语，超长截断） */
  title: string;
  /** 解析出的截止时长（天）；未识别为 null */
  deadlineDays: number | null;
  tasks: DecomposedTask[];
}

/** 学习领域（识别结果；default = 未命中任何领域） */
export type GoalDomain =
  | 'vocab'
  | 'exam'
  | 'program'
  | 'language'
  | 'fitness'
  | 'reading'
  | 'writing'
  | 'art'
  | 'subject'
  | 'default';

/** 领域模板：关键词表 + 四个学习步骤（标题 / 预估分钟 / 优先级） */
interface DomainTrack {
  id: GoalDomain;
  /** 命中任一即记 1 分（全小写；匹配前目标文本会转小写） */
  keywords: string[];
  steps: DecomposedTask[];
}

/** 默认四阶段模板（里程碑式拆解；未识别领域时兜底） */
const DEFAULT_STEPS: DecomposedTask[] = [
  { title: '① 梳理范围与资料', estimateMinutes: 30, priority: 'high' },
  { title: '② 核心内容逐项攻克', estimateMinutes: 45, priority: 'high' },
  { title: '③ 练习与巩固', estimateMinutes: 45, priority: 'medium' },
  { title: '④ 复盘薄弱点', estimateMinutes: 30, priority: 'low' },
];

/**
 * 领域表：顺序 = 打分同分时的优先序（越靠前越优先）。
 * 每套四步遵守同一节奏：先定范围与准备（高）→ 系统学核心（高）→
 * 大量练习（中）→ 复盘收尾（低）；预估分钟 15–60、5 的倍数。
 */
const DOMAIN_TRACKS: DomainTrack[] = [
  {
    id: 'vocab',
    keywords: ['单词', '词汇', '背词', '词书', '词根', '背单词'],
    steps: [
      { title: '① 选定词书与每日词量', estimateMinutes: 20, priority: 'high' },
      { title: '② 通背第一轮全部词汇', estimateMinutes: 40, priority: 'high' },
      { title: '③ 高频词与易错词复习', estimateMinutes: 40, priority: 'medium' },
      { title: '④ 真题例句中巩固', estimateMinutes: 30, priority: 'low' },
    ],
  },
  {
    id: 'exam',
    keywords: [
      '备考', '考试', '考研', '考公', '考编', '国考', '省考', '教资', '法考',
      '注会', 'cpa', '公务员', '六级', '四级', '专四', '专八', '雅思', '托福',
      'gre', 'cet', '高考', '中考', '期末', '冲刺', '上岸', '刷题', '道题',
    ],
    steps: [
      { title: '① 研读考纲与题型', estimateMinutes: 30, priority: 'high' },
      { title: '② 系统过一遍知识点', estimateMinutes: 50, priority: 'high' },
      { title: '③ 刷历年真题', estimateMinutes: 45, priority: 'medium' },
      { title: '④ 错题复盘与模拟考', estimateMinutes: 40, priority: 'low' },
    ],
  },
  {
    id: 'program',
    keywords: [
      '编程', '代码', '程序', '开发', '前端', '后端', '算法', '数据结构',
      'python', 'java', 'javascript', 'vue', 'react', 'c++', '爬虫',
      '机器学习', '深度学习', '数据库', 'sql', '小程序', '网站',
    ],
    steps: [
      { title: '① 跑通第一个示例', estimateMinutes: 25, priority: 'high' },
      { title: '② 系统学习核心语法', estimateMinutes: 45, priority: 'high' },
      { title: '③ 动手完成小项目', estimateMinutes: 60, priority: 'medium' },
      { title: '④ 查漏补缺与优化', estimateMinutes: 40, priority: 'low' },
    ],
  },
  {
    id: 'language',
    keywords: [
      '口语', '听力', '语法', '发音', '音标', '英语', '日语', '韩语',
      '法语', '德语', '西班牙语', '会话', '精听', '泛听', '翻译', '外语',
    ],
    steps: [
      { title: '① 打好发音语法基础', estimateMinutes: 30, priority: 'high' },
      { title: '② 跟读模仿练语感', estimateMinutes: 30, priority: 'high' },
      { title: '③ 每日开口场景实战', estimateMinutes: 40, priority: 'medium' },
      { title: '④ 纠错总结常回顾', estimateMinutes: 30, priority: 'low' },
    ],
  },
  {
    id: 'fitness',
    keywords: [
      '健身', '减肥', '瘦身', '瘦', '减脂', '增肌', '跑步', '游泳',
      '瑜伽', '锻炼', '运动', '体能', '塑形', '腹肌', '马甲线', '马拉松',
    ],
    steps: [
      { title: '① 学动作要领定计划', estimateMinutes: 20, priority: 'high' },
      { title: '② 养成规律训练习惯', estimateMinutes: 40, priority: 'high' },
      { title: '③ 按计划进阶训练', estimateMinutes: 50, priority: 'medium' },
      { title: '④ 记录数据并调整', estimateMinutes: 20, priority: 'low' },
    ],
  },
  {
    id: 'reading',
    keywords: ['读书', '阅读', '读完', '看完', '书单', '名著', '啃完'],
    steps: [
      { title: '① 选书并定阅读顺序', estimateMinutes: 15, priority: 'high' },
      { title: '② 通读第一遍做标记', estimateMinutes: 40, priority: 'high' },
      { title: '③ 整理笔记与要点', estimateMinutes: 30, priority: 'medium' },
      { title: '④ 输出书评或分享', estimateMinutes: 30, priority: 'low' },
    ],
  },
  {
    id: 'writing',
    keywords: ['写作', '论文', '作文', '文章', '小说', '公众号', '博客', '剧本', '书稿', '专栏'],
    steps: [
      { title: '① 定选题收集素材', estimateMinutes: 30, priority: 'high' },
      { title: '② 搭好框架与大纲', estimateMinutes: 30, priority: 'high' },
      { title: '③ 一鼓作气写初稿', estimateMinutes: 60, priority: 'medium' },
      { title: '④ 修改润色到定稿', estimateMinutes: 40, priority: 'low' },
    ],
  },
  {
    id: 'art',
    keywords: [
      '画画', '绘画', '素描', '水彩', '油画', '书法', '吉他', '钢琴',
      '小提琴', '尤克里里', '唱歌', '声乐', '摄影', '剪辑', '设计', '手工', '陶艺',
    ],
    steps: [
      { title: '① 掌握基础技法', estimateMinutes: 30, priority: 'high' },
      { title: '② 临摹跟练找手感', estimateMinutes: 40, priority: 'high' },
      { title: '③ 独立完成一件作品', estimateMinutes: 50, priority: 'medium' },
      { title: '④ 总结改进再精进', estimateMinutes: 30, priority: 'low' },
    ],
  },
  {
    id: 'subject',
    keywords: [
      '数学', '物理', '化学', '生物', '历史', '地理', '政治', '高数', '线代',
      '线性代数', '概率论', '专业课', '课程', '网课', '公开课', 'mooc', '课本', '教材',
    ],
    steps: [
      { title: '① 通读教材搭框架', estimateMinutes: 30, priority: 'high' },
      { title: '② 逐章吃透重难点', estimateMinutes: 50, priority: 'high' },
      { title: '③ 做题检验并巩固', estimateMinutes: 45, priority: 'medium' },
      { title: '④ 定期回顾防遗忘', estimateMinutes: 30, priority: 'low' },
    ],
  },
];

/** 中文数字单字 → 阿拉伯数字（「两」按 2 处理） */
const CN_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 中文数字 → 阿拉伯数字（支持 单字 / 十 / 十X / X十 / X十Y，其余返回 null） */
function cnToNumber(s: string): number | null {
  if (/^\d+$/.test(s)) {
    return Number(s);
  }
  if (!/^[一二两三四五六七八九十]+$/.test(s)) {
    return null;
  }
  if (s === '十') {
    return 10;
  }
  const idx = s.indexOf('十');
  if (idx === -1) {
    return s.length === 1 ? (CN_DIGITS[s] ?? null) : null;
  }
  const left = s.slice(0, idx);
  const right = s.slice(idx + 1);
  const tens = left === '' ? 1 : (CN_DIGITS[left] ?? NaN);
  const ones = right === '' ? 0 : (CN_DIGITS[right] ?? NaN);
  if (!Number.isFinite(tens) || !Number.isFinite(ones)) {
    return null;
  }
  return tens * 10 + ones;
}

/** 单位 → 天数换算 */
const UNIT_DAYS: Record<string, number> = { 月: 30, 周: 7, 星期: 7, 天: 1, 日: 1 };

/**
 * 识别目标文本所属的学习领域（关键词打分；同分取领域表靠前者；
 * 未命中 = 'default'）。导出便于单测与后续复用。
 */
export function inferGoalDomain(title: string): GoalDomain {
  const text = title.toLowerCase();
  let best: GoalDomain = 'default';
  let bestScore = 0;
  for (const track of DOMAIN_TRACKS) {
    let score = 0;
    for (const kw of track.keywords) {
      if (text.includes(kw)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = track.id;
    }
  }
  return best;
}

/** 按领域取一份四步模板拷贝（标题即完整步骤名，含序号圈码） */
function tasksForDomain(domain: GoalDomain): DecomposedTask[] {
  const track = DOMAIN_TRACKS.find((t) => t.id === domain);
  return (track ? track.steps : DEFAULT_STEPS).map((s) => ({ ...s }));
}

/**
 * 取一份学习步骤模板（手动新建目标 / 智能排期共用）。
 * @param title 目标标题（可带补充文本）；缺省 = 默认四阶段模板
 */
export function defaultStageTasks(title = ''): DecomposedTask[] {
  return tasksForDomain(inferGoalDomain(title));
}

/** 标题最大长度（超长截断，避免卡片撑破） */
const TITLE_MAX = 30;

/**
 * 拆解一句目标文本。
 * @param raw 用户输入（如「三个月背完六级单词」）
 */
export function decomposeGoalText(raw: string): DecomposedGoal {
  const text = raw.trim().replace(/\s+/g, ' ');
  let title = text;
  let deadlineDays: number | null = null;

  // 时长短语：数字 +（个）月/周/星期/天/日（如「三个月」「30天」「两周」）
  const re = /([0-9]+|[一二两三四五六七八九十]+)\s*个?\s*(月|周|星期|天|日)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // 「第二天」这类序数短语里的数字不是时长描述，跳过
    const prevChar = m.index > 0 ? text[m.index - 1] : '';
    if (prevChar === '第' || prevChar === '初') {
      continue;
    }
    const num = cnToNumber(m[1]);
    if (num !== null && num > 0) {
      deadlineDays = Math.min(730, Math.max(1, num * (UNIT_DAYS[m[2]] ?? 1)));
    }
    // 无论数字能否解析，时长短语都从标题中移除（它是时间描述，不是事项本身）
    title = `${text.slice(0, m.index)}${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
    break;
  }

  if (!title) {
    title = text;
  }
  if (title.length > TITLE_MAX) {
    title = title.slice(0, TITLE_MAX);
  }

  return { title, deadlineDays, tasks: defaultStageTasks(title) };
}
