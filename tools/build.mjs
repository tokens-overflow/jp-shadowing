#!/usr/bin/env node
// article JSON(stdin) → claude で口語稿に書き換え → lesson.json
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {execFileSync} from 'child_process';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const art = JSON.parse(fs.readFileSync(0,'utf8'));
const date = process.argv[2] || new Date().toISOString().slice(0,10);

// 直近7日の語彙を渡して、まる被りを避ける
let recent = [];
try{
  const days = JSON.parse(fs.readFileSync(path.join(ROOT,'content/index.json'),'utf8')).days;
  for(const d of days.slice(-7)){
    const L = JSON.parse(fs.readFileSync(path.join(ROOT,'content',d.date,'lesson.json'),'utf8'));
    recent.push(...L.vocab.map(v=>v.w));
  }
}catch(e){}

const SCENE = art.type==='deep'
  ? '技術的な内容を、同僚に噛み砕いて説明する場面。仕組みや判断基準まで踏み込む。'
  : 'ニュースを定例で共有し、自分のチームに関わる提案を一つ出す場面。';

const PROMPT = `あなたは日本語教材のライターです。中国語母語の学習者向けに「シャドーイング」用の教材を1課分つくってください。

# 学習者
- 商談・会議の日本語はだいたい聞き取れる。技術文書も読める。
- **漢語（推論・精度・検証・要件定義のような漢字熟語）は中国語話者にとってタダで分かるので、難易度にならない。**
- 本当の弱点は次の4つ:
  1. 和語動詞・複合動詞（洗い出す／切り分ける／目減りする／踏み込む／絞る）
  2. ビジネス慣用表現（叩き台／線引き／握る／揉める／余裕を見る／他人事）
  3. カタカナの職場語（アサイン／エスカレ／ペンディング／temperature感）
  4. 文末をぼかす言い方（〜と思っていて。／〜かなと。／〜できればと。）
- 目標: 日本人と会議で議論するとき、聞き取れて、かつ自分の意見を言えるようになること。

# 今日の素材
媒体: ${art.site}
見出し: ${art.title}
本文: ${art.body.slice(0,2200)}

# 場面設定
${SCENE}

# 出力（JSONのみ。説明文・コードフェンス禁止）
{
 "date":"${date}",
 "type":"${art.type}",
 "title":"12字以内の日本語タイトル",
 "source":{"site":"${art.site}","title":${JSON.stringify(art.title)},"url":${JSON.stringify(art.url)}},
 "mono":{"label":"定例での共有（独白）","sentences":[{"ja":"…","asr":"…","zh":"自然な中国語訳"}]},
 "dialog":{"label":"上司とのやりとり（対話）","turns":[{"sp":"A","ja":"…","zh":"…"}]},
 "vocab":[{"w":"語","r":"よみ","zh":"中国語の意味","note":"使い方。最重要の3〜5件はnoteを★で始める"}],
 "patterns":[{"p":"型","zh":"意味","use":"どんな場面で・なぜそう言うか。最重要の3〜4件はuseを★で始める"}]
}

# 厳守
1. mono: 9〜11文・合計330〜380字。**話し言葉**であること（書き言葉の朗読は不可）。
   〜んですが／〜じゃないですか／というのも／〜と思っていて／ただ／とはいえ を自然に混ぜる。
   最後は必ず「提案＋相手への確認（〜んですが、いかがでしょうか 等）」で締める。
2. dialog: 10ターン。A=相手（上司・同僚。質問や反論をする）、B=自分。
   Bの発言は必ず「意見→根拠→留保」の型を見せること。Aは短く、Bはやや長く。
3. vocab: 18〜22件。**和語動詞・複合動詞・慣用表現・カタカナ職場語を中心に。**
   漢語は「読みが罠（他人事=ひとごと、目処=めど等）」か「中国語と意味がズレる」場合のみ入れる。
   すべて mono か dialog に実際に出てくる語であること。
4. patterns: 8〜10件。mono/dialog に実在する言い回しから抽出。
5. zh は自然な中国語。直訳調にしない。
5b. **asr**: その文を音声認識がそのまま書き起こしそうな表記にしたもの。
   英字・記号・数字は「読み」で書く（RIZAP→ライザップ、OpenAI→オープンエーアイ、
   GPT-6→ジーピーティーシックス、3割→さんわり）。それ以外は ja と同じでよい。
   採点で表記ゆれによる減点を防ぐために使う。mono の各文に必ず付けること。
6. 直近に出した語（なるべく重複を避ける。重要語の再登場は可）: ${recent.slice(0,60).join('、')||'なし'}

JSONのみを出力。`;

const raw = execFileSync('claude',['-p'],{input:PROMPT,encoding:'utf8',maxBuffer:1<<24});
const m = raw.match(/\{[\s\S]*\}/);
if(!m){ console.error('JSON が取れませんでした:\n'+raw.slice(0,800)); process.exit(1) }
const L = JSON.parse(m[0]);

// 検収
const errs=[];
const chars = L.mono.sentences.map(s=>s.ja).join('').length;
if(L.mono.sentences.length<8||L.mono.sentences.length>13) errs.push(`mono 文数 ${L.mono.sentences.length}`);
if(chars<280||chars>430) errs.push(`mono 字数 ${chars}`);
if(L.dialog.turns.length<8) errs.push(`dialog ターン ${L.dialog.turns.length}`);
if(L.vocab.length<14) errs.push(`vocab ${L.vocab.length}`);
if(L.patterns.length<6) errs.push(`patterns ${L.patterns.length}`);
if(errs.length){ console.error('検収 NG: '+errs.join(' / ')); process.exit(1) }

const dir = path.join(ROOT,'content',date);
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'lesson.json'), JSON.stringify(L,null,2));
console.error(`  ${L.title} — mono ${L.mono.sentences.length}文/${chars}字, dialog ${L.dialog.turns.length}, 語彙 ${L.vocab.length}, 型 ${L.patterns.length}`);
console.log(dir);
