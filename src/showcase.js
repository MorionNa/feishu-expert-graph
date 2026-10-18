// Explicit opt-in showcase only. All people, organizations and relationships are fictional.
export function showcase(){
  const rows=[['林知远','结构工程','澄川大学 · 教授'],['许清和','人工智能','云序研究院 · 研究员'],['陈星遥','结构工程','澄川大学 · 博士研究生'],['周以宁','城市治理','临川研究中心 · 主任'],['沈书言','人工智能','云序科技 · 创始人'],['陆景行','材料科学','北辰大学 · 教授'],['顾明川','城市治理','临川研究中心 · 研究员'],['苏予安','材料科学','北辰大学 · 博士研究生'],['江晚晴','结构工程','知行工程 · 技术负责人']];
  const persons=rows.map((r,i)=>({id:'D'+String(i+1).padStart(3,'0'),recordId:'demo-'+i,name:r[0],domain:r[1],current:r[2],careers:[]}));
  const links=[[0,1,'合作','both'],[0,2,'师生','ab'],[0,5,'同学','both'],[0,8,'合作','both'],[1,4,'合作','both'],[1,3,'同事','both'],[3,6,'同事','both'],[5,7,'师生','ab'],[5,8,'合作','both'],[2,4,'同学','both'],[6,8,'合作','both']];
  const edges=links.map(([a,b,type,direction],i)=>({id:'DE'+i,a:persons[a].id,b:persons[b].id,type,direction,directionText:direction==='both'?'双向':'A → B',confirmedAt:'',note:'虚构演示关系，与真实人员无关。'}));
  return {persons,edges,warnings:[]};
}
