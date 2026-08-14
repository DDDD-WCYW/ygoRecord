// local-db.js
// 本地文档数据库:实现微信云开发数据库 API 的最小子集,
// 供由云函数移植而来的 local-api 业务逻辑直接使用。
// 数据常驻内存,防抖持久化;在 uni-app 环境写入 Storage,在 Node 环境写入 JSON 文件(供冒烟测试)。

const PERSISTED_COLLECTIONS = [
  "ygo_decks",
  "ygo_match_records",
  "ygo_dict_items",
  "ygo_dict_memberships",
  "ygo_deck_cards",
  "ygo_deck_images",
  "ygo_card_images",
  "ygo_sync_state",
  "ygo_record_edit_logs",
  "ygo_messages",
  "ygo_message_reactions",
];

const STORAGE_PREFIX = "ygo_db:";
const PERSIST_DEBOUNCE_MS = 300;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// ---------- 存储适配 ----------

// 默认适配 uni Storage;无 uni 环境(如 Node 冒烟测试未注入 shim 时)退化为纯内存
const memoryFallbackStorage = new Map();

function getUniObject() {
  if (typeof uni !== "undefined" && typeof uni.setStorageSync === "function") {
    return uni;
  }
  if (
    typeof globalThis !== "undefined" &&
    globalThis.uni &&
    typeof globalThis.uni.setStorageSync === "function"
  ) {
    return globalThis.uni;
  }
  return null;
}

function storageRead(key) {
  const runtime = getUniObject();
  if (runtime) {
    return runtime.getStorageSync(key) || "";
  }
  return memoryFallbackStorage.get(key) || "";
}

function storageWrite(key, value) {
  const runtime = getUniObject();
  if (runtime) {
    runtime.setStorageSync(key, value);
    return;
  }
  memoryFallbackStorage.set(key, value);
}

// ---------- 序列化(Date 保真) ----------

function reviveDates(value) {
  if (typeof value === "string") {
    return ISO_DATE_PATTERN.test(value) ? new Date(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(reviveDates);
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = reviveDates(value[key]);
    });
    return out;
  }
  return value;
}

function cloneDoc(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map(cloneDoc);
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = cloneDoc(value[key]);
    });
    return out;
  }
  return value;
}

// ---------- 内存态 ----------

const memory = new Map();
const persistTimers = new Map();
const virtualAdapters = new Map();
let initialized = false;

function loadCollection(name) {
  const raw = storageRead(STORAGE_PREFIX + name);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(reviveDates) : [];
  } catch (error) {
    console.error("[local-db] 集合数据损坏,已重置:", name, error);
    return [];
  }
}

function initLocalDb() {
  if (initialized) {
    return;
  }
  PERSISTED_COLLECTIONS.forEach((name) => {
    memory.set(name, loadCollection(name));
  });
  initialized = true;
}

function getDocs(name) {
  if (!initialized) {
    initLocalDb();
  }
  if (!memory.has(name)) {
    memory.set(name, []);
  }
  return memory.get(name);
}

function schedulePersist(name) {
  if (!PERSISTED_COLLECTIONS.includes(name)) {
    return;
  }
  if (persistTimers.has(name)) {
    clearTimeout(persistTimers.get(name));
  }
  persistTimers.set(
    name,
    setTimeout(() => {
      persistTimers.delete(name);
      persistCollection(name);
    }, PERSIST_DEBOUNCE_MS)
  );
}

function persistCollection(name) {
  storageWrite(STORAGE_PREFIX + name, JSON.stringify(memory.get(name) || []));
}

function flushLocalDb() {
  Array.from(persistTimers.keys()).forEach((name) => {
    clearTimeout(persistTimers.get(name));
    persistTimers.delete(name);
    persistCollection(name);
  });
}

// 备份导入导出用:全量读出/写入集合数据
function exportCollections() {
  if (!initialized) {
    initLocalDb();
  }
  const out = {};
  PERSISTED_COLLECTIONS.forEach((name) => {
    out[name] = cloneDoc(memory.get(name) || []);
  });
  return out;
}

function replaceCollections(dataMap) {
  if (!initialized) {
    initLocalDb();
  }
  PERSISTED_COLLECTIONS.forEach((name) => {
    if (Array.isArray(dataMap[name])) {
      memory.set(name, reviveDates(cloneDoc(dataMap[name])));
      persistCollection(name);
    }
  });
}

// 卡库等超大数据集不进内存集合,由外部注册虚拟适配器按需查询
function registerVirtualCollection(name, adapter) {
  virtualAdapters.set(name, adapter);
}

// ---------- 查询命令 ----------

const CMD = Symbol("localDbCommand");

function makeCommand(op, payload) {
  return { [CMD]: op, payload };
}

// 供虚拟集合适配器识别查询命令(CMD 为模块私有 Symbol)
function getCommandInfo(value) {
  if (value && typeof value === "object" && value[CMD]) {
    return { op: value[CMD], payload: value.payload };
  }
  return null;
}

const _ = {
  in: (values) => makeCommand("in", Array.isArray(values) ? values : []),
  neq: (value) => makeCommand("neq", value),
  gte: (value) => makeCommand("gte", value),
  gt: (value) => makeCommand("gt", value),
  lte: (value) => makeCommand("lte", value),
  lt: (value) => makeCommand("lt", value),
  exists: (flag) => makeCommand("exists", Boolean(flag)),
  inc: (value) => makeCommand("inc", Number(value) || 0),
};

function toComparable(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  return value;
}

function valueEquals(a, b) {
  const ca = toComparable(a);
  const cb = toComparable(b);
  if (ca === cb) {
    return true;
  }
  // 与云数据库一致:不做类型强转
  return false;
}

function matchCondition(fieldValue, condition) {
  if (condition instanceof RegExp) {
    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }
    return condition.test(String(fieldValue));
  }
  if (condition && typeof condition === "object" && condition[CMD]) {
    const op = condition[CMD];
    const payload = condition.payload;
    switch (op) {
      case "in":
        return payload.some((item) => valueEquals(fieldValue, item));
      case "neq":
        return !valueEquals(fieldValue, payload);
      case "gte":
        return toComparable(fieldValue) >= toComparable(payload);
      case "gt":
        return toComparable(fieldValue) > toComparable(payload);
      case "lte":
        return toComparable(fieldValue) <= toComparable(payload);
      case "lt":
        return toComparable(fieldValue) < toComparable(payload);
      case "exists":
        return payload
          ? fieldValue !== undefined
          : fieldValue === undefined;
      default:
        throw new Error("[local-db] 不支持的查询命令: " + op);
    }
  }
  return valueEquals(fieldValue, condition);
}

function matchWhere(doc, where) {
  if (!where || typeof where !== "object") {
    return true;
  }
  return Object.keys(where).every((key) =>
    matchCondition(doc[key], where[key])
  );
}

function compareForOrder(a, b) {
  const ca = toComparable(a);
  const cb = toComparable(b);
  if (ca === cb) {
    return 0;
  }
  if (ca === undefined || ca === null) {
    return -1;
  }
  if (cb === undefined || cb === null) {
    return 1;
  }
  if (typeof ca === "number" && typeof cb === "number") {
    return ca - cb;
  }
  return String(ca) < String(cb) ? -1 : 1;
}

// ---------- 更新语义 ----------

function generateId() {
  const time = Date.now().toString(16);
  let random = "";
  for (let i = 0; i < 16; i += 1) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return time + random;
}

function applyUpdate(doc, patch) {
  let changed = false;
  Object.keys(patch || {}).forEach((key) => {
    if (key === "_id") {
      return;
    }
    const value = patch[key];
    if (value && typeof value === "object" && value[CMD]) {
      if (value[CMD] === "inc") {
        doc[key] = (Number(doc[key]) || 0) + value.payload;
        changed = true;
        return;
      }
      throw new Error("[local-db] 不支持的更新命令: " + value[CMD]);
    }
    doc[key] = cloneDoc(value);
    changed = true;
  });
  return changed;
}

// ---------- 查询构造器 ----------

class DocumentRef {
  constructor(name, id) {
    this.name = name;
    this.id = String(id);
  }

  async get() {
    const docs = await resolveDocs(this.name, { _id: this.id });
    const found = docs.find((item) => String(item._id) === this.id);
    if (!found) {
      const error = new Error("document.get:fail document not exists");
      error.errMsg = "document.get:fail document not exists";
      throw error;
    }
    return { data: cloneDoc(found) };
  }

  async update({ data }) {
    assertWritable(this.name);
    const docs = getDocs(this.name);
    const found = docs.find((item) => String(item._id) === this.id);
    if (!found) {
      return { stats: { updated: 0 } };
    }
    const changed = applyUpdate(found, data);
    if (changed) {
      schedulePersist(this.name);
    }
    return { stats: { updated: changed ? 1 : 0 } };
  }

  async set({ data }) {
    assertWritable(this.name);
    const docs = getDocs(this.name);
    const index = docs.findIndex((item) => String(item._id) === this.id);
    const next = cloneDoc(data || {});
    next._id = this.id;
    if (index >= 0) {
      docs[index] = next;
      schedulePersist(this.name);
      return { stats: { updated: 1, created: 0 } };
    }
    docs.push(next);
    schedulePersist(this.name);
    return { stats: { updated: 0, created: 1 } };
  }

  async remove() {
    assertWritable(this.name);
    const docs = getDocs(this.name);
    const index = docs.findIndex((item) => String(item._id) === this.id);
    if (index < 0) {
      return { stats: { removed: 0 } };
    }
    docs.splice(index, 1);
    schedulePersist(this.name);
    return { stats: { removed: 1 } };
  }
}

function assertWritable(name) {
  if (virtualAdapters.has(name)) {
    throw new Error("[local-db] 虚拟集合不支持直接写入: " + name);
  }
}

async function resolveDocs(name, where) {
  const adapter = virtualAdapters.get(name);
  if (adapter) {
    const docs = await adapter.query(where || {});
    return Array.isArray(docs) ? docs : [];
  }
  return getDocs(name);
}

class Query {
  constructor(name) {
    this.name = name;
    this._where = null;
    this._orderBy = [];
    this._skip = 0;
    this._limit = 0;
  }

  where(condition) {
    this._where = condition || {};
    return this;
  }

  orderBy(field, direction) {
    this._orderBy.push({
      field,
      direction: direction === "desc" ? "desc" : "asc",
    });
    return this;
  }

  skip(count) {
    this._skip = Math.max(Number(count) || 0, 0);
    return this;
  }

  limit(count) {
    this._limit = Math.max(Number(count) || 0, 0);
    return this;
  }

  doc(id) {
    return new DocumentRef(this.name, id);
  }

  async add({ data }) {
    assertWritable(this.name);
    const docs = getDocs(this.name);
    const payload = cloneDoc(data || {});
    if (payload._id !== undefined && payload._id !== null) {
      const id = String(payload._id);
      if (docs.some((item) => String(item._id) === id)) {
        const error = new Error(
          "document.add:fail document with _id already exists"
        );
        error.errMsg = error.message;
        throw error;
      }
      payload._id = id;
    } else {
      payload._id = generateId();
    }
    docs.push(payload);
    schedulePersist(this.name);
    return { _id: payload._id, id: payload._id };
  }

  async _filtered() {
    const source = await resolveDocs(this.name, this._where);
    let matched = source.filter((item) => matchWhere(item, this._where));
    if (this._orderBy.length) {
      const orders = this._orderBy;
      matched = matched.slice().sort((a, b) => {
        for (const { field, direction } of orders) {
          const cmp = compareForOrder(a[field], b[field]);
          if (cmp !== 0) {
            return direction === "desc" ? -cmp : cmp;
          }
        }
        return 0;
      });
    }
    return matched;
  }

  async get() {
    let matched = await this._filtered();
    if (this._skip) {
      matched = matched.slice(this._skip);
    }
    if (this._limit) {
      matched = matched.slice(0, this._limit);
    }
    return { data: matched.map(cloneDoc) };
  }

  async count() {
    const matched = await this._filtered();
    return { total: matched.length };
  }

  async update({ data }) {
    assertWritable(this.name);
    const matched = await this._filtered();
    let updated = 0;
    matched.forEach((doc) => {
      if (applyUpdate(doc, data)) {
        updated += 1;
      }
    });
    if (updated) {
      schedulePersist(this.name);
    }
    return { stats: { updated } };
  }

  async remove() {
    assertWritable(this.name);
    const docs = getDocs(this.name);
    const matched = await this._filtered();
    const removeIds = new Set(matched.map((item) => String(item._id)));
    let removed = 0;
    for (let i = docs.length - 1; i >= 0; i -= 1) {
      if (removeIds.has(String(docs[i]._id))) {
        docs.splice(i, 1);
        removed += 1;
      }
    }
    if (removed) {
      schedulePersist(this.name);
    }
    return { stats: { removed } };
  }
}

const db = {
  collection(name) {
    return new Query(name);
  },
  command: _,
  RegExp({ regexp, options }) {
    return new RegExp(regexp, options || "");
  },
  async createCollection(name) {
    getDocs(name);
    return { ok: true };
  },
  serverDate() {
    return new Date();
  },
};

// ---------- wx-server-sdk cloud 对象 shim ----------

const LOCAL_OPENID = "local";

function cloudUnsupported(name) {
  return () => {
    throw new Error("本地模式不支持云端能力: " + name);
  };
}

const cloudShim = {
  DYNAMIC_CURRENT_ENV: "local",
  init() {},
  database: () => db,
  getWXContext: () => ({
    OPENID: LOCAL_OPENID,
    APPID: "",
    UNIONID: "",
  }),
  downloadFile: cloudUnsupported("downloadFile"),
  uploadFile: cloudUnsupported("uploadFile"),
  getTempFileURL: cloudUnsupported("getTempFileURL"),
  openapi: {},
};

export {
  db,
  _,
  cloudShim,
  getCommandInfo,
  initLocalDb,
  flushLocalDb,
  exportCollections,
  replaceCollections,
  registerVirtualCollection,
  generateId,
  LOCAL_OPENID,
  PERSISTED_COLLECTIONS,
};
