// REST 客户端小工具 —— 软件公司演示档案的两个运行期脚本共用。
// 只包装 HTTP 与登录态,不含任何业务口径(口径在 src/lib 与文档里,脚本不复制)。

export const BASE = (process.env.KPI_BASE_URL ?? `http://localhost:${process.env.OS_PORT ?? 3000}`) + '/api/v1';

/** 演示账号统一口令(仅 dev / test 演示档案使用)。 */
export const DEMO_PASSWORD = 'Passw0rd!23';

let cookie = '';

export function currentCookie() {
  return cookie;
}
export function useCookie(value) {
  cookie = value;
}

export async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

export const rows = (r) => (Array.isArray(r.json) ? r.json : (r.json?.data ?? r.json?.records ?? r.json?.items ?? []));
export const one = (r) => r.json?.record ?? r.json?.data ?? r.json;
export const msg = (r) => JSON.stringify(r.json).slice(0, 240);

export const list = async (object, query = '') => rows(await call('GET', `/data/${object}${query}`));
export const get = async (object, id) => one(await call('GET', `/data/${object}/${id}`));
export const post = (object, body) => call('POST', `/data/${object}`, body);
export const patch = (object, id, body) => call('PATCH', `/data/${object}/${id}`, body);
export const del = (object, id) => call('DELETE', `/data/${object}/${id}`);

export async function signIn(email, password = DEMO_PASSWORD) {
  const res = await fetch(BASE + '/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200) cookie = (res.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
  return res.status;
}

export async function signUp(name, email, password = DEMO_PASSWORD) {
  const res = await fetch(BASE + '/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  return res.status;
}

export async function signInAdmin() {
  const status = await signIn('admin@objectos.ai', 'admin123');
  if (status !== 200) throw new Error(`管理员登录失败:HTTP ${status}(检查 dev 实例是否在 ${BASE} 运行)`);
  return currentCookie();
}

/**
 * 共享规则求值把新记录的共享行「撤销同步、授予异步」地补上(平台把再授予放进合并队列)。
 * 对刚创建的记录给这段异步一个有上限的等待,而不是把断言放宽:超时仍未出现就照常判失败。
 */
export async function waitUntil(label, predicate, timeoutMs = 30000, stepMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) {
      console.log(`  (等待 ${timeoutMs}ms 后 ${label} 仍未就绪)`);
      return false;
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
