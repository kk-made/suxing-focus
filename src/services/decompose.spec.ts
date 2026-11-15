/**
 * 规则引擎拆解服务单测（services/decompose.ts）
 */

import { describe, expect, it } from 'vitest';
import { decomposeGoalText, defaultStageTasks, inferGoalDomain } from './decompose';

describe('inferGoalDomain（按目标内容识别学习领域）', () => {
  it('词汇类：背完六级单词 → vocab（与考试类同分时词汇优先）', () => {
    expect(inferGoalDomain('背完六级单词')).toBe('vocab');
  });

  it('考试类：通过 CET-6 → exam（大小写不敏感）', () => {
    expect(inferGoalDomain('通过 CET-6')).toBe('exam');
  });

  it('编程类：学完 Vue 基础 → program', () => {
    expect(inferGoalDomain('学完 Vue 基础')).toBe('program');
  });

  it('语言类：练口语 → language', () => {
    expect(inferGoalDomain('练口语')).toBe('language');
  });

  it('健身类：瘦10斤 → fitness', () => {
    expect(inferGoalDomain('瘦10斤')).toBe('fitness');
  });

  it('阅读类：读完 3 本书 → reading', () => {
    expect(inferGoalDomain('读完 3 本书')).toBe('reading');
  });

  it('写作类：写一篇毕业论文 → writing', () => {
    expect(inferGoalDomain('写一篇毕业论文')).toBe('writing');
  });

  it('艺术类：学会弹吉他 → art', () => {
    expect(inferGoalDomain('学会弹吉他')).toBe('art');
  });

  it('学科类：学完高等数学 → subject', () => {
    expect(inferGoalDomain('学完高等数学')).toBe('subject');
  });

  it('未命中任何关键词 → default', () => {
    expect(inferGoalDomain('整理房间')).toBe('default');
  });
});

describe('defaultStageTasks（按领域生成学习步骤模板）', () => {
  it('词汇目标生成词汇专属四步（不再是通用模板）', () => {
    const steps = defaultStageTasks('背完六级单词');
    expect(steps).toHaveLength(4);
    expect(steps[0]?.title).toContain('词书');
  });

  it('考试目标生成备考四步', () => {
    const steps = defaultStageTasks('通过 CET-6');
    expect(steps.map((s) => s.title)).toEqual([
      '① 研读考纲与题型',
      '② 系统过一遍知识点',
      '③ 刷历年真题',
      '④ 错题复盘与模拟考',
    ]);
  });

  it('未识别领域与缺省参数都回落到默认四阶段模板', () => {
    const fallback = ['① 梳理范围与资料', '② 核心内容逐项攻克', '③ 练习与巩固', '④ 复盘薄弱点'];
    expect(defaultStageTasks('整理房间').map((s) => s.title)).toEqual(fallback);
    expect(defaultStageTasks().map((s) => s.title)).toEqual(fallback);
  });

  it('所有领域模板结构一致：4 步、预估 15~60 分钟、首步高优先级、末步低', () => {
    const samples = [
      '背完六级单词',
      '通过 CET-6',
      '学完 Vue 基础',
      '练口语',
      '瘦10斤',
      '读完 3 本书',
      '写一篇毕业论文',
      '学会弹吉他',
      '学完高等数学',
      '整理房间',
    ];
    for (const title of samples) {
      const steps = defaultStageTasks(title);
      expect(steps).toHaveLength(4);
      expect(steps[0]?.priority).toBe('high');
      expect(steps[3]?.priority).toBe('low');
      for (const s of steps) {
        expect(s.estimateMinutes).toBeGreaterThanOrEqual(15);
        expect(s.estimateMinutes).toBeLessThanOrEqual(60);
        expect(s.estimateMinutes % 5).toBe(0);
      }
    }
  });
});

describe('decomposeGoalText（本地规则引擎拆解）', () => {
  it('解析中文月份并清理标题：三个月背完六级单词', () => {
    const draft = decomposeGoalText('三个月背完六级单词');
    expect(draft.title).toBe('背完六级单词');
    expect(draft.deadlineDays).toBe(90);
    expect(draft.tasks).toHaveLength(4);
    expect(draft.tasks[0]?.priority).toBe('high');
    // 拆解出的步骤贴合目标内容（词汇领域）
    expect(draft.tasks[0]?.title).toContain('词书');
  });

  it('解析阿拉伯数字天数', () => {
    const draft = decomposeGoalText('30天瘦10斤');
    expect(draft.title).toBe('瘦10斤');
    expect(draft.deadlineDays).toBe(30);
  });

  it('解析周数且「两」按 2 处理', () => {
    const draft = decomposeGoalText('两周学完 Vue 基础');
    expect(draft.title).toBe('学完 Vue 基础');
    expect(draft.deadlineDays).toBe(14);
    expect(draft.tasks[0]?.title).toContain('示例');
  });

  it('未识别到时长时 deadlineDays 为 null 且标题原样保留', () => {
    const draft = decomposeGoalText('背单词');
    expect(draft.title).toBe('背单词');
    expect(draft.deadlineDays).toBeNull();
  });

  it('「第二天」这类序数短语不当作时长', () => {
    const draft = decomposeGoalText('第二天开始复习专业课');
    expect(draft.deadlineDays).toBeNull();
    expect(draft.title).toBe('第二天开始复习专业课');
  });

  it('超长标题截断到 30 字', () => {
    const draft = decomposeGoalText('a'.repeat(40));
    expect(draft.title).toHaveLength(30);
  });
});
