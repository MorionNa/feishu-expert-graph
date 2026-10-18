import { GraphUI } from './graph-ui.js';
import { normalizeGraph, fakeDemo } from './graph-data.js';
import { showcase } from './showcase.js';
import './style.css';
const $=id=>document.getElementById(id);
const ui=new GraphUI();
const demoParam=new URLSearchParams(location.search).get('demo');
const isDemo=demoParam==='1'||demoParam==='showcase';
const insideHost=window.parent!==window; // Presentation check only; SDK enforces data permissions.
const state={loading:false,queued:false,lastFetchAt:0,editing:false,sdk:null,backend:null,off:[],config:{experts:'专家信息表',careers:'身份和履历表',relations:'人员关系表',baseToken:''}};
let refreshTimer;
function formValues(){return {experts:$('table-experts').value.trim(),careers:$('table-careers').value.trim(),relations:$('table-relations').value.trim(),baseToken:$('base-token').value.trim()};}
function fillForm(){for(const [key,id] of [['experts','table-experts'],['careers','table-careers'],['relations','table-relations'],['baseToken','base-token']])$(id).value=state.config[key]||'';}
function applySavedConfig(saved){const custom=saved?.customConfig;if(!custom||typeof custom!=='object')return;const source=custom.tables&&typeof custom.tables==='object'?custom.tables:custom;for(const key of ['experts','careers','relations','baseToken'])if(typeof source[key]==='string'&&source[key].trim())state.config[key]=source[key].trim();if(source.tableBindings&&typeof source.tableBindings==='object')state.config.tableBindings=source.tableBindings;fillForm();}
async function load(){
  if(isDemo){ui.update(demoParam==='showcase'?showcase():fakeDemo(),true);return;}
  if(!insideHost||!state.backend){ui.notify('请从飞书应用打开此组件。公开页面不读取专家资料。');return;}
  if(state.loading){state.queued=true;return;}
  state.loading=true;ui.busy(true);
  try{const rows=await state.backend.readFeishu(state.config);if(rows.discoveredToken)state.config.baseToken=rows.discoveredToken;ui.update(normalizeGraph(rows.experts,rows.relations,rows.careers),false);state.lastFetchAt=Date.now();}
  catch(err){ui.error('读取失败：'+(err?.message||String(err)));}
  finally{state.loading=false;ui.busy(false);if(state.queued){state.queued=false;clearTimeout(refreshTimer);refreshTimer=setTimeout(load,350);}}
}
function refreshOnReturn(){if(!insideHost||isDemo||state.loading||!state.lastFetchAt)return;if(Date.now()-state.lastFetchAt>30000)load();}
$('reload-btn').onclick=load;
$('demo-btn').onclick=()=>{if(insideHost&&!isDemo){ui.notify('真实飞书页面不自动替换为演示数据。请在独立演示页中体验。');return;}ui.update(fakeDemo(),true);};
$('settings-btn').onclick=()=>{fillForm();const readOnly=insideHost&&!state.editing;for(const id of ['base-token','table-experts','table-careers','table-relations'])$(id).readOnly=readOnly;$('settings-save').hidden=readOnly;$('settings-help').textContent=readOnly?'这里展示已保存的数据源。要永久修改，请通过飞书组件菜单进入配置模式。':'沿用已保存的数据源；修改后请保存组件配置。';$('settings').showModal();};
$('settings-cancel').onclick=()=>$('settings').close();
$('settings-form').onsubmit=async e=>{e.preventDefault();const next=formValues();if(!next.experts||!next.relations)return;Object.assign(state.config,next);$('settings').close();if(state.editing){$('dashboard-config').hidden=false;$('dashboard-save-btn').disabled=false;$('dashboard-save-btn').textContent='保存组件配置';}await load();};
$('dashboard-save-btn').onclick=async()=>{
  const dashboard=state.sdk?.bitable.dashboard,btn=$('dashboard-save-btn');if(!state.editing||typeof dashboard?.saveConfig!=='function'){ui.notify('请在飞书组件的配置模式中保存。',true);return;}
  btn.disabled=true;btn.textContent='正在保存…';
  try{
    // Preserve the working API path and v2 schema; never save actual person records.
    state.config.baseToken=await state.backend.detectBaseTokenForConfig(state.config);
    state.config.tableBindings=await state.backend.captureTableBindings(state.config);
    if(!state.config.baseToken)throw new Error('无法确定 Base 标识，请在数据设置中填写后保存。');
    const result=await dashboard.saveConfig({dataConditions:[],customConfig:{version:2,tables:{...state.config}}});
    if(result===false)throw new Error('飞书没有确认保存成功。');
    btn.textContent='已保存到飞书';ui.notify('配置已保存。返回飞书页面后，图谱会自动加载。');
  }catch(err){btn.disabled=false;btn.textContent='重试保存';ui.notify('保存失败：'+(err?.message||String(err)),true);}
};
async function initialize(){
  if(isDemo){ui.update(demoParam==='showcase'?showcase():fakeDemo(),true);return;}
  if(!insideHost){ui.status('未连接 · 请从飞书应用打开','');ui.empty('连接你的专家库','这是不含专家资料的公开程序页面。在飞书内打开后，自动读取你的关系网络。');return;}
  ui.busy(true);
  // Lazy SDK import keeps public demos independent of the Feishu bridge.
  [state.sdk,state.backend]=await Promise.all([import('@lark-base-open/js-sdk'),import('./feishu.js')]);
  const {bitable,DashboardState}=state.sdk;const dashboard=bitable.dashboard;const mode=dashboard?.state;
  state.editing=mode===DashboardState.Create||mode===DashboardState.Config;
  $('dashboard-config').hidden=!state.editing;
  $('dashboard-config-title').textContent=mode===DashboardState.Create?'首次添加 · 保存图谱到飞书':'配置专家关系图谱';
  if(mode!==DashboardState.Create&&typeof dashboard?.getConfig==='function')applySavedConfig(await dashboard.getConfig());
  await load();
  if(!state.editing&&typeof dashboard?.onDataChange==='function')state.off.push(dashboard.onDataChange(()=>load()));
  if(!state.editing&&typeof dashboard?.onConfigChange==='function')state.off.push(dashboard.onConfigChange(async()=>{try{applySavedConfig(await dashboard.getConfig());await load();}catch(err){ui.error('更新配置失败：'+(err?.message||String(err)));}}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshOnReturn();});window.addEventListener('focus',refreshOnReturn);
}
initialize().catch(err=>{ui.busy(false);ui.error('插件初始化失败：'+(err?.message||String(err)));});
window.addEventListener('pagehide',event=>{if(event.persisted)return;clearTimeout(refreshTimer);state.off.forEach(off=>{if(typeof off==='function')off();});});
