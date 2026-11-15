/**
 * 学习计时器 store（阶段4）
 * ============================================================
 * 设计要点：
 * 1. 计时基于时间戳（startedAt / lastResumeAt / accumulatedMs），不依赖
 *    setInterval 计秒——页面切走、应用被系统节流都不丢时间；
 * 2. 会话持久化：应用被杀后重启时，restoreAfterLaunch 按最后一次心跳
 *    （lastTickAt，运行期间每 30 秒写入）截断运行时间并自动暂停，
 *    避免把离线数天的时间误算为学习时长；
 * 3. 结束并记录：由 services/stats.ts 的纯函数（有单测）计算时长，
 *    不足最小有效时长（MIN_VALID_LOG_MINUTES）时丢弃本次计时。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TimerSession } from '@/types/models';
import { calcElapsedMs, calcLogMinutes, isDurationValid } from '@/services/stats';
import { useStudyLogStore } from '@/stores/studyLog';

/** 运行期间的心跳间隔（毫秒）：定期落盘 lastTickAt，供重启恢复截断 */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** 结束计时的结果 */
export type StopTimerResult =
  | { ok: true; minutes: number; taskTitle: string }
  | { ok: false; reason: 'no_session' }
  | { ok: false; reason: 'too_short'; seconds: number };

export const useTimerStore = defineStore(
  'timer',
  () => {
    /** 当前计时会话（null = 没有进行中的计时） */
    const session = ref<TimerSession | null>(null);

    /** 心跳定时器（仅运行期间存在；普通变量，不属于响应式状态） */
    let heartbeatId: ReturnType<typeof setInterval> | null = null;

    function startHeartbeat(): void {
      if (heartbeatId !== null) {
        return;
      }
      heartbeatId = setInterval(() => {
        if (session.value && session.value.running) {
          session.value.lastTickAt = Date.now();
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat(): void {
      if (heartbeatId !== null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    }

    /** 开始为某个任务计时（调用方负责处理「已有进行中的计时」的交互确认） */
    function start(payload: {
      taskId: string;
      goalId: string;
      planItemId?: string;
      taskTitle: string;
    }): void {
      stopHeartbeat();
      const now = Date.now();
      session.value = {
        taskId: payload.taskId,
        goalId: payload.goalId,
        planItemId: payload.planItemId ?? '',
        taskTitle: payload.taskTitle,
        startedAt: now,
        accumulatedMs: 0,
        lastResumeAt: now,
        running: true,
        lastTickAt: now,
        pausedByRestore: false,
      };
      startHeartbeat();
    }

    /** 暂停（仅运行中生效） */
    function pause(): void {
      const current = session.value;
      if (!current || !current.running || current.lastResumeAt === null) {
        return;
      }
      const now = Date.now();
      current.accumulatedMs += Math.max(0, now - current.lastResumeAt);
      current.lastResumeAt = null;
      current.running = false;
      current.lastTickAt = now;
      stopHeartbeat();
    }

    /** 继续（仅暂停中生效） */
    function resume(): void {
      const current = session.value;
      if (!current || current.running) {
        return;
      }
      const now = Date.now();
      current.lastResumeAt = now;
      current.running = true;
      current.lastTickAt = now;
      current.pausedByRestore = false;
      startHeartbeat();
    }

    /**
     * 结束计时并写入学习记录
     * - 时长 = 计时器累计的真实学习毫秒（不含暂停），由纯函数换算为分钟；
     * - 不足最小有效时长时丢弃本次计时，不产生记录。
     */
    function stopAndRecord(): StopTimerResult {
      const current = session.value;
      if (!current) {
        return { ok: false, reason: 'no_session' };
      }
      const now = Date.now();
      const elapsedMs = calcElapsedMs(current, now);
      stopHeartbeat();
      session.value = null;
      if (!isDurationValid(elapsedMs)) {
        return { ok: false, reason: 'too_short', seconds: Math.floor(elapsedMs / 1000) };
      }
      const minutes = calcLogMinutes(elapsedMs);
      useStudyLogStore().addLog({
        startAt: current.startedAt,
        endAt: now,
        elapsedMs,
        taskId: current.taskId,
        goalId: current.goalId,
        planItemId: current.planItemId,
      });
      return { ok: true, minutes, taskTitle: current.taskTitle };
    }

    /** 放弃计时（不写记录） */
    function discard(): void {
      stopHeartbeat();
      session.value = null;
    }

    /**
     * 应用启动时恢复计时状态（由 App.vue onLaunch 调用）
     * 运行中的会话按最后一次心跳截断（不把离线时间算入），并自动暂停，
     * 由首页提示用户「继续 / 结束并记录 / 放弃」。
     */
    function restoreAfterLaunch(): void {
      const current = session.value;
      if (!current || !current.running) {
        return;
      }
      const resumeAt = current.lastResumeAt ?? current.lastTickAt;
      current.accumulatedMs += Math.max(0, current.lastTickAt - resumeAt);
      current.lastResumeAt = null;
      current.running = false;
      current.pausedByRestore = true;
      stopHeartbeat();
    }

    return {
      session,
      start,
      pause,
      resume,
      stopAndRecord,
      discard,
      restoreAfterLaunch,
    };
  },
  { persist: true },
);
