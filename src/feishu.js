import { bitable, workspace, DashboardState } from '@lark-base-open/js-sdk';

const ALIASES = {
  experts: ['专家信息表', '专家'],
  relations: ['人员关系表', '人员关系'],
  careers: ['身份和履历表', '身份与履历表', '身份与履历']
};

// Explicitly separate dashboard configuration mode from permanent display mode.
// bitable.base is not permitted in a saved dashboard component's View mode.
export function isDashboardConfigMode(state = bitable.dashboard?.state) {
  return state === DashboardState.Create || state === DashboardState.Config;
}

function tableNames(config, key) {
  return [...new Set([config[key], ...ALIASES[key]].filter(Boolean))];
}

function containsRequiredTables(metas, config) {
  return ['experts', 'relations'].every(key =>
    metas.some(meta => tableNames(config, key).includes(meta.name))
  );
}

async function listMeta(base) {
  if (typeof base?.getTableMetaList === 'function') {
    try {
      const metas = await base.getTableMetaList();
      if (Array.isArray(metas)) return metas;
    } catch (err) {
      // Some scoped workspace clients only expose getTableList.
      if (typeof base.getTableList !== 'function') throw err;
    }
  }
  if (typeof base?.getTableList !== 'function') {
    throw new Error('当前飞书接口无法列出数据表元信息。');
  }
  const tables = await base.getTableList();
  return Promise.all(tables.map(async table => ({
    id: table.id || await table.getId?.(),
    name: table.name || await table.getName()
  })));
}

function workspaceSupported() {
  return typeof workspace?.getBitable === 'function';
}

async function openScopedBase(token) {
  if (!workspaceSupported()) {
    throw new Error('此飞书插件 SDK 未提供 workspace.getBitable 读取接口。');
  }
  let app;
  try { app = await workspace.getBitable(token); }
  catch (err) { throw new Error('workspace.getBitable 失败：' + (err?.message || String(err))); }
  if (!app?.base) {
    throw new Error('workspace.getBitable 没有返回多维表格实例，请检查应用权限和 Base 标识。');
  }
  return app.base;
}

/**
 * For components already saved before this feature existed, attempt metadata-
 * only discovery. Do not read actual records from unrelated bases. If several
 * bases match, fail rather than using the wrong experts' data.
 */
async function discoverScopedBase(config) {
  // Workspace enumeration is not available in many Feishu *View* environments.
  // Only call this while configuring a plugin, NEVER on a saved graph page.
  if (!isDashboardConfigMode()) {
    throw new Error('该图谱尚未在飞书配置模式绑定多维表格标识。请编辑图谱组件，填写 Base 标识并重新保存。');
  }
  if (typeof workspace?.getBaseList !== 'function') {
    throw new Error('配置模式无法列出飞书工作区，请手动填写专家库的 Base 标识。');
  }
  let list;
  try { list = await workspace.getBaseList({}); }
  catch (e) { throw new Error('配置模式获取工作区列表失败：' + (e?.message || String(e))); }
  const candidates = (list?.base_list || []).filter(b => b.token);
  if (!candidates.length) throw new Error('当前账号没有可枚举的飞书多维表格，请手动填写 Base 标识。');
  const matches = [];
  for (const item of candidates.slice(0, 40)) {
    try {
      const base = await openScopedBase(item.token);
      const metas = await listMeta(base);
      if (containsRequiredTables(metas, config)) {
        matches.push({ token: item.token, base, metas });
      }
    } catch { /* skip inaccessible bases */ }
    if (matches.length > 1) break;
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error('发现多个同名专家库，请手动指定 Base 标识以防读取错误的库。');
  throw new Error('没有找到匹配的三张表，请手动填写当前专家库的 Base 标识。');
}

async function getAuthorizedBase(config) {
  if (isDashboardConfigMode()) {
    return { base: bitable.base, discoveredToken: '' };
  }
  if (config.baseToken) {
    try {
      return { base: await openScopedBase(config.baseToken), discoveredToken: config.baseToken };
    } catch (err) {
      throw new Error('展示模式读取已绑定数据源失败：' + (err?.message || String(err)) + '。请检查权限，或进入组件配置更改数据源。');
    }
  }
  // NEVER enumerate other bases in View mode: Feishu restricts workspace
  // enumeration, and the resulting config-mode-only error is not recoverable
  // by repeated refreshes.
  throw new Error('展示模式缺少已保存的 Base 标识。请编辑组件 → 数据设置，填写专家库 Base 标识，点击「保存并添加到页面」重新绑定。');
}

async function readTable(table, meta) {
  const fields = await table.getFieldMetaList();
  let token;
  const all = [];
  do {
    const page = await table.getRecordsByPage({
      pageSize: 200,
      ...(token ? { pageToken: token } : {})
    });
    for (const record of page.records || []) {
      const normalizedFields = {};
      for (const field of fields) {
        if (Object.hasOwn(record.fields || {}, field.id)) {
          normalizedFields[field.name] = record.fields[field.id];
        } else if (Object.hasOwn(record.fields || {}, field.name)) {
          normalizedFields[field.name] = record.fields[field.name];
        }
      }
      all.push({ recordId: record.recordId, fields: normalizedFields });
    }
    if (page.hasMore && !page.pageToken) throw new Error('分页读取缺少下一页标记：' + meta.name);
    token = page.hasMore ? page.pageToken : undefined;
  } while (token);
  return all;
}

export async function detectBaseTokenForConfig(config) {
  if (!isDashboardConfigMode()) return config.baseToken || '';
  if (config.baseToken?.trim()) return config.baseToken.trim();
  try {
    const selection = await bitable.base.getSelection();
    const id = selection?.baseId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  } catch { /* App-mode iframe may have no active table selection. */ }
  try {
    const match = await discoverScopedBase(config);
    return match.token;
  } catch {
    // Do not guess a Base ID; prompt the user to supply the ID from their
    // private Feishu /base/<ID> URL in the component's configuration panel.
    return '';
  }
}

export async function readFeishu(config) {
  let baseInfo;
  try {
    baseInfo = await getAuthorizedBase(config);
  } catch (err) {
    throw new Error('无法访问飞书表格：' + (err?.message || String(err)));
  }
  const { base } = baseInfo;
  let metas;
  try { metas = baseInfo.metas || await listMeta(base); }
  catch (err) { throw new Error('读取数据表元信息失败：' + (err?.message || String(err))); }
  const output = { experts: [], relations: [], careers: [] };
  for (const key of ['experts', 'relations', 'careers']) {
    const meta = metas.find(t => tableNames(config, key).includes(t.name));
    if (!meta) {
      if (key === 'careers') continue;
      throw new Error('找不到数据表「' + config[key] + '」，请检查数据设置。');
    }
    try {
      const table = await base.getTableById(meta.id);
      output[key] = await readTable(table, meta);
    } catch (err) {
      throw new Error('读取「' + meta.name + '」失败：' + (err?.message || String(err)));
    }
  }
  return { ...output, discoveredToken: baseInfo.discoveredToken || '' };
}
