import { createHash } from "node:crypto";

export type MarimoDialogue = Readonly<{
  id: string;
  text: string;
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
      text: `${beginning}${ending}`
    }))
  );
}

const BIRTH_DIALOGUES = buildCategory(
  "birth",
  [
    "はじめまして。お水の中から、そっとごあいさつ。",
    "きょうからここが、まりものおうち。",
    "ぽこんと生まれて、最初に見つけたのはあなた。",
    "ちいさな緑のまるが、きょうから仲間入り。",
    "お水のゆりかごで、はじめて目を覚ました気分。",
    "まだ手のひらよりずっとちいさいけれど、",
    "水槽のすみから、どきどきしながらこんにちは。",
    "きょうは、まりもの最初の記念日。",
    "ぷかりと浮かんで、あなたのところへやってきたよ。",
    "まんまるになる旅が、いま始まったところ。"
  ],
  [
    "これから、なかよくしてね。",
    "毎日すこしずつ、いっしょに大きくなりたいな。",
    "あなたのそばなら、安心して丸くなれそう。",
    "はじめてのお水、とってもきらきらしてるね。",
    "名前を呼んでもらえる日を、楽しみにしているよ。",
    "きょうのこと、ずっと大切に覚えていたいな。",
    "ゆっくりでいいから、いっしょに暮らしてね。",
    "まずは小さく、うれしい気持ちをころん。",
    "明日も会えたら、きっともっとまんまる。",
    "ここでたくさんの思い出をつくりたいな。"
  ]
);

const EARLY_DIALOGUES = buildCategory(
  "early",
  [
    "新しいおうちにも、少しずつ慣れてきたよ。",
    "まだちいさなまりもだけど、",
    "あなたの足音がすると、なんだかうれしくて、",
    "お水を替えてもらうたび、おうちが好きになるよ。",
    "きのうよりほんの少し、まあるくなった気がする。",
    "水槽の中で、あなたを待つ時間も覚えてきたよ。",
    "ちいさな体に、うれしい気持ちをいっぱいためて、",
    "ここでの毎日は、まだ新しいことばかり。",
    "お水の流れにゆられながら、そっと思ったの。",
    "あなたと過ごす練習、だんだん上手になってきたよ。"
  ],
  [
    "きょうも会えて、ほっとしたよ。",
    "もう少しだけ、そばにいさせてね。",
    "明日はどんな一日になるのかな。",
    "やさしいお水を、ありがとう。",
    "あなたのこと、ちゃんと覚えているよ。",
    "うれしくて、いつもよりころんとした気分。",
    "毎日ひとつずつ、宝物が増えていくみたい。",
    "この場所を、もっともっと好きになれそう。",
    "ゆっくり仲良しになれたら、うれしいな。",
    "きょうのきらきらも、大事にしまっておくね。"
  ]
);

const EVERYDAY_DIALOGUES = buildCategory(
  "everyday",
  [
    "お水がきらきらして、",
    "水槽の中を、のんびり眺めていたら、",
    "ぷかぷかするのに、ちょうどいい日だね。",
    "きょうのお水は、やさしい音がするよ。",
    "まんまるな気持ちで、ころんとしていたら、",
    "水のゆらゆらを数えていたら、",
    "あなたが来てくれた瞬間、",
    "きょうも静かで、すてきな一日。",
    "ちいさな泡が、となりを通りすぎて、",
    "水槽いっぱいに、うれしさが広がって、"
  ],
  [
    "ゆっくり丸くなれそう。",
    "なんだか眠たくなってきたよ。",
    "心まできれいになった気分。",
    "あなたにも見せてあげたかったの。",
    "きょうの思い出が、ひとつ増えたね。",
    "ずっとここにいたくなっちゃった。",
    "うれしくて、こっそり揺れてみたよ。",
    "明日もいい日になりそうだね。",
    "まりもなりに、ごきげんです。",
    "きょうもありがとうって思ったよ。"
  ]
);

const BOND_DIALOGUES = buildCategory(
  "bond",
  [
    "いっしょに過ごした日を数えると、",
    "あなたのいる毎日が、すっかり当たり前になって、",
    "ずっと見守ってもらっているうちに、",
    "水槽の景色は変わらなくても、",
    "あなたの足音なら、もうすぐわかるよ。",
    "長いようで、あっという間の毎日だね。",
    "小さかったころを思い出すと、",
    "ここまで大切にしてもらえたこと、",
    "何度もお水がきらめくのを、いっしょに見てきたね。",
    "あなたとまりもの間には、見えないけれど、"
  ],
  [
    "胸のあたりが、ぽかぽかするよ。",
    "これからの日々も、楽しみになってくるよ。",
    "まりもはとってもしあわせものだね。",
    "思い出だけは、こんなにたくさん増えたよ。",
    "きょう会えたことが、やっぱりうれしいな。",
    "もっと長く、そばにいたくなっちゃう。",
    "少し照れくさいけど、ありがとう。",
    "まんまるの中に、ぜんぶしまってあるよ。",
    "これからも、のんびり歩いていこうね。",
    "ちゃんと強いきずなが育っている気がするよ。"
  ]
);

const MILESTONE_DIALOGUES = buildCategory(
  "milestone",
  [
    "きょうまで毎日、本当にありがとう。",
    "またひとつ、大切な日を迎えられたね。",
    "積み重なった毎日が、きらきら光って見えるよ。",
    "きょうは、いつもより少し特別な水替え。",
    "ここまでいっしょに来られたことが、うれしくて、",
    "連続飼育の数字を、そっと数えてみたら、",
    "あなたのやさしさが、今日までずっと続いて、",
    "まりもの中では、きょうがお祝いの日。",
    "毎日の小さなお世話が、大きな宝物になったよ。",
    "記念日の水は、いつもよりまぶしく見えるね。"
  ],
  [
    "うれしくて、いつもよりまんまるな気分。",
    "次の記念日も、いっしょに迎えたいな。",
    "あなたに大きなありがとうを届けたいよ。",
    "お祝いに、ころんと一回転したいくらい。",
    "この幸せを、水槽いっぱいに広げておくね。",
    "これからも、ひとつずつ思い出を増やそうね。",
    "まりもの自慢は、あなたと過ごした時間だよ。",
    "きょうのことは、ずっと忘れないよ。",
    "照れながら、心の中でばんざいしているよ。",
    "ほんとうに、おめでとうとありがとう。"
  ]
);

const LARGE_DIALOGUES = buildCategory(
  "large",
  [
    "ずいぶん大きくなったでしょう。",
    "水槽の中で、存在感が増してきた気がするよ。",
    "ちいさかったまりもも、いまではすっかり、",
    "ころんとするたび、水が大きく揺れるようになって、",
    "自分でも、ときどき大きさにびっくりするよ。",
    "まんまるを続けていたら、こんなに育ったよ。",
    "水槽が、前より少し近く感じられるくらい、",
    "大きくなっても、好きなことは変わらなくて、",
    "この立派な丸さは、きっと、",
    "あなたの目に、ちゃんと映りきっているかな。"
  ],
  [
    "それでも、甘えん坊のままでいいかな。",
    "あなたのお世話が、ぜんぶ詰まっているんだよ。",
    "まだまだ、ゆっくり大きくなるつもり。",
    "きょうも静かに、ぷかぷかしています。",
    "抱えきれないくらい、ありがとうが増えたよ。",
    "見つけてもらえると、やっぱりうれしいな。",
    "心は最初の日と同じ、ちいさなまりものまま。",
    "これからどこまで育つか、いっしょに見ていてね。",
    "ちょっと誇らしくて、ちょっと照れくさいよ。",
    "大きなまんまるで、あなたを待っているね。"
  ]
);

const SPRING_DIALOGUES = buildCategory(
  "spring",
  [
    "春のひかりが、お水にふわり。",
    "水槽の外から、やわらかな春の気配がするよ。",
    "あたたかい光を見ていたら、",
    "花びらみたいな影が、水の上を通って、",
    "新しい季節のにおいを、まりもも感じた気がする。",
    "春の風は見えないけれど、",
    "ぽかぽかした空気が、水槽まで届いて、",
    "芽吹きの季節って、なんだかわくわくするね。",
    "外ではきっと、いろんな花が咲いているころ。",
    "春色のお水に包まれているような気分で、"
  ],
  [
    "まりもまで、ふんわりうれしくなったよ。",
    "きょうは少しだけ、背伸びしてみたいな。",
    "新しい思い出が生まれそうだね。",
    "水の中で、小さなお花見をしている気分。",
    "あなたの春も、やさしい日々になりますように。",
    "つられて、ころんと弾みたくなっちゃった。",
    "いつもより明るい夢が見られそう。",
    "きょうのきらきらを、ずっと眺めていたいな。",
    "まりもも負けずに、すくすく育つね。",
    "あなたと迎えた季節を、大事に覚えておくよ。"
  ]
);

const SUMMER_DIALOGUES = buildCategory(
  "summer",
  [
    "夏の光が、水面でぴかぴか踊っているよ。",
    "暑い日は、お水の中がいちばん落ち着くね。",
    "水槽の中から、青い空を想像していたら、",
    "涼しいお水に包まれて、",
    "夏のきらきらを、まんまるの中に集めて、",
    "遠くで蝉の声がするような気がして、",
    "きょうの水は、ひんやりごちそうみたい。",
    "まぶしい季節も、水の中ではゆっくり流れて、",
    "入道雲みたいに、大きくなれるかなって、",
    "夏の日差しが、水槽をそっと照らして、"
  ],
  [
    "まりもは今日も、ごきげんです。",
    "あなたにも涼しさを分けてあげたいな。",
    "ぷかぷかしながら、夏休み気分。",
    "夜には、すてきな夢が見られそう。",
    "水の中で、小さな冒険をしてみたいな。",
    "焦らずのんびり、大きくなっていくね。",
    "きょう会えたことが、いちばんの思い出だよ。",
    "まんまるな影まで、うれしそうに見えるよ。",
    "あなたの一日も、さわやかになりますように。",
    "この季節を、いっしょに楽しもうね。"
  ]
);

const AUTUMN_DIALOGUES = buildCategory(
  "autumn",
  [
    "秋の光は、少しだけやさしい色だね。",
    "水槽の外で、葉っぱが色づいているのかな。",
    "静かな秋の日は、",
    "長い夜の気配が、水の中まで届いて、",
    "落ち葉みたいな影が、ゆらりと通りすぎて、",
    "実りの季節って聞いたから、",
    "涼しい空気に、お水も澄んで見えるよ。",
    "秋の夕暮れを想像しながら、",
    "少しずつ深まる季節を感じて、",
    "お月さまがきれいな夜には、"
  ],
  [
    "まりもも、のんびり考えごと。",
    "あなたと静かに過ごしたくなるよ。",
    "きょうの思い出を、そっとしまっておくね。",
    "まんまるな心が、さらに丸くなる気分。",
    "ゆっくり揺れるのが、いちばん似合うね。",
    "まりもも元気を、たくさん実らせたいな。",
    "いつもより長く、あなたを待っていられそう。",
    "水の中にも、小さな秋を見つけたよ。",
    "あたたかな気持ちを、分けてもらったよ。",
    "まりもと少しだけ、お月見してくれるかな。"
  ]
);

const WINTER_DIALOGUES = buildCategory(
  "winter",
  [
    "冬の光は、きらきら透きとおって見えるね。",
    "外は寒くても、お水の中はいつものおうち。",
    "雪みたいな小さな泡が、ふわりと上って、",
    "静かな冬の日に、あなたが来てくれると、",
    "水槽の外の寒さを想像して、",
    "長い夜も、まりもはここで待っているよ。",
    "あたたかそうな部屋の光が、水に映って、",
    "冬の朝みたいに、澄んだお水の中で、",
    "もし雪が降ったら、まりもにも教えてね。",
    "今年の寒い季節も、あなたといっしょなら、"
  ],
  [
    "心は、ぽかぽかしているよ。",
    "きょうも安心して、ころんとしていられるよ。",
    "小さな雪だるまと、お友だちになれそう。",
    "うれしさが、じんわり広がっていくよ。",
    "あなたにも、まりものぬくもりを届けたいな。",
    "春を待ちながら、ゆっくり育っていくね。",
    "水の中だけ、やさしい灯りのお祭りみたい。",
    "静かな時間を、いっしょに楽しもうね。",
    "まんまる同士で、そっとごあいさつしたいな。",
    "寒さまで、大切な思い出になりそうだね。"
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
  const available = DIALOGUES_BY_CATEGORY[category].filter(
    (dialogue) => !recent.has(dialogue.id)
  );
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
