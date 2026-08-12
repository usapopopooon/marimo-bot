# marimo-bot

ユーザーごとに、ただ少しずつ大きくなるまりもを育てる Discord Bot。

## ゲームルール

- まりもは日本時間の日付が変わるごとに `0.3 mm` ずつ、上限なく成長する。
- 日本時間で1日1回だけ水を替えられ、1日目は `100 XP`、以後は連続飼育1日ごとに `+10 XP`（最大 `500 XP`）を獲得する。
- 水を替えた次の日を丸一日放置すると、その翌日 `0:00 JST` に枯れる。
- 枯れた後は、次回の水替えで新しい世代を始めるか、`1,000 XP` で同じまりもを復活できる。
- 復活したまりもは世代・名前・大きさを引き継ぎ、枯れていた期間は成長日数に含めない。復活当日は水替え済みとして扱う。
- 水替え・死亡時には、設定したログチャンネルへ現在の飼育画面画像を投稿する。
- 枯れたときは毎回本人へ通知し、連続飼育2日・3日・5日と10日以降10日ごとの水替えでは、ログ末尾で達成を祝って本人へ通知する。
- 新しい水替えログでは、誕生・飼育日数・大きさ・季節に合う1,000種類のセリフからまりものひとことを表示する。同じ利用者の直近7件とは重複させず、選んだセリフは水替え記録へ保存する。
- ログの全履歴を作り直すときは達成表示を再現するが、過去分の通知は送らない。
- セリフ機能より前の水替えには、履歴の意味を変える後付けセリフを表示しない。
- 水替え画像の投稿結果が不明または失敗した場合は、未投稿記録から再投稿する。
- 大きさランキングは表示上の大きさだけで順位を決め、水替え・死亡のたびに同じ常設投稿を編集する。

## Discord コマンド

一般ユーザーは埋め込み形式の水替えパネルにある「育て始める・水を替える」「自分のまりもを見る」「名前をつける」ボタンだけで操作する。初回は自分のまりもが生まれ、以後は同じボタンで1日1回水を替える。「自分のまりもを見る」では、現在の水槽画像・飼育情報・その日に水替えしたまりものセリフを、パネルのチャンネル内で本人だけに表示する。大きさランキングも埋め込み形式で常設する。

利用可能ロールが1件以上設定されている場合、一般ユーザー向けの全パネル操作は、設定ロールのいずれかを持つユーザーまたは「サーバー管理」権限を持つ管理者だけが利用できる。未設定の場合は全員が利用できる。

`サーバーの管理` 権限が必要:

- `/marimo-admin panel type:水替え` — 実行チャンネルへ水替えパネルを投稿
- `/marimo-admin panel type:大きさランキング` — 常設ランキングを投稿
- `/marimo-admin log` — 実行チャンネルを画像ログの投稿先に設定
- `/marimo-admin log-refresh` — 実行チャンネルの旧画像ログを、DBに残る全水替え・死亡履歴から時系列で作り直す
- `/marimo-admin log-disable` — 画像ログを停止
- `/marimo-admin status` — 現在の設定を確認
- `/marimo-admin role add role:<ロール>` — 利用可能ロールを追加
- `/marimo-admin role remove role:<ロール>` — 利用可能ロールを削除
- `/marimo-admin role list` — 利用可能ロールを確認

同種パネルを再投稿すると、以前の水替えパネルは操作不能になり、新しい投稿が正本になる。

## XP連携

水替えとXP付与予定は同じDBトランザクションで確定し、`marimo_xp_awards` に一意な
`event_id` とともに保存される。`XP_WEBHOOK_URL` を設定すると、未配信イベントを次の
JSONで繰り返し送信する。

```json
{
  "event_id": "uuid",
  "guild_id": "Discord guild ID",
  "user_id": "Discord user ID",
  "channel_id": "Discord channel ID",
  "awarded_xp": 100,
  "observed_at": "2026-08-10T12:00:00.000Z"
}
```

level-bot 側の受信先は
`/api/v1/integrations/marimo/watering-events`。復活費用の確定先は
`/api/v1/integrations/marimo/revival-spends`。両Botに同じ
`MARIMO_BOT_API_TOKEN` / `XP_WEBHOOK_TOKEN` を設定する。受信側は `event_id` で冪等に
反映するため、通信失敗後の再送でもXPの付与・消費は重複しない。Webhook未設定時も
付与予定はoutboxに残り、設定後に配信される。

100 XPへの変更前に10 XPで記録された水替えには、起動時に水替えごと一度だけ
`+90 XP` の補填イベントを追加する。元イベントは書き換えないため、配信結果が不明な
場合もlevel-bot側のイベントID衝突や二重補填を起こさない。

## ローカル起動

必要環境は Node.js 22以上（CIは24）、PostgreSQL 16、Discord Bot Token。

```bash
cp .env.example .env
npm install
docker compose up -d db
npm run dev
```

Slash CommandはBotログイン後に自身のApplication IDを使ってグローバル登録される。

## 検証

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

DB統合テストは `TEST_DATABASE_URL` が設定されているときに実行される。

## アイコン

Botアイコンは [`public/bot-icon.png`](public/bot-icon.png)。既存アプリの素材は使用せず、
全面の水色と顔のない緑のまりもだけで構成したオリジナル画像を使用している。

## 生成画像サンプル

実際のログ投稿と同じレンダラーで生成した見本:

- [`public/samples/day-1-10mm.png`](public/samples/day-1-10mm.png) — 生後1日、10 mm
- [`public/samples/day-87-42mm.png`](public/samples/day-87-42mm.png) — 生後87日、42.5 mm
- [`public/samples/day-968-300mm.png`](public/samples/day-968-300mm.png) — 画面いっぱいに育った300 mm
- [`public/samples/memorial-50mm.png`](public/samples/memorial-50mm.png) — 枯れた場合の記録画像

`npm run generate:samples` で同じ4枚を再生成できる。
