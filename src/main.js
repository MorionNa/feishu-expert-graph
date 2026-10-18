import cytoscape from 'cytoscape';
import {readFeishu} from './feishu.js';
import {normalizeGraph,visibleEdges,shortestPath,fakeDemo} from './graph-data.js';
import './style.css';
const $=id=>document.getElementById(id);
const state={data:null,cy:null,loading:false,lastFetchAt:0,config:{experts:'专家信息表',careers:'身份和履历表',relations:'人员关系表'}};
const text=(id,val)=>{$(id).textContent=val??'';};
const notice=(val,error=false)=>{text('notice',val);$('notice').className='notice '+(error?'error':'success');};
const line=(root,label,value)=>{const el=document.createElement('div');el.className='detail-row';const a=document.createElement('div');a.className='detail-label';a.textContent=label;const b=document.createElement('div');b.className='detail-value';b.textContent=value||'暂无';el.append(a,b);root.append(el);};
function details(item,type){const root=$('detail-content');root.replaceChildren();if(!item){root.textContent='点击节点或关系连线查看详情。';return;}const h=document.createElement('h3');h.textContent=type==='person'?item.name:item.type;root.append(h);if(type==='person'){line(root,'人员ID',item.id);line(root,'当前身份与任职',item.current);line(root,'研究或业务领域',item.domain);line(root,'履历记录',item.careers.map(c=>[c.org,c.title,c.status].filter(Boolean).join(' · ')).join('\n'));}else{const find=id=>state.data.persons.find(p=>p.id===id)?.name||id;line(root,'人员A',find(item.a));line(root,'人员B',find(item.b));line(root,'关系类型',item.type);line(root,'关系方向',item.directionText);line(root,'最后确认日期',item.confirmedAt);line(root,'备注',item.note);}}
function selects(){for(const key of ['from','to']){const select=$(key),prev=select.value;select.replaceChildren();const head=document.createElement('option');head.value='';head.textContent='选择人员';select.append(head);for(const p of state.data.persons){const o=document.createElement('option');o.value=p.id;o.textContent=p.name+' · '+p.id;select.append(o);}if(state.data.persons.some(p=>p.id===prev))select.value=prev;}}
function graph(){if(!state.data)return;state.cy?.destroy();const edges=state.data.edges;const nodes=state.data.persons.map(p=>({data:{id:p.id,label:p.name+'\n'+p.id}}));const links=edges.map((e,i)=>({data:{id:'e'+i,source:e.a,target:e.b,label:e.type,arrow:e.direction==='both'?'none':'triangle',edgeIndex:i},classes:''}));state.cy=cytoscape({container:$('graph'),elements:[...nodes,...links],layout:{name:'cose',animate:false},wheelSensitivity:.15,style:[{selector:'node',style:{label:'data(label)',width:62,height:62,'text-wrap':'wrap','text-valign':'center','text-halign':'center','font-size':11,'background-color':'#cde3ff','border-width':2,'border-color':'#4787d2'}},{selector:'edge',style:{label:'data(label)','curve-style':'bezier',width:3,'line-color':'#8c9fb9','font-size':10,'target-arrow-shape':'data(arrow)','target-arrow-color':'#8c9fb9'}},{selector:'.pending',style:{'line-style':'dashed','line-color':'#d0a25b'}},{selector:'.dim',style:{opacity:.15}},{selector:'.highlighted',style:{'background-color':'#2771df','line-color':'#2771df','target-arrow-color':'#2771df',width:6,opacity:1}}]});state.cy.on('tap','node',e=>details(state.data.persons.find(p=>p.id===e.target.id()),'person'));state.cy.on('tap','edge',e=>details(edges[e.target.data('edgeIndex')],'edge'));text('stat-people',state.data.persons.length);text('stat-relations',edges.length);text('stat-hidden',state.data.diagnostics?.relationsUnresolved ?? 0);text('graph-subtitle','拖动节点、点击查看详情');$('empty-graph').classList.toggle('hidden',nodes.length>0);selects();}
function render(data,demo){state.data=data;text('source-badge',demo?'虚构演示':'飞书数据');text('stat-source',demo?'演示':'飞书读取');graph();const d=data.diagnostics;if(d&&!demo){notice('读取专家 '+d.expertsRead+' 人、关系记录 '+d.relationsRead+' 条；成功生成连线 '+d.relationsResolved+' 条，未匹配 '+d.relationsUnresolved+' 条。'+(d.relationsUnresolved?' 请核对「人员A」「人员B」的关联字段。':''),!!d.relationsUnresolved);text('graph-warning',d.relationsUnresolved?'未匹配 '+d.relationsUnresolved+' 条':'');}else notice('演示数据完全虚构，不来自飞书。');}
async function load(){
  if (state.loading) return;
  state.loading=true;
  text('reload-btn','同步中…');
  $('reload-btn').disabled=true;
  if (!state.data) {
    text('source-badge','连接中');
    notice('正在自动读取飞书数据，请稍候。');
  }
  try {
    const rows=await readFeishu(state.config);
    render(normalizeGraph(rows.experts,rows.relations,rows.careers),false);
    state.lastFetchAt=Date.now();
  } catch(err) {
    text('source-badge',state.data?'飞书数据':'连接失败');
    notice('自动读取失败：'+(err?.message||err)+'；可以点击「刷新数据」重试。',true);
  } finally {
    state.loading=false;
    $('reload-btn').disabled=false;
    text('reload-btn','刷新数据');
  }
}
function path(){if(!state.cy||!$('from').value||!$('to').value){text('path-result','请选择起点和终点。');return;}const edges=state.data.edges;const result=shortestPath(state.data.persons,edges,$('from').value,$('to').value);state.cy.elements().removeClass('dim highlighted');if(!result){text('path-result','未找到符合当前条件的路径。');return;}text('path-result',result.hops+'跳：'+result.nodes.map(id=>state.data.persons.find(p=>p.id===id)?.name||id).join(' → '));state.cy.elements().addClass('dim');for(const id of result.nodes)state.cy.getElementById(id).removeClass('dim').addClass('highlighted');state.cy.edges().forEach(e=>{if(result.edges.includes(edges[e.data('edgeIndex')]?.id))e.removeClass('dim').addClass('highlighted');});}
$('reload-btn').onclick=load;$('demo-btn').onclick=()=>render(fakeDemo(),true);$('path-btn').onclick=path;$('clear-path').onclick=()=>{state.cy?.elements().removeClass('dim highlighted');text('path-result','已清除高亮。');};$('fit-btn').onclick=()=>state.cy?.fit(undefined,45);$('layout-btn').onclick=()=>state.cy?.layout({name:'cose',animate:true}).run();$('detail-close').onclick=()=>details(null);$('search').oninput=()=>{if(!state.cy)return;const q=$('search').value.trim().toLowerCase();state.cy.elements().removeClass('dim');if(q)for(const p of state.data.persons)if(![p.name,p.id,p.domain].some(s=>s.toLowerCase().includes(q)))state.cy.getElementById(p.id).addClass('dim');};$('settings-btn').onclick=()=>{$('settings').classList.remove('hidden');};$('settings-cancel').onclick=()=>{$('settings').classList.add('hidden');};$('settings-save').onclick=()=>{state.config.experts=$('table-experts').value;state.config.careers=$('table-careers').value;state.config.relations=$('table-relations').value;$('settings').classList.add('hidden');load();};
// The Feishu application embeds this page as an iframe. Start the SDK read automatically,
// and retry on returning to the page if the previously loaded graph may be stale.
// Never silently display real data when opened as a public GitHub Pages page.
const isDemo = new URLSearchParams(location.search).get('demo') === '1';
const insideHost = window.parent !== window;
function refreshOnReturn() {
  if (!insideHost || isDemo || state.loading || !state.lastFetchAt) return;
  if (Date.now() - state.lastFetchAt > 30000) load();
}
if (isDemo) {
  render(fakeDemo(),true);
} else if (insideHost) {
  notice('即将自动读取飞书专家信息与关系…');
  setTimeout(load,300);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') refreshOnReturn();
  });
  window.addEventListener('focus',refreshOnReturn);
} else {
  notice('这里是公开的插件程序页面，不含专家数据。请在飞书应用的「专家关系图谱」组件中使用。');
}
