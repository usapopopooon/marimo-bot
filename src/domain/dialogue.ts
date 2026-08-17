import { createHash } from "node:crypto";

export type MarimoDialogue = Readonly<{
  id: string;
  text: string;
  motifIds: readonly string[];
}>;

type DialogueCategory =
  | "birth"
  | "early"
  | "everyday"
  | "bond"
  | "milestone"
  | "large"
  | "spring"
  | "summer"
  | "autumn"
  | "winter";

type DialogueSelection = {
  eventId: string;
  isBirth: boolean;
  ageDays: number;
  sizeMm: number;
  wateredDate: string;
  recentDialogueIds: readonly string[];
};

function buildCategory(
  category: DialogueCategory,
  beginnings: readonly string[],
  endings: readonly string[]
): MarimoDialogue[] {
  if (beginnings.length !== 10 || endings.length !== 10) {
    throw new Error(
      `${category} dialogue fragments must contain 10 entries each`
    );
  }
  return beginnings.flatMap((beginning, beginningIndex) =>
    endings.map((ending, endingIndex) => ({
      id: `${category}-${String(beginningIndex + 1).padStart(2, "0")}-${String(endingIndex + 1).padStart(2, "0")}`,
      text: `${beginning}${ending}`,
      motifIds: [
        `${category}:beginning:${beginningIndex + 1}`,
        `${category}:ending:${endingIndex + 1}`
      ]
    }))
  );
}

const BIRTH_DIALOGUES = buildCategory(
  "birth",
  [
    "ぽこん。生まれたらしいです。本人にも連絡は来ていません。",
    "はじめまして。緑のまるが来ました。まりも判定はたぶん通っています。",
    "生まれたてなので、まだ設定を読んでいます。",
    "水槽に着きました。荷物は丸さだけです。少なめです。",
    "ころんと登場。着地は水の中でした。",
    "ここがおうちみたい。まずはすみっこを見ます。",
    "小さいけど、まりも判定は出ています。",
    "お水に入ったら、急にそれっぽくなりました。",
    "新入りです。特技は動かなさそうにすること。",
    "一日目なので、何をしても初日記録です。"
  ],
  [
    "泡にあいさつしたら、そのまま上へ行かれました。",
    "最初の予定は、光合成と休憩です。",
    "名前がつくまでは、仮まりもでいます。",
    "まずは定位置を探して、迷います。",
    "きょうのところは、丸く収まります。",
    "最初の仕事は、何も知らないふりです。もうできています。",
    "明日は0.3ミリ先の未来です。",
    "すみっこが空いていたので、予約しました。",
    "小さな泡を先輩と呼ぶか迷っています。",
    "大事件はなし。ぼくの出番もまだなさそうです。"
  ]
);

const EARLY_DIALOGUES = buildCategory(
  "early",
  [
    "水草から新人研修を受けました。内容は揺れることでした。",
    "水槽をひとまわりした気分です。",
    "きのうより少し育ったらしいです。",
    "水替えの音、ちょっとわかるようになりました。",
    "同じ泡を三回見ました。たぶん同期です。",
    "朝からずっと、同じ場所を探検していました。",
    "泡の流れに乗る練習をしました。",
    "この水槽、早くも実家みたいです。",
    "丸みを調整中です。調整前との違いは不明です。",
    "お水が新しくなって、景色がくっきり。"
  ],
  [
    "本日の成長、こっそり進行中です。",
    "できることは少ないけど、数えるほどでもありません。",
    "定位置は、また見失いました。",
    "きょうも無事にまりもをしています。ほかの役はまだ来ていません。",
    "進み方はゆっくり。そういう生き物です。",
    "泡には追いつけませんでした。最初から勝負ではなかったようです。",
    "ひとまず、丸く収まりました。",
    "新人なりに、のびのび沈んでいます。",
    "明日の自分に、0.3ミリ期待します。",
    "事件はないけど、お水はきれいです。"
  ]
);

const EVERYDAY_DIALOGUES = buildCategory(
  "everyday",
  [
    "底の石が動いた気がする。石は知らないって。",
    "水草から相談されたけど、聞こえないふりをした。",
    "同じ泡を三回見た。たぶん顔なじみ。",
    "きょうの水、ちょっと木曜日の味がする。",
    "水槽のすみで何か始まっていた。",
    "泡から伝言を預かったけど、宛名が水だった。",
    "水草と目が合った気がする。水草に目はないらしい。",
    "小石に呼び止められたけど、急いでるふりをした。",
    "知らない透明が増えた気がする。",
    "水面にもうひとりいた。動きがぴったりだった。"
  ],
  [
    "ぼくは今日も動いてないから、たぶん関係ない。",
    "何もわからないまま、丸くしていた。",
    "ぼくより行動力がある。",
    "考えていたら、ただ丸くなっていた。",
    "できることがないので、見守らないことにした。",
    "ぼくも相談する側なので、解決はしていない。",
    "本日の成果は、少し向きが変わったこと。たぶん。",
    "詳しくないけど、まりもとして参加した。",
    "気のせいということで、話はまとまった。",
    "本人はよくわかってないけど、困ってはいない。"
  ]
);

const BOND_DIALOGUES = buildCategory(
  "bond",
  [
    "長く住んでいたら、小石の事情まで少しわかってきました。本人は否定しています。",
    "水替えの気配に、泡より先に気づくことがあります。",
    "この水槽なら、目を閉じても同じ場所にいられます。",
    "毎日の流れ、すっかり覚えました。",
    "小さかったころの写真、本人確認に失敗しました。今も少し怪しいです。",
    "水草から昔の話を聞きました。ぼくの話より長かったです。",
    "いつもの時間が来ると、なんとなくそわそわ。",
    "長く育つコツを考えていました。",
    "何日目でも、新しいお水は新しいです。",
    "きょうも、いつもの場所にいました。"
  ],
  [
    "結論は、だいたい丸さでした。",
    "ベテランらしく、わからないことをそのままにしています。",
    "慣れても、うれしいものはうれしいです。",
    "変わらない日も、ちゃんと増えています。",
    "記憶はあいまいだけど、丸いことだけは確認できました。",
    "まだまだ、じわじわ続く予定です。",
    "水槽のことなら、すみっこだけ詳しいです。そこから出たことがないので。",
    "昔話は、もう少し育ってからにします。",
    "きょうのぶんも、のんびり積み上がりました。",
    "長いつきあい。あわてる理由はありません。"
  ]
);

const MILESTONE_DIALOGUES = buildCategory(
  "milestone",
  [
    "きょうは連続記録の日らしいです。本人はさっき知りました。",
    "数字がまたひとつ、大きくなりました。",
    "毎日が並んで、記録になりました。",
    "きょうは、いつもに小さな旗を立てる日です。",
    "ここまでの日数を数えたら、途中から泡を数えていました。",
    "水替えの回数、こつこつ積み上がっています。",
    "記念日なので、少しだけ姿勢を正しています。",
    "いつもの水替えが、きょうは記録付きです。",
    "続いた日々を、まりもサイズで受け止めています。",
    "記録更新。水槽から静かなお知らせです。"
  ],
  [
    "お祝いに、半回転した気がします。映像は残っていません。",
    "泡も一つ、ちょうど上へ行きました。",
    "拍手はできないので、丸さで参加しています。いつもと同じです。",
    "ここまで来ました。特に急いではいません。",
    "記念品は、いつもより丸い気分です。",
    "ちょっとだけ、誇らしく沈んでいます。",
    "水槽のすみで、ひっそり祝っています。",
    "次の記録までも、普段どおりです。",
    "お水まで、なんだかめでたく見えます。",
    "本人も記録の長さにびっくりしています。"
  ]
);

const LARGE_DIALOGUES = buildCategory(
  "large",
  [
    "なんだか、ずっしりしてきました。",
    "水槽が前より近く見えます。水槽のほうが来た可能性もあります。",
    "ころんとすると、水がざぶんとします。",
    "この丸さ、本人にも見覚えがあります。",
    "小さい泡が、さらに小さく見えます。",
    "気づいたら、けっこう育っていました。",
    "存在感がすみっこからはみ出しています。本人はまだ隠れているつもりです。",
    "昔のサイズを聞いても、にわかには信じられません。",
    "まりも界の基準は知らないけど、大きめです。比較相手も知りません。",
    "きょうも、どーんと丸くいます。"
  ],
  [
    "でも予定は、光合成と休憩です。",
    "中身は変わらず、いつものまりもです。",
    "まだ大きくなる余白を探しています。",
    "水槽の主っぽいけど、権限は何もありません。",
    "動きは変わらず、かなり控えめです。",
    "水の中なので、重さは気にしないことにします。",
    "大きくなっても、方向感覚は育ちませんでした。",
    "場所は取るけど、予定は空いています。",
    "見つけやすさだけは、自信があります。",
    "そろそろ小石のふりは難しそうです。"
  ]
);

const SPRING_DIALOGUES = buildCategory(
  "spring",
  [
    "春っぽい光が、水槽まで来ました。",
    "お水に、明るい模様ができています。",
    "外はぽかぽかしているらしいです。",
    "春の泡は、少しのんびり見えます。ぼくよりは急いでいます。",
    "なんとなく、芽が出そうな気分です。",
    "きょうの水槽、ちょっと春色です。",
    "花が咲く季節だと水草から聞きました。少し得意そうでした。",
    "あたたかくて、まりももほどけそうです。",
    "春風は、水面で引き返したようです。",
    "新しい季節が、そっと始まりました。"
  ],
  [
    "花粉が水中まで来ないので、助かっています。",
    "つられて、少しだけ浮かれています。",
    "お花見は、水槽の窓側から参加します。たぶん見えていません。",
    "きょうは0.3ミリ以上の気分です。",
    "眠いのは春の担当です。ぼくは一年中の担当です。",
    "小さな泡まで、お出かけ中です。",
    "のんびりする理由が、また一つ増えました。",
    "ころんと春を受け止めています。",
    "水替えの音まで、少し軽く聞こえます。",
    "あしたも明るい水だとうれしいです。"
  ]
);

const SUMMER_DIALOGUES = buildCategory(
  "summer",
  [
    "夏です。お水のありがたみが増しています。",
    "外は暑そう。ここは、ひんやり別世界です。",
    "日差しが、水面でぴかぴかしています。",
    "きょうは泡まで勢いがあります。ぼくにはありません。",
    "水槽の中だけ、涼しい顔をしています。",
    "入道雲と丸さを比べようとしました。",
    "夏の光で、緑がいつもより濃いです。",
    "暑い日は、動かないのがいちばんです。",
    "きょうのお水、ひんやり新鮮です。",
    "夏休みのつもりで何もしません。普段との違いは不明です。"
  ],
  [
    "まりもは、もともと水から出ませんでした。",
    "涼しさを抱えて、静かにしています。",
    "入道雲との丸さ比べは、向こうに伝わっていません。",
    "暑さには、丸さで対抗してみます。",
    "新しいお水で、少ししゃきっとしました。",
    "日かげ担当として、すみっこにいます。指名はされていません。",
    "冷たい泡には、やっぱり追いつけません。",
    "夏も、じわじわ進行中です。",
    "きょうも、ひんやりごきげんです。",
    "夜まで予定は空いています。"
  ]
);

const AUTUMN_DIALOGUES = buildCategory(
  "autumn",
  [
    "秋です。お水がすっきり見えます。",
    "外の葉っぱ、色が変わったでしょうか。",
    "きょうは、静かな水槽です。",
    "秋の夜は長いと聞きました。",
    "涼しくなって、ころん日和です。",
    "お月さまと丸さを比べています。",
    "落ち葉みたいに、ゆらっとしました。",
    "実りの秋。ぼくは何が実ったのか確認中です。",
    "水槽の光が、少しやわらかいです。",
    "秋の気配を泡から受信しました。電波ではないらしいです。"
  ],
  [
    "食欲はあるけど、メニューは光だけです。注文方法も知りません。",
    "のんびりする時間が、さらに増えそうです。",
    "音を立てずに、秋へ参加しています。",
    "お月さまとの丸さ比べは、勝手に引き分けにしました。",
    "水替えの秋ということで落ち着きました。",
    "すみっこから、季節を見ています。",
    "夜ふかしの前に、もう眠いです。",
    "じわじわ育つには、ちょうどいい日です。",
    "お水が澄んで、本人までよく見えます。",
    "秋も変わらず、まりもをしています。"
  ]
);

const WINTER_DIALOGUES = buildCategory(
  "winter",
  [
    "冬です。お水が、しゃきっとしています。",
    "外は寒そう。まりもは今日も水の中です。",
    "泡が雪みたいに上っていきます。ぼくは今年も残っています。",
    "きょうの水槽、しんとしています。",
    "朝のお水で、少し目が覚めました。",
    "雪が降ると聞いて、水面を見ています。",
    "冬の光で、水がぴかっとしました。",
    "寒いので丸くなろうと思います。もうなっていました。",
    "水槽のすみで、冬ごもりの構えです。",
    "きょうも冷えそうな空です。"
  ],
  [
    "でも、まりもは平常運転です。",
    "あたたかい気分だけ、先に用意しました。",
    "雪だるまとは似ている気がします。向こうの意見は未確認です。",
    "新しいお水で、すっきりしました。",
    "春まで、目立たない速さで育ちます。",
    "泡を見ていたら、寒さを忘れました。",
    "定位置で、静かに丸まっています。",
    "防寒は完璧です。方法は特にありません。",
    "あったかい部屋を、水越しに感じています。",
    "冬も水槽から、そっと参加します。"
  ]
);

const DIALOGUES_BY_CATEGORY: Readonly<
  Record<DialogueCategory, readonly MarimoDialogue[]>
> = {
  birth: BIRTH_DIALOGUES,
  early: EARLY_DIALOGUES,
  everyday: EVERYDAY_DIALOGUES,
  bond: BOND_DIALOGUES,
  milestone: MILESTONE_DIALOGUES,
  large: LARGE_DIALOGUES,
  spring: SPRING_DIALOGUES,
  summer: SUMMER_DIALOGUES,
  autumn: AUTUMN_DIALOGUES,
  winter: WINTER_DIALOGUES
};

export const MARIMO_DIALOGUES: readonly MarimoDialogue[] = Object.values(
  DIALOGUES_BY_CATEGORY
).flat();

const DIALOGUE_BY_ID = new Map(
  MARIMO_DIALOGUES.map((dialogue) => [dialogue.id, dialogue] as const)
);

export function isCareStreakMilestone(ageDays: number): boolean {
  return (
    Number.isInteger(ageDays) &&
    ([2, 3, 5].includes(ageDays) || (ageDays >= 10 && ageDays % 10 === 0))
  );
}

function hashIndex(seed: string, length: number): number {
  if (length < 1) throw new Error("dialogue candidates cannot be empty");
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % length;
}

function seasonFor(wateredDate: string): DialogueCategory {
  const month = Number(wateredDate.slice(5, 7));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function categoryFor(input: DialogueSelection): DialogueCategory {
  if (input.isBirth) return "birth";
  if (isCareStreakMilestone(input.ageDays)) return "milestone";
  if (input.ageDays <= 7) return "early";

  const categories: DialogueCategory[] = [
    "everyday",
    seasonFor(input.wateredDate)
  ];
  if (input.ageDays >= 30) categories.push("bond");
  if (input.sizeMm >= 50) categories.push("large");
  const category =
    categories[hashIndex(`${input.eventId}:category`, categories.length)];
  if (category === undefined)
    throw new Error("dialogue category selection failed");
  return category;
}

export function selectMarimoDialogue(input: DialogueSelection): MarimoDialogue {
  const category = categoryFor(input);
  const recent = new Set(input.recentDialogueIds.slice(0, 7));
  const recentMotifs = new Set(
    [...recent].flatMap(
      (dialogueId) => DIALOGUE_BY_ID.get(dialogueId)?.motifIds ?? []
    )
  );
  const withoutRepeatedMotifs = DIALOGUES_BY_CATEGORY[category].filter(
    (dialogue) =>
      !recent.has(dialogue.id) &&
      dialogue.motifIds.every((motifId) => !recentMotifs.has(motifId))
  );
  const withoutExactRepeats = DIALOGUES_BY_CATEGORY[category].filter(
    (dialogue) => !recent.has(dialogue.id)
  );
  const available =
    withoutRepeatedMotifs.length > 0
      ? withoutRepeatedMotifs
      : withoutExactRepeats;
  const dialogue =
    available[hashIndex(`${input.eventId}:dialogue`, available.length)];
  if (dialogue === undefined)
    throw new Error("marimo dialogue selection failed");
  return dialogue;
}

export function marimoDialogueText(dialogueId: string | null): string | null {
  if (dialogueId === null) return null;
  return DIALOGUE_BY_ID.get(dialogueId)?.text ?? null;
}
