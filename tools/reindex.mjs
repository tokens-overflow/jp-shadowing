#!/usr/bin/env node
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), C=path.join(ROOT,'content');
const days = fs.readdirSync(C).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))
  .filter(d=>fs.existsSync(path.join(C,d,'lesson.json')))
  .sort()
  .map(d=>{ const L=JSON.parse(fs.readFileSync(path.join(C,d,'lesson.json'),'utf8'));
            return {date:d, title:L.title, type:L.type} });
fs.writeFileSync(path.join(C,'index.json'), JSON.stringify({days},null,2));
console.log(`index.json: ${days.length} 日`);
