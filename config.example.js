// 太鼓ウェーブの設定のひな形。このファイルを config.js にコピーして、値を書き換えてください。
// config.js は git の管理外です（.gitignore）。ビルド時に読み込まれ、ページに埋め込まれます。

// Google アナリティクス 4 の測定 ID（G-…）または Google タグマネージャーのコンテナ ID（GTM-…）。
// 使わないときは空の文字列にします。
const GTM_ID = '';

// 2人プレイ（対戦・協力）で使う Firebase の Web 用の設定。
// Firebase コンソールの「プロジェクトの設定 > 全般 > マイアプリ」に表示されるものをそのまま貼ります。
// 使わないときは、このまま（ひな形の値のまま）にしておくと、2人プレイのボタンが出なくなります。
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};
