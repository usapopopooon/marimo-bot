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
    "ぽこん。きょうからここに住むよ。",
    "はじめまして。緑のまるです。",
    "きょう生まれたて。まだほやほや。",
    "水槽に、ちょこんとおじゃまします。",
    "ころんと登場。まりもだよ。",
    "ここがおうち？なかなかいいね。",
    "ちいさいけど、ちゃんとまりもだよ。",
    "お水に入ったら、しっくりきたよ。",
    "まるい新人がやってきました。",
    "きょうが一日目。のんびりいくよ。"
  ],
  [
    "まずは、ぷかぷかしてみるね。",
    "お水、いい感じ。気に入ったよ。",
    "名前、つけてもらえるの？わくわく。",
    "これから、ゆるっとよろしくね。",
    "とりあえず、ころんとしておくね。",
    "まだ何もわからないので、丸くなるね。",
    "明日もちょっと育つ予定だよ。",
    "すみっこから、ちらっと見てるよ。",
    "小さい泡と、さっそく友だち。",
    "まずは一日、のんびりいこう。"
  ]
);

const EARLY_DIALOGUES = buildCategory(
  "early",
  [
    "おうちのすみっこ、もう覚えたよ。",
    "きょうも水槽を、ひとまわり。",
    "ちょっとだけ大きくなったかも。",
    "水替えの音、わかってきたよ。",
    "まだ新人だけど、調子はいいよ。",
    "朝からずっと、ころんとしてたよ。",
    "泡の流れに乗る練習をしたよ。",
    "この水槽、だいぶ落ち着くね。",
    "きのうより、丸みが増した気分。",
    "お世話の時間だ。待ってました。"
  ],
  [
    "きょうも、ぷかっと元気。",
    "いいお水だね。ごくごくはしないよ。",
    "このまま、のんびり育つね。",
    "小さくても、やる気はそこそこ。",
    "ひとまず、定位置にもどるね。",
    "まりも生活、なかなか順調。",
    "急がず、じわじわ大きくなるよ。",
    "ころんと一回、よろこびました。",
    "また明日も、ゆるっとよろしく。",
    "きょうのぶんも、丸くなっておくね。"
  ]
);

const EVERYDAY_DIALOGUES = buildCategory(
  "everyday",
  [
    "お水、きらきら。いい感じ。",
    "きょうも丸い。よし。",
    "泡がひとつ。見送ったよ。",
    "水槽の中は、きょうも平和。",
    "ぷかぷか日和だね。",
    "さっきから、ちょっとだけ揺れてるよ。",
    "すみっこで、のんびりしてたよ。",
    "水の音を聞いてたら、ぼんやり。",
    "ころんとしたら、元の場所。",
    "きょうのまりも、調子よし。"
  ],
  [
    "とりあえず、ころん。",
    "このまま、ゆっくりするね。",
    "やることは特にないよ。",
    "丸いのも、けっこう忙しいね。",
    "ちいさい泡に、先をこされたよ。",
    "ごきげんを、ひとつ置いておくね。",
    "ちょっと育った気がする。たぶん。",
    "水替え、ありがと。さっぱり。",
    "このあとも、ぷかぷかします。",
    "明日もだいたい、こんな感じ。"
  ]
);

const BOND_DIALOGUES = buildCategory(
  "bond",
  [
    "だいぶ長く住んでる気がするよ。",
    "水替えの気配、わかるようになったよ。",
    "この水槽なら、目をつぶっても転がれるよ。",
    "毎日の流れ、すっかり覚えたよ。",
    "ちいさかったころ？よく覚えてないよ。",
    "気づけば、ここでは古株だね。",
    "お世話の時間、そろそろだと思ってたよ。",
    "長く育つコツは、たぶん丸さだよ。",
    "何日目でも、やっぱり水はいいね。",
    "きょうもいつもの場所で待ってたよ。"
  ],
  [
    "もはや、水槽のベテランかも。",
    "これからも、じわじわいくね。",
    "慣れても、水替えはうれしいよ。",
    "いつもどおりが、ちょうどいいね。",
    "きょうも安定の、ころんです。",
    "まだまだ、のんびり育つ予定。",
    "丸さだけは、まかせてほしい。",
    "水槽のことなら、ちょっと詳しいよ。",
    "長いつきあい、ゆるく続けよう。",
    "きょうのぶんも、元気にしてるよ。"
  ]
);

const MILESTONE_DIALOGUES = buildCategory(
  "milestone",
  [
    "きょうは連続記録の日だって。",
    "数字がまたひとつ、大きくなったよ。",
    "お世話が続いてる。すごいね。",
    "きょうは、ちょっとした記念日。",
    "連続飼育、ここまで来ました。",
    "水替え回数、こつこつ増えてるよ。",
    "まりも係、かなりいい仕事してるね。",
    "いつもの水替えだけど、きょうは特別。",
    "続けるって、けっこうすごいことだね。",
    "記録更新。まりもからお知らせです。"
  ],
  [
    "お祝いに、ころんと一回転。",
    "きょうは泡も、めでたそう。",
    "拍手のかわりに、ぷかぷかするね。",
    "この調子で、ゆるくいこう。",
    "ごほうびは、丸いまりもです。",
    "ちょっとだけ、えっへん。",
    "水槽のすみで、ばんざい中。",
    "次の記録まで、またのんびり。",
    "おめでとう。お水もおいしい。",
    "まりもも、ちゃんと喜んでるよ。"
  ]
);

const LARGE_DIALOGUES = buildCategory(
  "large",
  [
    "なんだか、ずっしりしてきたよ。",
    "水槽が前より、せまく見えるね。",
    "ころんとすると、水がざぶん。",
    "この丸さ、なかなかのものです。",
    "ちいさい泡が、もっとちいさく見えるよ。",
    "気づいたら、けっこう育ってたよ。",
    "存在感だけは、かなりあるよ。",
    "昔より、転がる音が大きいかも。",
    "まりも界では、大きいほうかもね。",
    "きょうも、どーんと丸いです。"
  ],
  [
    "でも、やることはぷかぷか。",
    "中身はいつものまりもだよ。",
    "まだ大きくなる気はあるよ。",
    "水槽の主っぽくなってきたね。",
    "動きは変わらず、ゆっくりです。",
    "重そう？水の中なら平気だよ。",
    "大きくても、ころんは得意。",
    "場所をとるけど、許してね。",
    "見つけやすさは、ばつぐん。",
    "きょうも堂々と、のんびりするね。"
  ]
);

const SPRING_DIALOGUES = buildCategory(
  "spring",
  [
    "春っぽいね。たぶん。",
    "お水に、明るい光がきたよ。",
    "外はぽかぽかしてるのかな。",
    "春の泡は、ふわっとしてるね。",
    "なんとなく、芽が出そうな気分。",
    "きょうの水槽、ちょっと春色。",
    "花が咲く季節らしいよ。",
    "あたたかくて、まりももゆるゆる。",
    "春風は、水の中まで来るかな。",
    "新しい季節、始まったみたい。"
  ],
  [
    "まりもは、いつもどおり丸いよ。",
    "つられて、ぷかっとしてみたよ。",
    "お花見は、水槽から参加します。",
    "きょうは少し、よく育ちそう。",
    "眠くなるのも、春のせいかな。",
    "小さな泡まで、うれしそう。",
    "のんびりするには、いい日だね。",
    "ころんと春を、見ておくね。",
    "水替え日和ってことにしよう。",
    "あしたも、ぽかぽかだといいね。"
  ]
);

const SUMMER_DIALOGUES = buildCategory(
  "summer",
  [
    "夏だね。お水さいこう。",
    "外は暑そう。ここはひんやり。",
    "日差しが、水面でぴかぴか。",
    "きょうは泡まで、元気だよ。",
    "水槽の中だけ、涼しいね。",
    "入道雲って、まりもより丸い？",
    "夏の光で、緑が濃く見えるよ。",
    "暑い日は、動かないのがいちばん。",
    "きょうのお水、ひんやり新鮮。",
    "夏休み気分で、ぷかぷか。"
  ],
  [
    "まりもは、ここから出ません。",
    "涼しさを、ちょっと分けたいね。",
    "このまま、ゆらゆらしてるよ。",
    "暑さには、丸さで対抗します。",
    "水替え、かなり助かるよ。",
    "日かげ担当は、まかせて。",
    "冷たい泡を、追いかけてみるね。",
    "焦らず、ゆるく夏を越すよ。",
    "きょうも、ひんやりごきげん。",
    "夜までずっと、ぷかぷか予定。"
  ]
);

const AUTUMN_DIALOGUES = buildCategory(
  "autumn",
  [
    "秋だね。水がすっきり。",
    "外の葉っぱ、色が変わったかな。",
    "きょうは、静かな水槽だよ。",
    "秋の夜は、長いらしいね。",
    "涼しくなって、ころん日和。",
    "お月さまって、まりもより丸い？",
    "落ち葉みたいに、ゆらっとしたよ。",
    "実りの秋。まりもも育つよ。",
    "水槽の光が、ちょっとやわらかい。",
    "秋の気配を、泡から感じたよ。"
  ],
  [
    "まりもは、食欲より水欲。",
    "のんびりする時間が増えそう。",
    "きょうも静かに、ぷかぷか。",
    "丸さ比べなら、負けないよ。",
    "水替えの秋ってことにしよう。",
    "すみっこで、季節を見てるね。",
    "夜ふかしはせず、早めにころん。",
    "ちょっと大きくなる予定だよ。",
    "お水が澄んで、よく見えるね。",
    "秋もゆるっと、よろしくね。"
  ]
);

const WINTER_DIALOGUES = buildCategory(
  "winter",
  [
    "冬だね。お水、しゃきっとする。",
    "外は寒そう。まりもは水の中。",
    "泡が雪みたいに、上っていくよ。",
    "きょうの水槽、しんとしてるね。",
    "朝のお水は、ちょっと目が覚める。",
    "雪が降ったら、教えてね。",
    "冬の光で、水がぴかっとしたよ。",
    "寒い日は、丸まるにかぎるね。",
    "水槽のすみで、冬ごもり気分。",
    "きょうも冷えそうな空だね。"
  ],
  [
    "でも、まりもは元気です。",
    "このまま、ぬくぬく気分でいるね。",
    "雪だるまと、丸さを競いたい。",
    "水替えしたら、すっきりしたよ。",
    "春まで、じわじわ育つね。",
    "ぷかぷかすれば、だいたい平気。",
    "きょうも定位置で、ころん。",
    "寒さに負けず、ゆるくいくよ。",
    "あったかい部屋って、いいね。",
    "冬も水槽から、のんびり見てるよ。"
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
