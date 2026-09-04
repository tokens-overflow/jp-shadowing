#!/usr/bin/env node
// 抓 RSS → 选一篇没用过的 → 打印 article JSON
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '..');
const UA = {headers:{'User-Agent':'Mozilla/5.0'}};

const SOURCES = {
  news: [
    ['ITmedia AI＋','https://rss.itmedia.co.jp/rss/2.0/aiplus.xml'],
  ],
  deep: [
    ['Publickey','https://www.publickey1.jp/atom.xml'],
    ['CodeZine','https://codezine.jp/rss/new/20/index.xml'],
    ['ITmedia AI＋','https://rss.itmedia.co.jp/rss/2.0/aiplus.xml'],
  ],
};
const tag=(s,t)=>{const m=s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').trim():''};

async function feed(site,url){
  try{
    const x = await (await fetch(url,UA)).text();
    const blocks = [...x.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g)].map(m=>m[0]);
    return blocks.map(b=>{
      let link = tag(b,'link');
      if(!link){ const m=b.match(/<link[^>]*href="([^"]+)"/); link = m?m[1]:'' }
      return {site, title:tag(b,'title'), url:link,
              desc:(tag(b,'description')||tag(b,'summary')||tag(b,'content')).slice(0,600)};
    }).filter(i=>i.title && i.url);
  }catch(e){ return [] }
}

async function body(url){
  try{
    const h = await (await fetch(url,UA)).text();
    const t = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'')
      .match(/<p[^>]*>([\s\S]*?)<\/p>/g) || [];
    return t.map(p=>p.replace(/<[^>]+>/g,'').trim()).filter(s=>s.length>25)
            .join('\n').replace(/\n(?:クラウド|プログラミング言語|カテゴリ)[\s\S]*$/,'').slice(0,2500);
  }catch(e){ return '' }
}

const usedFile = path.join(ROOT,'content','used.json');
const used = fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile,'utf8')) : [];
const type = process.argv[2] || 'news';

let pool = [];
for(const [site,url] of SOURCES[type]) pool.push(...await feed(site,url));
// AI 関連を優先。無ければ一般開発トピックにフォールバック
const AI = /\bAI\b|\bLLM\b|\bRAG\b|\bGPU\b|\bGPT\b|生成AI|機械学習|深層学習|大規模言語|エージェント|推論|ChatGPT|OpenAI|Anthropic|Claude|Gemini|Copilot|Transformer|ファインチューニング/;
const fresh = pool.filter(i=>!used.includes(i.url));
const pick = fresh.find(i=>AI.test(i.title+i.desc)) || fresh[0];
if(!pick){ console.error('新しい記事が見つかりません'); process.exit(2) }
pick.body = await body(pick.url) || pick.desc;
pick.type = type;
fs.mkdirSync(path.dirname(usedFile),{recursive:true});
fs.writeFileSync(usedFile, JSON.stringify([pick.url,...used].slice(0,400),null,0));
console.log(JSON.stringify(pick,null,2));
