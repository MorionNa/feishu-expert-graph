import { bitable } from '@lark-base-open/js-sdk';
const ALIASES = {experts:['专家信息表','专家'],relations:['人员关系表','人员关系'],careers:['身份和履历表','身份与履历表']};
export async function readFeishu(config){
  let metas;
  try{metas=await bitable.base.getTableMetaList();}catch(e){throw Error('无法访问飞书数据表，请确保在飞书应用中打开。'+(e?.message||''));}
  const output={};
  for(const key of ['experts','relations','careers']){
    const meta=metas.find(t=>[config[key],...ALIASES[key]].includes(t.name));
    if(!meta){if(key==='careers'){output[key]=[];continue;}throw Error('未找到数据表：'+config[key]);}
    const table=await bitable.base.getTableById(meta.id);
    const fields=await table.getFieldMetaList();
    const ids=[];
    let pageToken;
    do {
      const page=await table.getRecordIdListByPage({pageSize:200,...(pageToken?{pageToken}:{})});
      ids.push(...(page.recordIds||page.records||[]));
      pageToken=page.hasMore?page.pageToken:undefined;
    } while(pageToken);
    output[key]=[];
    for(let i=0;i<ids.length;i+=30){
      const chunk=ids.slice(i,i+30);
      const rows=await Promise.all(chunk.map(async recordId=>{
        const values=await Promise.all(fields.map(async f=>[f.name,await table.getCellValue(f.id,recordId)]));
        return {recordId,fields:Object.fromEntries(values)};
      }));
      output[key].push(...rows);
    }
  }
  return output;
}
