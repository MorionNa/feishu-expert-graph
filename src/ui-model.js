// Presentation-only helpers. These never write to Feishu or change relationship validity.
export const tones = [
  {ink:'#2255a4', fill:'#edf4ff', border:'#87abe5'},
  {ink:'#197269', fill:'#eaf6f2', border:'#88b9b0'},
  {ink:'#846528', fill:'#fcf4e6', border:'#cebb8b'},
  {ink:'#695292', fill:'#f2edfa', border:'#b3a0d2'}
];
export function hash(value) { let n=0; for(const c of String(value)) n=(n*31+c.codePointAt(0))>>>0; return n; }
export function toneFor(person) { return tones[hash(person.id)%tones.length]; }
export function initials(name) { return Array.from(String(name||'?')).slice(0,1).join(''); }
export function matches(person,query) { const q=query.trim().toLocaleLowerCase(); return !q || [person.name,person.id,person.domain,person.current].some(v=>String(v||'').toLocaleLowerCase().includes(q)); }
export function nodeKey(id) { return 'person:'+id; }
export function edgeKey(edge,index) { return 'relation:'+(edge.recordId||edge.id||index)+':'+index; }
export function endpoints(edge) { return edge.direction==='ba'?{source:nodeKey(edge.b),target:nodeKey(edge.a)}:{source:nodeKey(edge.a),target:nodeKey(edge.b)}; }
export function formatDate(value) {
  if(value==null||value==='')return '未记录';
  const n=Number(value); if(Number.isFinite(n)&&n>100000000000){const d=new Date(n);if(!isNaN(d))return d.toLocaleDateString('zh-CN');}
  return String(value);
}
export function adjacency(data,id) { const seen=new Set(); return data.edges.filter(e=>e.a===id||e.b===id).map(e=>({edge:e,person:data.persons.find(p=>p.id===(e.a===id?e.b:e.a))})).filter(x=>x.person&&!seen.has(x.person.id)&&seen.add(x.person.id)); }
export function escapeXml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export function avatarData(person){const t=toneFor(person);return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="${t.fill}"/><text x="40" y="42" dominant-baseline="middle" text-anchor="middle" font-size="28" font-family="Arial,Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-weight="600" fill="${t.ink}">${escapeXml(initials(person.name))}</text></svg>`);}
