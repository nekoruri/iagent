# Declarative Web Push 検討メモ（2026-03）

## 結論
- PoC 期間は Declarative Web Push へ移行せず、既存の Push（VAPID + `ServiceWorkerRegistration.pushManager`）と Periodic Background Sync フォールバックを継続する。

## 調査サマリ
- WebKit は Declarative Web Push を発表し、iOS/iPadOS 18.4 および macOS 18.5 で利用可能と記載している。
- 仕様は W3C Push API の拡張提案（PR）として議論中で、標準の確定版には未反映。
- MDN の現行 PushManager ガイドは、依然として Service Worker 登録経由（`ServiceWorkerRegistration.pushManager`）を前提に説明している。

## iAgent への判断
- 現行実装は `src/core/pushSubscription.ts` で `navigator.serviceWorker.ready` + `registration.pushManager` を中核にしており、既にブラウザ実装差を吸収した運用ができている。
- Declarative Web Push を PoC 段階で導入すると、Safari 先行実装に依存した分岐実装と検証コストが増える。
- サーバーレス化の可能性はあるが、現時点ではクロスブラウザの再現性を優先する。

## 再検討トリガー
- Chromium 系で Declarative Web Push が stable 提供され、主要 2 エンジン以上で同等機能が利用可能になった時点。
- Push API 拡張が仕様として安定し、互換性リスクが下がった時点。

## 参照
- WebKit: Meet Declarative Web Push  
  https://webkit.org/blog/16535/meet-declarative-web-push/
- W3C Push API PR: Declarative Web Push Extensions  
  https://github.com/w3c/push-api/pull/385
- MDN: PushManager  
  https://developer.mozilla.org/en-US/docs/Web/API/PushManager
