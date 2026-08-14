// smoke.mjs
// Node 冒烟测试:local-db + local-api.gen(移植业务逻辑)+ card-store 虚拟适配器 联合验证
// 运行: node tools/smoke.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(__dirname, ".smoke-build");
const DATA_DIR = path.join(__dirname, ".smoke-data");

// ---------- 1. 准备可被 Node ESM 加载的 services 副本 ----------
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const fflateEntry = path
  .join(ROOT, "node_modules/fflate/esm/browser.js")
  .replace(/\\/g, "/");
for (const name of fs.readdirSync(path.join(ROOT, "services"))) {
  if (!name.endsWith(".js")) continue;
  const source = fs
    .readFileSync(path.join(ROOT, "services", name), "utf8")
    .replace(/from "\.\/([\w.-]+)"/g, 'from "./$1.mjs"')
    .replace('from "fflate"', `from "file:///${fflateEntry}"`);
  fs.writeFileSync(path.join(BUILD_DIR, name.replace(/\.js$/, ".mjs")), source);
}

// ---------- 2. 注入 uni shim(Storage + FileSystemManager + 网络桩) ----------
const storageFile = path.join(DATA_DIR, "storage.json");
const storageMap = new Map();

function wrapAsync(fn) {
  return (options = {}) => {
    try {
      const result = fn(options);
      if (options.success) options.success(result || {});
    } catch (error) {
      if (options.fail) options.fail({ errMsg: String(error.message || error) });
      else throw error;
    }
  };
}

const fsm = {
  readFile: wrapAsync((o) => ({
    data: o.encoding
      ? fs.readFileSync(o.filePath, o.encoding)
      : new Uint8Array(fs.readFileSync(o.filePath)).buffer,
  })),
  writeFile: wrapAsync((o) => {
    fs.writeFileSync(o.filePath, o.data, o.encoding || undefined);
  }),
  mkdir: wrapAsync((o) => {
    fs.mkdirSync(o.dirPath, { recursive: Boolean(o.recursive) });
  }),
  access: wrapAsync((o) => {
    fs.accessSync(o.path);
  }),
  unlink: wrapAsync((o) => {
    fs.unlinkSync(o.filePath);
  }),
  readdir: wrapAsync((o) => ({ files: fs.readdirSync(o.dirPath) })),
  stat: wrapAsync((o) => ({ stats: { size: fs.statSync(o.path).size } })),
  copyFile: wrapAsync((o) => {
    fs.copyFileSync(o.srcPath, o.destPath);
  }),
};

globalThis.uni = {
  env: { USER_DATA_PATH: DATA_DIR.replace(/\\/g, "/") },
  getStorageSync: (key) => storageMap.get(key) || "",
  setStorageSync: (key, value) => {
    storageMap.set(key, value);
    fs.writeFileSync(storageFile, JSON.stringify([...storageMap]));
  },
  getFileSystemManager: () => fsm,
  request: (o) => o.fail && o.fail({ errMsg: "smoke: no network" }),
  downloadFile: (o) => o.fail && o.fail({ errMsg: "smoke: no network" }),
};

// ---------- 3. 加载模块 ----------
const localDb = await import(
  `file:///${path.join(BUILD_DIR, "local-db.mjs").replace(/\\/g, "/")}`
);
const cardStore = await import(
  `file:///${path.join(BUILD_DIR, "card-store.mjs").replace(/\\/g, "/")}`
);
const localApi = await import(
  `file:///${path.join(BUILD_DIR, "local-api.mjs").replace(/\\/g, "/")}`
);

localDb.initLocalDb();
const call = (pathName, body) => localApi.callLocalApi({ path: pathName, body });

// ---------- 4. 断言工具 ----------
let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log("PASS", label);
  } else {
    failed += 1;
    console.log("FAIL", label, extra === undefined ? "" : JSON.stringify(extra));
  }
}
async function callOk(label, pathName, body) {
  const res = await call(pathName, body);
  check(label, res && res.code === 0, res);
  return res && res.body;
}

// ---------- 5. 用例 ----------

// 卡组
const deckBody = await callOk("deck/save", "/deck/save", {
  matchFormat: "md",
  deckName: "测试卡组",
});
const deckId = deckBody && (deckBody.id || deckBody._id);
check("deck/save 返回 id", Boolean(deckId), deckBody);

const deckList = await callOk("deck/list", "/deck/list", { matchFormat: "md" });
check(
  "deck/list 含新卡组",
  Array.isArray(deckList) 
    ? deckList.some((item) => (item.id || item._id) === deckId)
    : Array.isArray(deckList && deckList.list) &&
        deckList.list.some((item) => (item.id || item._id) === deckId),
  deckList
);

// 字典
const dictList = await callOk("dict/list match_type", "/dict/list", {
  dictCode: "match_type",
  matchFormat: "md",
});

// 战绩保存
const saveBody = await callOk("record/save", "/match/record/save", {
  matchFormat: "md",
  matchMonth: "2025-01",
  dayOfWeek: "周一",
  coinResult: 1,
  matchResult: 1,
  deckId,
});
const recordId = saveBody && saveBody.id;
check("record/save 返回 id", Boolean(recordId), saveBody);

// 分页
const pageBody = await callOk("record/page", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("record/page total=1", pageBody && pageBody.total === 1, pageBody);
check(
  "record/page 卡组名回填",
  pageBody && pageBody.data[0] && pageBody.data[0].deckName === "测试卡组",
  pageBody && pageBody.data[0]
);

// 统计
const statsRes = await call("/match/record/statistics", {
  matchFormat: "md",
  matchMonth: "all",
});
check("record/statistics code=0", statsRes.code === 0, statsRes);
const statsBody = statsRes.body || {};
const statsTotal = statsBody.overall && statsBody.overall.totalGames;
check("statistics totalGames=1", statsTotal === 1, statsBody);

// 修改 + 编辑日志
await callOk("record/update", "/match/record/update", {
  id: recordId,
  matchFormat: "md",
  matchMonth: "2025-01",
  dayOfWeek: "周二",
  coinResult: 0,
  matchResult: 0,
  deckId,
});
const logsBody = await callOk("record/edit-logs", "/match/record/edit-logs", {
  id: recordId,
});
const logList = Array.isArray(logsBody) ? logsBody : (logsBody && logsBody.list) || [];
check("edit-logs 有记录", logList.length === 1, logsBody);

// 本地卡库:手工构造两张卡再验证虚拟适配器与搜索
const cardsDir = `${DATA_DIR.replace(/\\/g, "/")}/ygo-cards`;
fs.mkdirSync(cardsDir, { recursive: true });
const fakeCards = [
  {
    cardId: "10000",
    cid: "1",
    name: "",
    cnName: "青眼白龙",
    scName: "",
    mdName: "",
    desc: "传说之龙",
    types: ["怪兽", "通常"],
    race: "",
    attribute: "",
    atk: 3000,
    def: 2500,
    level: 8,
    scale: null,
    linkval: null,
    ot: "",
    forb: null,
    setcode: "",
    thumbUrl: "https://cdn.233.momobako.com/ygopro/pics/10000.jpg!thumb2",
    searchText: "青眼白龙 10000",
    isExtraDeckCard: false,
    isActive: true,
  },
  {
    cardId: "20001",
    cid: "2",
    name: "",
    cnName: "青眼究极龙",
    scName: "",
    mdName: "",
    desc: "融合怪兽",
    types: ["怪兽", "融合"],
    race: "",
    attribute: "",
    atk: 4500,
    def: 3800,
    level: 12,
    scale: null,
    linkval: null,
    ot: "",
    forb: null,
    setcode: "",
    thumbUrl: "https://cdn.233.momobako.com/ygopro/pics/20001.jpg!thumb2",
    searchText: "青眼究极龙 20001",
    isExtraDeckCard: true,
    isActive: true,
  },
];
const shards = {};
const index = [];
for (const card of fakeCards) {
  const shardNo = Number(String(card.cardId).slice(-4)) % 16;
  shards[shardNo] = shards[shardNo] || {};
  shards[shardNo][card.cardId] = card;
  index.push([card.cardId, card.searchText.toLowerCase(), card.isExtraDeckCard ? 1 : 0]);
}
for (let i = 0; i < 16; i += 1) {
  fs.writeFileSync(`${cardsDir}/shard-${i}.json`, JSON.stringify(shards[i] || {}));
}
fs.writeFileSync(`${cardsDir}/index.json`, JSON.stringify(index));
globalThis.uni.setStorageSync(
  "ygo_card_store:state",
  JSON.stringify({ cardsMd5: "fake", totalCards: 2, lastSyncedAt: "", shardCount: 16 })
);

check("hasLocalLibrary", cardStore.hasLocalLibrary() === true);

const searchBody = await callOk("card/search 本地", "/card/search", {
  keyword: "青眼",
  pageNum: 1,
  pageSize: 20,
});
check(
  "card/search 命中 2 张",
  searchBody && searchBody.list.length === 2,
  searchBody
);
check(
  "card/search 列表无 desc",
  searchBody && searchBody.list.every((item) => item.desc === undefined),
  searchBody && searchBody.list[0]
);

const cardBody = await callOk("card/get", "/card/get", { cardId: "10000" });
check("card/get displayName", cardBody && cardBody.displayName === "青眼白龙", cardBody);
check("card/get 保留 desc", cardBody && cardBody.desc === "传说之龙", cardBody);

// 卡组构成(走 fetchCardMap → ygo_cards 虚拟适配器)
await callOk("deck/cards/save", "/deck/cards/save", {
  matchFormat: "md",
  deckId,
  cards: [
    { cardId: "10000", section: "main", count: 3 },
    { cardId: "20001", section: "extra", count: 1 },
  ],
});
const deckCardsBody = await callOk("deck/cards/get", "/deck/cards/get", {
  matchFormat: "md",
  deckId,
});
const sections = (deckCardsBody && deckCardsBody.sections) || deckCardsBody || {};
const mainList = sections.main || [];
const extraList = sections.extra || [];
check(
  "deck/cards/get 主卡组 1 种",
  mainList.length === 1 && Number(mainList[0].count) === 3,
  deckCardsBody
);
check("deck/cards/get 额外 1 种", extraList.length === 1, deckCardsBody);

// 卡组图片:最多 3 张且单张不超过 7MB
const deckImagesBody = await callOk("deck/images/save", "/deck/images/save", {
  matchFormat: "md",
  deckId,
  images: [
    { path: "/tmp/deck-1.jpg", name: "图1", sizeBytes: 1024 },
    { path: "/tmp/deck-2.jpg", name: "图2", sizeBytes: 2048 },
  ],
});
check("deck/images/save 保存 2 张", deckImagesBody && deckImagesBody.images.length === 2, deckImagesBody);
const loadedDeckImages = await callOk("deck/images/get", "/deck/images/get", {
  matchFormat: "md",
  deckId,
});
check("deck/images/get 读取 2 张", loadedDeckImages && loadedDeckImages.images.length === 2, loadedDeckImages);
const oversizedImage = await call("/deck/images/save", {
  matchFormat: "md",
  deckId,
  images: [{ path: "/tmp/too-large.jpg", sizeBytes: 7 * 1024 * 1024 + 1 }],
});
check("deck/images/save 拒绝超过 7MB", oversizedImage.code !== 0, oversizedImage);

// 拦截路由
const adminRes = await call("/admin/status", {});
check("admin/status isAdmin=false", adminRes.code === 0 && adminRes.body.isAdmin === false, adminRes);
const appConfigRes = await call("/app/config/get", {});
check(
  "app/config/get donationEnabled=false",
  appConfigRes.code === 0 && appConfigRes.body.donationEnabled === false,
  appConfigRes
);
const syncRes = await call("/sync/cards/full", {});
check("已移除的同步路由不可用", syncRes.code !== 0, syncRes);
const msgRes = await call("/message/list", { pageNum: 1, pageSize: 20 });
check("message/list 空列表", msgRes.code === 0 && msgRes.body.list.length === 0, msgRes);

// 级联删除
const removeBody = await callOk("deck/remove 级联", "/deck/remove", {
  matchFormat: "md",
  id: deckId,
});
check(
  "deck/remove 级联战绩",
  removeBody && Number(removeBody.affectedRecords) === 1,
  removeBody
);
const removedDeckImages = await callOk("deck/images/get 删除后", "/deck/images/get", {
  matchFormat: "md",
  deckId,
});
check("deck/remove 清理图片记录", removedDeckImages && removedDeckImages.images.length === 0, removedDeckImages);
const pageAfter = await callOk("record/page 删除后", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("删除后 total=0", pageAfter && pageAfter.total === 0, pageAfter);

// 备份导出/导入回灌
const exported = localDb.exportCollections();
check(
  "exportCollections 含字典数据",
  Array.isArray(exported.ygo_dict_items) && exported.ygo_dict_items.length > 0
);
localDb.replaceCollections(exported);
const dictAfter = await callOk("dict/list 回灌后", "/dict/list", {
  dictCode: "match_type",
  matchFormat: "md",
});
check(
  "回灌后字典可读",
  JSON.stringify(dictAfter) === JSON.stringify(dictList),
  dictAfter
);

// ---------- 备份导出 / 导入(覆盖 + 合并) ----------
const backup = await import(
  `file:///${path.join(BUILD_DIR, "backup.mjs").replace(/\\/g, "/")}`
);

// 造数据:一副卡组 + 一条战绩 + 一项本地设置
const bkDeckBody = await callOk("backup: deck/save", "/deck/save", {
  matchFormat: "md",
  deckName: "备份卡组",
});
const bkDeckId = bkDeckBody && (bkDeckBody.id || bkDeckBody._id);
await callOk("backup: record/save", "/match/record/save", {
  matchFormat: "md",
  matchMonth: "2025-02",
  dayOfWeek: "周三",
  coinResult: 1,
  matchResult: 1,
  deckId: bkDeckId,
});
uni.setStorageSync(
  "ygo_md_current_account:v1",
  JSON.stringify({ accountId: "acc-backup" })
);

// 导出
const exportRes = await backup.exportBackup({ share: false });
check(
  "exportBackup 文件名格式",
  /^ygo-backup-\d{8}-\d{6}\.json$/.test(exportRes.fileName),
  exportRes
);
check("exportBackup summary 战绩=1", exportRes.summary.records === 1, exportRes.summary);
check("exportBackup 文件已落地", fs.existsSync(exportRes.filePath), exportRes.filePath);

// 列表 + 元信息
const backupList = await backup.listBackupFiles();
check(
  "listBackupFiles 含导出文件",
  backupList.some((file) => file.name === exportRes.fileName),
  backupList.map((file) => file.name)
);
const backupMeta = await backup.readBackupMeta(exportRes.filePath);
check("readBackupMeta 版本匹配", backupMeta.version === backup.BACKUP_VERSION, backupMeta);
check("readBackupMeta summary 战绩=1", backupMeta.summary.records === 1, backupMeta);

// 覆盖导入:先删空,再从备份恢复
await callOk("backup: 删卡组制造空态", "/deck/remove", {
  matchFormat: "md",
  id: bkDeckId,
});
const emptyPage = await callOk("backup: 删除后分页", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("覆盖导入前战绩为空", emptyPage && emptyPage.total === 0, emptyPage);

const overwriteRes = await backup.importBackup(exportRes.filePath, {
  mode: "overwrite",
});
check("importBackup overwrite summary 战绩=1", overwriteRes.summary.records === 1, overwriteRes);
check(
  "importBackup 生成自动备份",
  Boolean(overwriteRes.autoBackupPath) && fs.existsSync(overwriteRes.autoBackupPath),
  overwriteRes
);
const restoredPage = await callOk("backup: 覆盖导入后分页", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("覆盖导入恢复战绩", restoredPage && restoredPage.total === 1, restoredPage);
check(
  "覆盖导入恢复本地设置",
  uni.getStorageSync("ygo_md_current_account:v1") !== "",
  uni.getStorageSync("ygo_md_current_account:v1")
);

// 合并导入:本机新增一条后合并,应同时保留(备份那条按 _id 去重)
await callOk("backup: 合并前新增战绩", "/match/record/save", {
  matchFormat: "md",
  matchMonth: "2025-03",
  dayOfWeek: "周四",
  coinResult: 0,
  matchResult: 1,
  deckId: bkDeckId,
});
const beforeMerge = await callOk("backup: 合并前分页", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("合并前战绩=2", beforeMerge && beforeMerge.total === 2, beforeMerge);
await backup.importBackup(exportRes.filePath, { mode: "merge" });
const afterMerge = await callOk("backup: 合并导入后分页", "/match/record/page", {
  matchFormat: "md",
  matchMonth: "all",
  pageNum: 1,
  pageSize: 20,
});
check("合并导入保留本机新增(按 _id 去重)", afterMerge && afterMerge.total === 2, afterMerge);

localDb.flushLocalDb();
console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
