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
    throw new Error('此飞书插件 SDK 未提供工作区数据访问接口，无法在展示模式直接读取原始表格。');
  }
  const app = await workspace.getBitable(token);
  if (!app?.base) {
    throw new Error('工作区无法访问已配置的数据表，请检查应用权限及多维表格标识。');
  }
  return app.base;
}

/**
 * For components already saved before this feature existed, attempt metadata-
 * only discovery. Do not read actual records from unrelated bases. If several
 * bases match, fail rather than using the wrong experts' data.
 */
async function discoverScopedBase(config) {
  if (typeof workspace?.getBaseList !== 'function') {
    throw new Error('图谱尚未绑定数据源。请进入飞书应用编辑模式 → 图谱组件 → 配置，重新保存一次。');
  }
  const list = await workspace.getBaseList({});
  const candidates = (list?.base_list || []).filter(b => b.token);
  if (!candidates.length) {
    throw new Error('未找到可访问的飞书多维表格。请进入图谱组件配置并设置所属多维表格标识。');
  }
  const matches = [];
  // Limit discovery to accessible metadata (not records), and cap requests.
  for (const item of candidates.slice(0, 40)) {
    try {
      const base = await openScopedBase(item.token);
      const metas = await listMeta(base);
      if (containsRequiredTables(metas, config)) {
        matches.push({ token: item.token, base, metas });
      }
    } catch { /* an inaccessible base is not a candidate */ }
    if (matches.length > 1) break;
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error('发现多个同名专家库，不能自动选择。请在图谱组件配置中指定当前多维表格标识。');
  }
  throw new Error('展示模式未找到包含「专家信息表」和「人员关系表」的已授权多维表格。请进入组件配置重新绑定数据源。');
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
  const found = await discoverScopedBase(config);
  return { base: found.base, discoveredToken: found.token, metas: found.metas };
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
  if (config.baseToken) return config.baseToken;
  try {
    const selection = await bitable.base.getSelection();
    const id = selection?.baseId;
    if (typeof id === 'string' && id) return id;
  } catch {}
  // A missing base id is not a reason to save an unsafe or guessed value.
  return '';
}

export async function readFeishu(config) {
  let baseInfo;
  try {
    baseInfo = await getAuthorizedBase(config);
  } catch (err) {
    throw new Error('无法访问飞书表格：' + (err?.message || String(err)));
  }
  const { base } = baseInfo;
  const metas = baseInfo.metas || await listMeta(base);
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
