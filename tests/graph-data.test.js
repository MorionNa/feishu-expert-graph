import test from 'node:test';
import assert from 'node:assert/strict';
import { cellText, linkedRecordIds, normalizeGraph, shortestPath, fakeDemo } from '../src/graph-data.js';

test('cell value parses rich text, options, lookup and link', () => {
  assert.equal(cellText([{text:'教授'},{text:'院长'}]), '教授、院长');
  assert.equal(cellText({name:'有效'}), '有效');
  assert.deepEqual(linkedRecordIds({recordIds:['recA']}), ['recA']);
});
test('links records by immutable Feishu record IDs rather than duplicate names', () => {
  const people = [
    {recordId:'recA',fields:{人员ID:'P0001',姓名:'张伟'}},
    {recordId:'recB',fields:{人员ID:'P0002',姓名:'张伟'}}
  ];
  const relations = [{recordId:'recR',fields:{关系ID:'R0001',人员A:{recordIds:['recA'],text:'P0001'},人员B:{recordIds:['recB'],text:'P0002'},关系状态:{name:'有效'},关系方向:'A→B'}}];
  const data = normalizeGraph(people,relations);
  assert.equal(data.edges.length,1);
  assert.deepEqual([data.edges[0].a,data.edges[0].b],['P0001','P0002']);
  assert.equal(shortestPath(data.persons,data.edges,'P0002','P0001'),null);
  assert.equal(shortestPath(data.persons,data.edges,'P0001','P0002').hops,1);
});
test('every recorded edge is displayed and used in path finding', () => {
  const data = fakeDemo();
  assert.equal(data.edges.length, 3);
  assert.equal(shortestPath(data.persons, data.edges, 'P0001', 'P0003').hops, 1);
  assert.equal(shortestPath(data.persons, data.edges, 'P0003', 'P0002'), null);
});
test('career current fallback and unknown status fail closed', () => {
  const p=[{recordId:'recP',fields:{人员ID:'P0001',姓名:'李某'}}];
  const c=[{recordId:'recC',fields:{关联人员:{recordIds:['recP']},身份:'博士生',任职状态:'在任/在读'}}];
  const r=[{recordId:'recR',fields:{人员A:{recordIds:['recP']},人员B:{recordIds:['none']}}}];
  const normalized=normalizeGraph(p,r,c);
  assert.equal(normalized.persons[0].current,'博士生');
  assert.equal(normalized.edges.length,0);
  assert.ok(normalized.warnings.length>0);
});

test('handles alternate Feishu link shapes and provides explicit diagnostics', () => {
  const people=[
    {recordId:'recOne',fields:{人员ID:'P0001',姓名:'专家甲'}},
    {recordId:'recTwo',fields:{人员ID:'P0002',姓名:'专家乙'}}
  ];
  const relationships=[
    {recordId:'r1',fields:{人员A:{link_record_ids:['recOne']},人员B:[{record_id:'recTwo'}],关系状态:'已确认有效',关系类型:'合作'}},
    {recordId:'r2',fields:{人员A:[],人员B:[{record_id:'recTwo'}],关系状态:'有效'}}
  ];
  const result=normalizeGraph(people,relationships);
  assert.equal(result.diagnostics.relationsRead,2);
  assert.equal(result.diagnostics.relationsResolved,1);
  assert.equal(result.diagnostics.relationsUnresolved,1);
  assert.equal(result.edges.length,1);
});
