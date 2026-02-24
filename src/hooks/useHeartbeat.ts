import { useEffect, useRef, useCallback } from 'react';
import { HeartbeatEngine, type HeartbeatNotification } from '../core/heartbeat';
import { HeartbeatWorkerBridge } from '../core/heartbeatWorkerBridge';
import { getConfig } from '../core/config';
import { mcpManager } from '../core/mcpManager';
import { sendHeartbeatNotifications } from '../core/notifier';
import { getPushSubscription, registerPeriodicSync } from '../core/pushSubscription';

interface UseHeartbeatOptions {
  isStreaming: boolean;
  onNotification: (notification: HeartbeatNotification) => void;
}

/** Layer 3 の初期化: Push Subscription 確認 + Periodic Sync フォールバック */
async function initLayer3(): Promise<void> {
  try {
    const config = getConfig();
    if (!config.heartbeat?.enabled) return;
    if (!config.push?.enabled) return;

    // Push Subscription が有効か確認
    const subscription = await getPushSubscription();
    if (subscription) {
      // Push 購読済み — Periodic Sync もフォールバックとして登録
      await registerPeriodicSync(config.heartbeat.intervalMinutes * 60_000);
    }
  } catch {
    // Layer 3 の初期化失敗は Layer 1/2 に影響しない
  }
}

export function useHeartbeat({ isStreaming, onNotification }: UseHeartbeatOptions) {
  const engineRef = useRef<HeartbeatEngine | null>(null);
  const bridgeRef = useRef<HeartbeatWorkerBridge | null>(null);

  // エンジン + Worker ブリッジの初期化
  useEffect(() => {
    // 層1: メインスレッドエンジン（既存）
    const engine = new HeartbeatEngine(() => mcpManager.getActiveServers());
    engineRef.current = engine;

    const unsub = engine.subscribe(onNotification);

    // デスクトップ通知用リスナー
    const unsubNotify = engine.subscribe((notification) => {
      const cfg = getConfig().heartbeat;
      if (cfg?.desktopNotification) {
        sendHeartbeatNotifications(notification.results);
      }
    });

    // 層2: Worker ブリッジ初期化
    const bridge = new HeartbeatWorkerBridge();
    bridge.init();
    bridgeRef.current = bridge;

    const unsubBridge = bridge.subscribe(onNotification);

    // Worker からの通知もデスクトップ通知に転送
    const unsubBridgeNotify = bridge.subscribe((notification) => {
      const cfg = getConfig().heartbeat;
      if (cfg?.desktopNotification) {
        sendHeartbeatNotifications(notification.results);
      }
    });

    const config = getConfig().heartbeat;
    if (config?.enabled) {
      engine.start();
    }

    // 層3: Push + Periodic Sync の初期化（非同期、失敗しても Layer 1/2 に影響なし）
    void initLayer3();

    return () => {
      unsub();
      unsubNotify();
      unsubBridge();
      unsubBridgeNotify();
      engine.stop();
      bridge.dispose();
      engineRef.current = null;
      bridgeRef.current = null;
    };
  // onNotificationは安定参照であることを前提
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isStreaming 変化をエンジンに通知
  useEffect(() => {
    engineRef.current?.setAgentBusy(isStreaming);
  }, [isStreaming]);

  // Visibility API 切り替え: タブ非表示 → Worker、表示 → メインスレッド
  useEffect(() => {
    const handleVisibilityChange = () => {
      const engine = engineRef.current;
      const bridge = bridgeRef.current;
      if (!engine || !bridge) return;

      const config = getConfig();
      if (!config.heartbeat?.enabled) return;

      if (document.hidden) {
        // タブ非表示 → メインスレッド停止、Worker 開始
        engine.stop();
        bridge.start({
          openaiApiKey: config.openaiApiKey,
          heartbeat: config.heartbeat,
        });
      } else {
        // タブ表示復帰 → Worker 停止、メインスレッド開始 + 即時チェック
        // Layer 3 実行後のタブ復帰時も、taskLastRun で自動的に重複回避
        bridge.stop();
        engine.start();
        engine.runNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 設定変更時にエンジンを再起動/停止（+ Worker 設定同期）
  const syncConfig = useCallback(() => {
    const engine = engineRef.current;
    const bridge = bridgeRef.current;
    if (!engine) return;

    const config = getConfig();
    if (config.heartbeat?.enabled) {
      engine.stop();
      engine.start();
      // Worker にも設定を同期
      if (bridge && document.hidden) {
        bridge.updateConfig({
          openaiApiKey: config.openaiApiKey,
          heartbeat: config.heartbeat,
        });
      }
      // Layer 3 の再初期化
      void initLayer3();
    } else {
      engine.stop();
      bridge?.stop();
    }
  }, []);

  return { syncHeartbeatConfig: syncConfig };
}
