import test from 'node:test';
import assert from 'node:assert/strict';
import { cellText, linkedRecordIds, normalizeGraph, shortestPath, visibleEdges, fakeDemo } from '../src/graph-data.js';

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
test('pending and ended edges excluded unless explicitly included', () => {
  const data=fakeDemo();
  assert.equal(visibleEdges(data.edges).length,2);
  assert.equal(visibleEdges(data.edges,true).length,3);
  assert.equal(shortestPath(data.persons,visibleEdges(data.edges),'P0001','P0003').hops,2);
  assert.equal(shortestPath(data.persons,visibleEdges(data.edges,true),'P0001','P0003').hops,1);
  data.edges[0].state='ended';
  assert.equal(visibleEdges(data.edges).length,1);
  assert.equal(shortestPath(data.persons,visibleEdges(data.edges),'P0001','P0003'),null);
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
