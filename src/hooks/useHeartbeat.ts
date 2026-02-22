import { useEffect, useRef, useCallback } from 'react';
import { HeartbeatEngine, type HeartbeatNotification } from '../core/heartbeat';
import { getConfig } from '../core/config';
import { mcpManager } from '../core/mcpManager';
import { sendHeartbeatNotifications } from '../core/notifier';

interface UseHeartbeatOptions {
  isStreaming: boolean;
  onNotification: (notification: HeartbeatNotification) => void;
}

export function useHeartbeat({ isStreaming, onNotification }: UseHeartbeatOptions) {
  const engineRef = useRef<HeartbeatEngine | null>(null);

  // エンジンの初期化
  useEffect(() => {
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

    const config = getConfig().heartbeat;
    if (config?.enabled) {
      engine.start();
    }

    return () => {
      unsub();
      unsubNotify();
      engine.stop();
      engineRef.current = null;
    };
  // onNotificationは安定参照であることを前提
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isStreaming 変化をエンジンに通知
  useEffect(() => {
    engineRef.current?.setAgentBusy(isStreaming);
  }, [isStreaming]);

  // Visibility API 連携
  useEffect(() => {
    const handleVisibilityChange = () => {
      const engine = engineRef.current;
      if (!engine) return;

      if (document.hidden) {
        // デスクトップ通知が有効ならバックグラウンドでも Heartbeat を継続
        const config = getConfig().heartbeat;
        if (!config?.desktopNotification) {
          engine.stop();
        }
      } else {
        const config = getConfig().heartbeat;
        if (config?.enabled) {
          engine.start();
          // フォアグラウンド復帰時に即座にチェック
          engine.runNow();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 設定変更時にエンジンを再起動/停止
  const syncConfig = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const config = getConfig().heartbeat;
    if (config?.enabled) {
      engine.stop();
      engine.start();
    } else {
      engine.stop();
    }
  }, []);

  return { syncHeartbeatConfig: syncConfig };
}
