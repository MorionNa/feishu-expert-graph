// Pure data transformations. This module does not access Feishu, network, or browser storage.
export function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    if (value.text != null) return cellText(value.text);
    if (value.name != null) return cellText(value.name);
    if (value.value != null) return cellText(value.value);
    if (value.label != null) return cellText(value.label);
    if (value.title != null) return cellText(value.title);
  }
  return '';
}

export function linkedRecordIds(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(linkedRecordIds);
  // Some Feishu versions provide linked record IDs as an array of strings.
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (typeof value === 'object') {
    for (const key of ['recordIds', 'link_record_ids', 'record_ids', 'linkedRecordIds']) {
      if (Array.isArray(value[key])) return value[key].flatMap(linkedRecordIds);
    }
    for (const key of ['recordId', 'record_id']) {
      if (value[key]) return [String(value[key])];
    }
    // Do not interpret the visible name/text of a linked record as an identifier.
  }
  return [];
}

function field(record, aliases) {
  for (const name of aliases) {
    if (record && record.fields && Object.prototype.hasOwnProperty.call(record.fields, name)) {
      const val = record.fields[name];
      if (val !== undefined && val !== null) return val;
    }
  }
  return undefined;
}

function strField(record, aliases) {
  return cellText(field(record, aliases)).trim();
}

function normalizedState(value) {
  const v = cellText(value).replace(/\s/g, '');
  if (['有效', '已确认', '确认', '正常', '已核实', '已确认有效', '关系有效', '仍有联系', '存在'].includes(v)) return 'valid';
  if (['已失效', '失效', '已结束', '已撤销', '不存在'].includes(v)) return 'ended';
  return 'pending';
}

function normalizedDirection(value) {
  const v = cellText(value).replace(/\s/g, '').toUpperCase();
  if (['A→B', 'A->B', 'A到B', 'A至B', '人员A→人员B'].includes(v)) return 'ab';
  if (['B→A', 'B->A', 'B到A', 'B至A', '人员B→人员A'].includes(v)) return 'ba';
  return 'both';
}

function currentCareer(value) {
  const v = cellText(value).replace(/\s/g, '');
  return ['在任/在读', '在任', '在读', '现任', '有效'].includes(v);
}

export function normalizeGraph(expertRows, relationRows, careerRows = []) {
  const warnings = [];
  const diagnostics = {
    expertsRead: expertRows.length,
    careersRead: careerRows.length,
    relationsRead: relationRows.length,
    relationsResolved: 0,
    relationsUnresolved: 0,
    selfLinks: 0,
    status: { valid: 0, pending: 0, ended: 0 },
    relationFieldNames: relationRows[0] ? Object.keys(relationRows[0].fields || {}) : []
  };
  const persons = [];
  const byRecord = new Map();
  const byId = new Map();

  for (const row of expertRows) {
    const id = strField(row, ['人员ID', '专家ID']);
    const name = strField(row, ['姓名', '专家姓名']);
    if (!id || !name || !row.recordId) {
      warnings.push('一条专家记录缺少人员ID、姓名或飞书记录ID，已跳过。');
      continue;
    }
    if (byId.has(id)) {
      warnings.push('检测到重复人员ID ' + id + '，已跳过重复记录。');
      continue;
    }
    const person = {
      id, recordId: row.recordId, name,
      domain: strField(row, ['研究或业务领域', '研究领域', '业务领域']),
      current: strField(row, ['当前身份与任职', '当前身份']),
      careers: []
    };
    persons.push(person);
    byId.set(id, person);
    byRecord.set(String(row.recordId), person);
  }

  function getLinkedPerson(value) {
    const ids = [...new Set(linkedRecordIds(value))];
    // One relation endpoint must reference exactly one expert record.
    if (ids.length !== 1) return null;
    const id = ids[0];
    return byRecord.get(id) || byId.get(id) || null;
  }

  for (const row of careerRows) {
    const person = getLinkedPerson(field(row, ['关联人员', '姓名', '人员']));
    if (!person) continue;
    person.careers.push({
      id: strField(row, ['履历ID']),
      title: strField(row, ['身份', '身份/职务', '身份或职务']),
      org: strField(row, ['所属机构', '所属组织', '机构', '所属单位']),
      status: strField(row, ['任职状态', '状态']),
      start: strField(row, ['开始日期', '添加时间']),
      end: strField(row, ['结束日期'])
    });
  }
  for (const p of persons) {
    if (!p.current) {
      p.current = p.careers.filter(c => currentCareer(c.status)).map(c => (c.org ? c.org + ' · ' : '') + c.title).filter(Boolean).join('、');
    }
  }

  const edges = [];
  for (const row of relationRows) {
    const a = getLinkedPerson(field(row, ['人员A', '起点人员', '关联人员A', '关联人A', '关系起点', '起点']));
    const b = getLinkedPerson(field(row, ['人员B', '终点人员', '关联人员B', '关联人B', '关系终点', '终点']));
    if (!a || !b) {
      diagnostics.relationsUnresolved++;
      warnings.push('一条关系记录缺少可识别的两名关联人员，已跳过。请检查人员A、人员B是否为关联字段。');
      continue;
    }
    if (a.id === b.id) {
      diagnostics.selfLinks++;
      warnings.push('一条关系的起点与终点是同一人，已跳过。');
      continue;
    }
    const id = strField(row, ['关系ID']) || String(row.recordId || ('edge-' + edges.length));
    const status = normalizedState(field(row, ['关系状态', '状态', '核验状态']));
    diagnostics.status[status]++;
    edges.push({
      id, recordId: row.recordId || '',
      a: a.id, b: b.id,
      type: strField(row, ['关系类型']) || '未分类',
      direction: normalizedDirection(field(row, ['关系方向', '方向'])),
      directionText: strField(row, ['关系方向', '方向']) || '未标注（按双向处理）',
      state: status,
      stateText: strField(row, ['关系状态', '状态', '核验状态']) || '待核验',
      confirmedAt: strField(row, ['最后确认日期', '最近核实日期', '核验日期']),
      note: strField(row, ['备注', '关系依据', '信息来源'])
    });
  }
  diagnostics.relationsResolved = edges.length;
  return { persons, edges, warnings, diagnostics };
}

export function visibleEdges(edges, includePending = false) {
  return edges.filter(e => e.state === 'valid' || (includePending && e.state === 'pending'));
}

export function shortestPath(persons, edges, from, to) {
  if (!persons.some(p => p.id === from) || !persons.some(p => p.id === to)) return null;
  if (from === to) return { nodes: [from], edges: [], hops: 0 };
  const adj = new Map(persons.map(p => [p.id, []]));
  for (const e of edges) {
    if (!adj.has(e.a) || !adj.has(e.b)) continue;
    if (e.direction === 'both' || e.direction === 'ab') adj.get(e.a).push({ next: e.b, edgeId: e.id });
    if (e.direction === 'both' || e.direction === 'ba') adj.get(e.b).push({ next: e.a, edgeId: e.id });
  }
  const visited = new Set([from]);
  const parents = new Map();
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const step of adj.get(cur)) {
      if (visited.has(step.next)) continue;
      visited.add(step.next);
      parents.set(step.next, { prev: cur, edgeId: step.edgeId });
      if (step.next === to) {
        const nodes = [to], pathEdges = [];
        let back = to;
        while (back !== from) {
          const item = parents.get(back);
          pathEdges.push(item.edgeId);
          nodes.push(item.prev);
          back = item.prev;
        }
        nodes.reverse();
        pathEdges.reverse();
        return { nodes, edges: pathEdges, hops: pathEdges.length };
      }
      queue.push(step.next);
    }
  }
  return null;
}

export function fakeDemo() {
  return {
    persons: [
      { id: 'P0001', name: '专家甲', recordId: 'demo-1', domain: '结构工程', current: 'A大学 · 教授', careers: [] },
      { id: 'P0002', name: '专家乙', recordId: 'demo-2', domain: '智慧防灾', current: 'B研究院 · 研究员', careers: [] },
      { id: 'P0003', name: '专家丙', recordId: 'demo-3', domain: '具身智能', current: 'C大学 · 博士生；D公司 · 创始人', careers: [] }
    ],
    edges: [
      { id: 'R0001', a: 'P0001', b: 'P0002', type: '同学', direction: 'both', directionText: '双向', state: 'valid', stateText: '有效', confirmedAt: '2026-10-01', note: '完全虚构的演示关系' },
      { id: 'R0002', a: 'P0002', b: 'P0003', type: '引荐', direction: 'ab', directionText: 'A→B', state: 'valid', stateText: '有效', confirmedAt: '2026-10-02', note: '完全虚构的演示关系' },
      { id: 'R0003', a: 'P0001', b: 'P0003', type: '合作', direction: 'both', directionText: '双向', state: 'pending', stateText: '待核验', confirmedAt: '', note: '演示待核验关系，默认隐藏' }
    ],
    warnings: []
  };
}