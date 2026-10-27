// FCMのバックグラウンド通知を受け取るためのサービスワーカー(ひな形)。
// public/firebase-messaging-sw.js は、ビルドのとき scripts/generate-sw.mjs が
// このファイルから作る(Git には入れない)。値は NEXT_PUBLIC_FIREBASE_* と同じ。
// 元々ブラウザに公開される情報なので、生成したファイルに入って問題ない。

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp(__FIREBASE_CONFIG__);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "おさいふびより:お知らせ";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, { body });
});
