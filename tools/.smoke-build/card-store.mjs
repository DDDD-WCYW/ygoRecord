// card-store.js
// 卡库存取中心:
// - 卡库同步:端上直连 ygocdb.com 下载 cards.zip,fflate 解压,索引+分片存储到应用私有目录
// - 卡牌搜索/详情:本地卡库存在则查本地索引;未同步则每次直连 ygocdb.com 在线搜索,不做数据缓存
// - 卡图缓存:与页面逻辑共用 `${USER_DATA_PATH}/ygo_card_img_${cardId}.jpg` 路径约定,
//   提供自动缓存开关、批量下载卡组卡图、清空缓存与占用统计
// - 向 local-db 注册 ygo_cards 虚拟集合适配器,使移植的云函数业务逻辑(fetchCardMap 等)无感知复用

import { unzip, unzipSync, strFromU8 } from "file:///D:/迅雷下载/wx/ygo-app-lite/node_modules/fflate/esm/browser.js";
import { db, getCommandInfo, registerVirtualCollection } from "./local-db.mjs";
import { createPlatformFsm, ensureDirectory, readBinaryFile } from "./file-io.mjs";

const YGOCDB_CARDS_ZIP_URL = "https://ygocdb.com/api/v0/cards.zip";
const YGOCDB_CARDS_MD5_URL = "https://ygocdb.com/api/v0/cards.zip.md5";
const YGOCDB_SEARCH_URL = "https://ygocdb.com/api/v0/?search=";
const YGOPRODECK_IMAGE_BASE_URL = "https://images.ygoprodeck.com/images";

const CARDS_COLLECTION = "ygo_cards";
const DECK_CARDS_COLLECTION = "ygo_deck_cards";
const STATE_STORAGE_KEY = "ygo_card_store:state";
const AUTO_CACHE_STORAGE_KEY = "ygo_card_store:autoCacheImages";
const LOCAL_CARD_IMAGE_FILE_PREFIX = "ygo_card_img_";
const LOCAL_CARD_FULL_IMAGE_FILE_PREFIX = "ygo_card_full_";
const SHARD_COUNT = 16;
const IMAGE_DOWNLOAD_CONCURRENCY = 6;

const EXTRA_DECK_TYPE_KEYWORDS = ["融合", "连接", "超量", "同步"];
const CARD_TYPE_FLAGS = {
  fusion: 0x40,
  synchro: 0x2000,
  xyz: 0x800000,
  link: 0x4000000,
};
const CODE_VALIDATION = 700102;
const CODE_CARD_NOT_FOUND = 700401;
const CODE_SYNC_FAILED = 700402;

class StoreError extends Error {
  constructor(code, msg, detail) {
    super(detail || msg);
    this.code = code;
    this.msg = msg;
    this.detail = detail || msg;
  }
}

// ---------- 运行时/文件系统抽象(Node 冒烟测试可注入 globalThis.uni shim) ----------

function getRuntime() {
  if (typeof uni !== "undefined") {
    return uni;
  }
  if (typeof globalThis !== "undefined" && globalThis.uni) {
    return globalThis.uni;
  }
  return null;
}

function getFs() {
  const runtime = getRuntime();
  if (runtime && typeof runtime.getFileSystemManager === "function") {
    return runtime.getFileSystemManager();
  }
  // uni-app App 端没有 uni.getFileSystemManager；由 file-io 将其映射为 plus.io。
  return createPlatformFsm();
}

function getUserDataPath() {
  const runtime = getRuntime();
  if (runtime && runtime.env && runtime.env.USER_DATA_PATH) {
    return runtime.env.USER_DATA_PATH;
  }
  // App 端 plus 环境私有文档目录
  return "_doc";
}

function getCardsDir() {
  return `${getUserDataPath()}/ygo-cards`;
}

function fsCall(method, options) {
  return new Promise((resolve, reject) => {
    const fs = getFs();
    if (!fs) {
      reject(new StoreError(CODE_SYNC_FAILED, "文件系统不可用", "当前环境不支持文件存储"));
      return;
    }
    fs[method]({
      ...options,
      success: resolve,
      fail: (error) =>
        reject(
          new Error((error && (error.errMsg || error.message)) || `${method}:fail`)
        ),
    });
  });
}

async function fsEnsureDir(dirPath) {
  // App 端的 plus.io 写文件不会自动创建父目录，必须先显式建立卡库目录。
  try {
    await ensureDirectory(dirPath);
  } catch (error) {
    const message = String(error && (error.errMsg || error.message)).toLowerCase();
    if (!message.includes("already exist") && !message.includes("file exists")) {
      throw error;
    }
  }
}

async function fsReadText(filePath) {
  const result = await fsCall("readFile", { filePath, encoding: "utf8" });
  return String((result && result.data) || "");
}

async function fsWriteText(filePath, text) {
  await fsCall("writeFile", { filePath, data: text, encoding: "utf8" });
}

async function fsReadBuffer(filePath) {
  return readBinaryFile(filePath);
}

async function fsExists(filePath) {
  try {
    await fsCall("access", { path: filePath });
    return true;
  } catch (error) {
    return false;
  }
}

async function fsUnlinkSilent(filePath) {
  try {
    await fsCall("unlink", { filePath });
  } catch (error) {
    // 文件不存在时忽略
  }
}

function requestText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const runtime = getRuntime();
    if (!runtime || typeof runtime.request !== "function") {
      reject(new StoreError(CODE_SYNC_FAILED, "网络不可用", "当前环境不支持网络请求"));
      return;
    }
    runtime.request({
      url,
      method: "GET",
      timeout: timeoutMs || 30000,
      dataType: "text",
      responseType: "text",
      success: (res) => {
        if (Number(res.statusCode) !== 200) {
          reject(new StoreError(CODE_SYNC_FAILED, "网络请求失败", `HTTP ${res.statusCode}: ${url}`));
          return;
        }
        resolve(typeof res.data === "string" ? res.data : JSON.stringify(res.data));
      },
      fail: (error) =>
        reject(
          new StoreError(
            CODE_SYNC_FAILED,
            "网络请求失败",
            (error && error.errMsg) || `请求失败: ${url}`
          )
        ),
    });
  });
}

function downloadToFile(url, filePath, onProgress, timeoutMs) {
  return new Promise((resolve, reject) => {
    const runtime = getRuntime();
    if (!runtime || typeof runtime.downloadFile !== "function") {
      reject(new StoreError(CODE_SYNC_FAILED, "网络不可用", "当前环境不支持文件下载"));
      return;
    }
    const requestOptions = {
      url,
      timeout: timeoutMs || 300000,
      success: (res) => {
        if (Number(res.statusCode) !== 200) {
          reject(new StoreError(CODE_SYNC_FAILED, "下载失败", `HTTP ${res.statusCode}: ${url}`));
          return;
        }
        resolve(res.filePath || res.tempFilePath || filePath);
      },
      fail: (error) =>
        reject(
          new StoreError(
            CODE_SYNC_FAILED,
            "下载失败",
            (error && error.errMsg) || `下载失败: ${url}`
          )
        ),
    };
    if (filePath) {
      requestOptions.filePath = filePath;
    }
    const task = runtime.downloadFile(requestOptions);
    if (task && typeof task.onProgressUpdate === "function" && typeof onProgress === "function") {
      task.onProgressUpdate((progress) => onProgress(progress || {}));
    }
  });
}

function storageGet(key) {
  const runtime = getRuntime();
  if (runtime && typeof runtime.getStorageSync === "function") {
    return runtime.getStorageSync(key);
  }
  return "";
}

function storageSet(key, value) {
  const runtime = getRuntime();
  if (runtime && typeof runtime.setStorageSync === "function") {
    runtime.setStorageSync(key, value);
  }
}

// ---------- 卡牌规范化(与云函数 normalizeYgoCdbCard 保持一致) ----------

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const text = String(value).trim();
  return text;
}

function normalizeCardId(value, fieldName = "卡片ID") {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!/^\d+$/.test(raw)) {
    throw new StoreError(CODE_VALIDATION, "参数校验失败", `${fieldName}必须为数字字符串`);
  }
  return raw;
}

function buildCardThumbUrl(cardId) {
  return `https://cdn.233.momobako.com/ygopro/pics/${cardId}.jpg!thumb2`;
}

function buildYgoProDeckThumbUrl(cardId) {
  return `${YGOPRODECK_IMAGE_BASE_URL}/cards_small/${cardId}.jpg`;
}

function buildCardFullImageUrl(cardId) {
  return `https://cdn.233.momobako.com/ygopro/pics/${cardId}.jpg`;
}

function buildYgoProDeckFullImageUrl(cardId) {
  return `${YGOPRODECK_IMAGE_BASE_URL}/cards/${cardId}.jpg`;
}

function parseCardTypes(rawCard) {
  if (Array.isArray(rawCard && rawCard.type) && rawCard.type.length) {
    return rawCard.type.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const textTypes = normalizeOptionalString(rawCard && rawCard.text && rawCard.text.types);
  if (!textTypes) {
    return [];
  }
  const matched = textTypes.match(/\[([^\]]+)\]/);
  if (!matched) {
    return [];
  }
  return String(matched[1])
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveIsExtraDeckCard(rawCard) {
  const dataType = Number(rawCard && rawCard.data && rawCard.data.type);
  if (!Number.isFinite(dataType)) {
    return false;
  }
  return Boolean(
    dataType & CARD_TYPE_FLAGS.fusion ||
      dataType & CARD_TYPE_FLAGS.synchro ||
      dataType & CARD_TYPE_FLAGS.xyz ||
      dataType & CARD_TYPE_FLAGS.link
  );
}

function pickNumeric(topValue, dataValue) {
  const value = topValue === undefined || topValue === null ? dataValue : topValue;
  return value === undefined || value === null ? null : Number(value);
}

function normalizeYgoCdbCard(rawCard) {
  const cardId = normalizeCardId(rawCard.card_id || rawCard.id || rawCard.cid, "卡片ID");
  const cnName = normalizeOptionalString(rawCard.cn_name);
  const scName = normalizeOptionalString(rawCard.sc_name);
  const mdName = normalizeOptionalString(rawCard.md_name);
  const name = normalizeOptionalString(rawCard.name);
  const desc = normalizeOptionalString(rawCard.text && rawCard.text.desc);
  const data = (rawCard && rawCard.data) || {};
  return {
    cardId,
    cid: normalizeOptionalString(rawCard.cid),
    name,
    cnName,
    scName,
    mdName,
    desc,
    types: parseCardTypes(rawCard),
    race: normalizeOptionalString(rawCard.race),
    attribute: normalizeOptionalString(rawCard.attribute),
    atk: pickNumeric(rawCard.atk, data.atk),
    def: pickNumeric(rawCard.def, data.def),
    level: pickNumeric(rawCard.level, data.level),
    scale: pickNumeric(rawCard.scale, data.scale),
    linkval: pickNumeric(rawCard.linkval, data.link_val),
    ot: normalizeOptionalString(rawCard.ot),
    forb: pickNumeric(rawCard.forb, undefined),
    setcode: normalizeOptionalString(rawCard.setcode),
    thumbUrl: buildCardThumbUrl(cardId),
    searchText: [cnName, scName, mdName, name, cardId].filter(Boolean).join(" "),
    isExtraDeckCard: resolveIsExtraDeckCard(rawCard),
    isActive: true,
  };
}

function extractCardDisplayName(card) {
  return card.cnName || card.scName || card.mdName || card.name || "";
}

function toCardResponse(card, localImagePath) {
  if (!card) {
    return null;
  }
  return {
    cardId: card.cardId,
    cid: card.cid || "",
    name: card.name || "",
    cnName: card.cnName || "",
    scName: card.scName || "",
    mdName: card.mdName || "",
    displayName: extractCardDisplayName(card),
    desc: card.desc || "",
    types: card.types || [],
    isExtraDeckCard: Boolean(card.isExtraDeckCard),
    race: card.race || "",
    attribute: card.attribute || "",
    atk: card.atk,
    def: card.def,
    level: card.level,
    scale: card.scale,
    linkval: card.linkval,
    ot: card.ot || "",
    forb: card.forb,
    setcode: card.setcode || "",
    thumbUrl: card.thumbUrl || "",
    fullImageUrl: buildCardFullImageUrl(card.cardId),
    // 本地模式:cachedImageFileId 直接返回本地缓存图片路径,页面可直接作为 image src 使用
    cachedImageFileId: localImagePath || "",
    syncedAt: "",
  };
}

function stripCardDesc(card) {
  if (!card) {
    return card;
  }
  const nextCard = { ...card };
  delete nextCard.desc;
  return nextCard;
}

// ---------- 同步状态 ----------

function getSyncState() {
  const raw = storageGet(STATE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveSyncState(state) {
  storageSet(STATE_STORAGE_KEY, JSON.stringify(state || {}));
}

function hasLocalLibrary() {
  const state = getSyncState();
  return Boolean(state && Number(state.totalCards) > 0);
}

// ---------- 索引/分片读写(内存缓存) ----------

let indexCache = null;
const shardCache = new Map();

function resetMemoryCache() {
  indexCache = null;
  shardCache.clear();
}

function shardFilePath(shardNo) {
  return `${getCardsDir()}/shard-${shardNo}.json`;
}

function indexFilePath() {
  return `${getCardsDir()}/index.json`;
}

function shardOfCardId(cardId) {
  return Number(String(cardId).slice(-4)) % SHARD_COUNT;
}

// 索引条目: [cardId, searchTextLower, isExtraDeckCard(0/1)]
async function loadIndex() {
  if (indexCache) {
    return indexCache;
  }
  if (!hasLocalLibrary()) {
    return [];
  }
  try {
    const text = await fsReadText(indexFilePath());
    const parsed = JSON.parse(text);
    indexCache = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[card-store] 索引读取失败:", error);
    indexCache = [];
  }
  return indexCache;
}

async function loadShard(shardNo) {
  if (shardCache.has(shardNo)) {
    return shardCache.get(shardNo);
  }
  let shard = {};
  try {
    const text = await fsReadText(shardFilePath(shardNo));
    const parsed = JSON.parse(text);
    shard = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[card-store] 分片读取失败:", shardNo, error);
  }
  shardCache.set(shardNo, shard);
  return shard;
}

async function getCardsByIds(cardIds) {
  const ids = Array.from(new Set((cardIds || []).filter(Boolean).map((item) => String(item))));
  if (!ids.length || !hasLocalLibrary()) {
    return [];
  }
  const grouped = new Map();
  ids.forEach((id) => {
    const shardNo = shardOfCardId(id);
    if (!grouped.has(shardNo)) {
      grouped.set(shardNo, []);
    }
    grouped.get(shardNo).push(id);
  });
  const cards = [];
  for (const [shardNo, groupIds] of grouped) {
    const shard = await loadShard(shardNo);
    groupIds.forEach((id) => {
      if (shard[id]) {
        cards.push(shard[id]);
      }
    });
  }
  return cards;
}

async function getLocalCardById(cardId) {
  const cards = await getCardsByIds([cardId]);
  return cards[0] || null;
}

// ---------- ygo_cards 虚拟集合适配器 ----------
// 移植的云函数业务逻辑仅以 {cardId: _.in([...])} 或 {cardId: "xxx"} 形态查询卡牌
// (搜索/详情路由已被 local-api.js 拦截,不会以 searchText 正则查询走到这里)

function extractCardIdCondition(where) {
  if (!where || typeof where !== "object") {
    return null;
  }
  const condition = where.cardId;
  if (condition === undefined || condition === null) {
    return null;
  }
  const command = getCommandInfo(condition);
  if (command && command.op === "in") {
    return command.payload.map((item) => String(item));
  }
  if (typeof condition === "string" || typeof condition === "number") {
    return [String(condition)];
  }
  return null;
}

registerVirtualCollection(CARDS_COLLECTION, {
  async query(where) {
    const cardIds = extractCardIdCondition(where);
    if (cardIds) {
      return getCardsByIds(cardIds);
    }
    // 其他查询形态(如 searchText 正则)按索引全量代价过高且业务上不会出现,返回空
    return [];
  },
});

// ---------- 卡图缓存 ----------

function getLocalCardImagePath(cardId) {
  return `${getUserDataPath()}/${LOCAL_CARD_IMAGE_FILE_PREFIX}${String(cardId).trim()}.jpg`;
}

function getLocalCardFullImagePath(cardId) {
  return `${getUserDataPath()}/${LOCAL_CARD_FULL_IMAGE_FILE_PREFIX}${String(cardId).trim()}.jpg`;
}

function isAutoCacheImagesEnabled() {
  const raw = storageGet(AUTO_CACHE_STORAGE_KEY);
  return raw === "1" || raw === 1 || raw === true;
}

function setAutoCacheImagesEnabled(enabled) {
  storageSet(AUTO_CACHE_STORAGE_KEY, enabled ? "1" : "0");
}

async function downloadImageToCache(urls, filePath, timeoutMs) {
  if (await fsExists(filePath)) {
    return filePath;
  }
  const candidates = Array.isArray(urls) ? urls : [urls];
  let lastError = null;
  for (const url of candidates) {
    try {
      const downloadedPath = await downloadToFile(url, filePath, undefined, timeoutMs || 8000);
      // App 基座可能将下载内容放在临时目录，显式复制到应用目录才能真正持久缓存。
      if (downloadedPath && downloadedPath !== filePath) {
        await fsCall("copyFile", { srcPath: downloadedPath, destPath: filePath });
        await fsUnlinkSilent(downloadedPath);
      }
      if (await fsExists(filePath)) {
        return filePath;
      }
      throw new Error("下载后文件未落盘");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("所有卡图来源均下载失败");
}

async function downloadImageToTemp(urls, timeoutMs) {
  const candidates = Array.isArray(urls) ? urls : [urls];
  let lastError = null;
  for (const url of candidates) {
    try {
      const tempPath = await downloadToFile(url, "", undefined, timeoutMs || 8000);
      if (tempPath) return tempPath;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("所有卡图来源均下载失败");
}

function downloadCardImage(cardId) {
  return downloadImageToCache(
    [buildYgoProDeckThumbUrl(cardId), buildCardThumbUrl(cardId)],
    getLocalCardImagePath(cardId),
    8000
  );
}

function downloadCardFullImage(cardId) {
  return downloadImageToCache(
    [buildYgoProDeckFullImageUrl(cardId), buildCardFullImageUrl(cardId)],
    getLocalCardFullImagePath(cardId),
    8000
  );
}

async function findCachedImagePath(cardId) {
  const filePath = getLocalCardImagePath(cardId);
  return (await fsExists(filePath)) ? filePath : "";
}

async function getImageCacheInfo() {
  const fs = getFs();
  if (!fs) {
    return { count: 0, sizeBytes: 0, sizeText: "0 B" };
  }
  let entries = [];
  try {
    const result = await fsCall("readdir", { dirPath: getUserDataPath() });
    entries = (result && result.files) || [];
  } catch (error) {
    return { count: 0, sizeBytes: 0, sizeText: "0 B" };
  }
  const imageNames = entries.filter((name) =>
    String(name).startsWith(LOCAL_CARD_IMAGE_FILE_PREFIX) ||
    String(name).startsWith(LOCAL_CARD_FULL_IMAGE_FILE_PREFIX)
  );
  let sizeBytes = 0;
  for (const name of imageNames) {
    try {
      const stats = await fsCall("stat", { path: `${getUserDataPath()}/${name}` });
      sizeBytes += Number((stats && stats.stats && stats.stats.size) || (stats && stats.size) || 0);
    } catch (error) {
      // 单个文件统计失败忽略
    }
  }
  return { count: imageNames.length, sizeBytes, sizeText: formatSize(sizeBytes) };
}

async function clearImageCache() {
  const fs = getFs();
  if (!fs) {
    return 0;
  }
  let entries = [];
  try {
    const result = await fsCall("readdir", { dirPath: getUserDataPath() });
    entries = (result && result.files) || [];
  } catch (error) {
    return 0;
  }
  const imageNames = entries.filter((name) =>
    String(name).startsWith(LOCAL_CARD_IMAGE_FILE_PREFIX) ||
    String(name).startsWith(LOCAL_CARD_FULL_IMAGE_FILE_PREFIX)
  );
  for (const name of imageNames) {
    await fsUnlinkSilent(`${getUserDataPath()}/${name}`);
  }
  return imageNames.length;
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

// ---------- 在线搜索(未同步卡库时直连 ygocdb) ----------

async function searchOnline(keyword) {
  const text = await requestText(
    YGOCDB_SEARCH_URL + encodeURIComponent(keyword),
    15000
  );
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new StoreError(CODE_SYNC_FAILED, "在线查卡失败", "ygocdb 返回数据无法解析");
  }
  const list = Array.isArray(parsed && parsed.result) ? parsed.result : [];
  const cards = [];
  list.forEach((rawCard) => {
    try {
      cards.push(normalizeYgoCdbCard(rawCard));
    } catch (error) {
      // 跳过无法识别的条目(如无卡密的规则卡)
    }
  });
  return cards;
}

// ---------- 对外:搜索 / 详情 / 卡图缓存接口(local-api.js 调用) ----------

function normalizeSearchParams(params) {
  const keyword = normalizeOptionalString(params && (params.keyword || params.search));
  if (!keyword) {
    throw new StoreError(CODE_VALIDATION, "参数校验失败", "搜索关键词不能为空");
  }
  if (keyword.length > 50) {
    throw new StoreError(CODE_VALIDATION, "参数校验失败", "搜索关键词长度不能超过 50 个字符");
  }
  const pageNumRaw = Number(params && params.pageNum);
  const pageSizeRaw = Number(params && (params.pageSize || params.limit));
  const pageNum = Number.isFinite(pageNumRaw) && pageNumRaw > 0 ? Math.floor(pageNumRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), 50)
    : 20;
  return { keyword, pageNum, pageSize };
}

async function attachLocalImages(cards) {
  const result = [];
  for (const card of cards) {
    const localPath = await findCachedImagePath(card.cardId).catch(() => "");
    result.push(toCardResponse(card, localPath));
  }
  return result;
}

async function searchCards(params) {
  const { keyword, pageNum, pageSize } = normalizeSearchParams(params);
  const skip = (pageNum - 1) * pageSize;

  let matchedCards = [];
  let localSearchAttempted = false;
  if (hasLocalLibrary()) {
    localSearchAttempted = true;
    const index = await loadIndex();
    const lowerKeyword = keyword.toLowerCase();
    const matchedIds = [];
    for (const entry of index) {
      if (String(entry[1]).includes(lowerKeyword)) {
        matchedIds.push(String(entry[0]));
      }
    }
    matchedIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const pageIds = matchedIds.slice(skip, skip + pageSize + 1);
    const cardMap = new Map(
      (await getCardsByIds(pageIds)).map((card) => [String(card.cardId), card])
    );
    matchedCards = pageIds.map((id) => cardMap.get(id)).filter(Boolean);
  }

  // 本地卡库文件在个别 App 基座上可能读回失败；过去这里会把异常静默转换为
  // 空列表。联网时应降级到 ygocdb，避免用户明明能在线查到卡却看到空结果。
  if (!localSearchAttempted || !matchedCards.length) {
    if (localSearchAttempted) {
      console.warn("[card-store] 本地卡库未返回搜索结果，降级在线查卡:", keyword);
    }
    const allCards = await searchOnline(keyword);
    allCards.sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
    matchedCards = allCards.slice(skip, skip + pageSize + 1);
  }

  const hasMore = matchedCards.length > pageSize;
  const finalCards = matchedCards.slice(0, pageSize);
  const list = (await attachLocalImages(finalCards)).map(stripCardDesc);
  return { list, pageNum, pageSize, hasMore };
}

async function getCard(params) {
  const cardId = normalizeCardId((params && (params.cardId || params.id)) || "", "卡片ID");

  let card = null;
  if (hasLocalLibrary()) {
    card = await getLocalCardById(cardId);
  }
  if (!card) {
    const onlineCards = await searchOnline(cardId).catch(() => []);
    card = onlineCards.find((item) => String(item.cardId) === cardId) || null;
  }
  if (!card) {
    throw new StoreError(CODE_CARD_NOT_FOUND, "卡片不存在", `未找到卡片: ${cardId}`);
  }

  const localPath = await findCachedImagePath(cardId).catch(() => "");
  return toCardResponse(card, localPath);
}

async function cacheCardImage(params) {
  const cardId = normalizeCardId((params && (params.cardId || params.id)) || "", "卡片ID");
  let localPath = "";
  try {
    localPath = await downloadCardImage(cardId);
  } catch (error) {
    localPath = "";
  }
  return {
    cardId,
    remoteUrl: buildCardThumbUrl(cardId),
    // 本地模式没有云文件,cloudFileId 返回本地缓存路径供页面直接展示
    cloudFileId: localPath,
    cachedImageFileId: localPath,
  };
}

// 详情始终使用高清图：关闭自动缓存时交给 image 组件联网加载；开启后写入本地。
async function getCardDetailImage(params) {
  const cardId = normalizeCardId((params && (params.cardId || params.id)) || "", "卡片ID");
  const remoteUrl = buildCardFullImageUrl(cardId);
  const urls = [buildYgoProDeckFullImageUrl(cardId), remoteUrl];
  if (!isAutoCacheImagesEnabled()) {
    try {
      return { cardId, imageUrl: await downloadImageToTemp(urls, 8000), cached: false };
    } catch (error) {
      return { cardId, imageUrl: remoteUrl, cached: false };
    }
  }
  try {
    return {
      cardId,
      imageUrl: await downloadCardFullImage(cardId),
      cached: true,
    };
  } catch (error) {
    // 缓存失败不妨碍详情查看，回退直接联网显示高清图。
    return { cardId, imageUrl: remoteUrl, cached: false };
  }
}

// 查看卡片后按需自动缓存卡图(设置开启时由页面调用,不阻塞主流程)
async function autoCacheCardImage(cardId) {
  if (!isAutoCacheImagesEnabled()) {
    return "";
  }
  try {
    return await downloadCardImage(cardId);
  } catch (error) {
    return "";
  }
}

// ---------- 卡库同步 ----------

function extractCardListFromParsedZipJson(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const directArrayKeys = ["data", "cards", "items", "list", "rows", "result"];
  for (const key of directArrayKeys) {
    if (Array.isArray(parsed[key])) {
      return parsed[key];
    }
  }
  const nestedCandidates = ["data", "result", "payload"];
  for (const key of nestedCandidates) {
    const value = parsed[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    for (const nestedKey of directArrayKeys) {
      if (Array.isArray(value[nestedKey])) {
        return value[nestedKey];
      }
    }
  }
  const values = Object.values(parsed);
  if (
    values.length &&
    values.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item.card_id !== undefined || item.id !== undefined || item.cid !== undefined)
    )
  ) {
    return values;
  }
  return null;
}

async function fetchRemoteCardsMd5(timeoutMs) {
  const text = await requestText(YGOCDB_CARDS_MD5_URL, timeoutMs || 15000);
  const value = String(text || "").trim().replace(/^"+|"+$/g, "");
  if (!value) {
    throw new StoreError(CODE_SYNC_FAILED, "同步失败", "未获取到 cards.zip.md5 内容");
  }
  return value;
}

async function checkCardLibraryUpdate() {
  const state = getSyncState();
  let remoteMd5 = "";
  let checkFailed = false;
  let checkError = "";
  try {
    remoteMd5 = await fetchRemoteCardsMd5(15000);
  } catch (error) {
    checkFailed = true;
    checkError = String((error && (error.detail || error.message)) || "远端 MD5 检查失败");
  }
  const changed = !checkFailed && (!state || state.cardsMd5 !== remoteMd5);
  return {
    changed,
    localCardsMd5: state ? state.cardsMd5 || "" : "",
    remoteCardsMd5: remoteMd5,
    lastSyncedAt: state ? state.lastSyncedAt || "" : "",
    totalCards: state ? Number(state.totalCards) || 0 : 0,
    checkFailed,
    checkError,
  };
}

function toBinaryU8(data) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data && data.buffer instanceof ArrayBuffer) {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }
  throw new StoreError(CODE_SYNC_FAILED, "同步失败", "cards.zip 读取结果不是二进制数据");
}

function unzipArchive(u8) {
  // fflate 的异步解压会放到 Web Worker，避免大卡库在 App 主线程上长时间无响应。
  if (
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    return new Promise((resolve, reject) => {
      try {
        unzip(u8, (error, entries) => {
          if (error) reject(error);
          else resolve(entries);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  // Node 冒烟测试及不支持 Worker 的旧基座仍可用同步降级。
  return Promise.resolve().then(() => unzipSync(u8));
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function parseCardsFromZipU8(u8, onProgress) {
  let entries = null;
  try {
    if (onProgress) onProgress("正在解压卡库数据包...", 53);
    entries = await unzipArchive(u8);
  } catch (error) {
    throw new StoreError(CODE_SYNC_FAILED, "同步失败", "cards.zip 解压失败");
  }
  const jsonName = Object.keys(entries).find((name) =>
    name.toLowerCase().endsWith(".json")
  );
  if (!jsonName) {
    throw new StoreError(CODE_SYNC_FAILED, "同步失败", "cards.zip 中未找到 JSON 数据文件");
  }
  if (onProgress) onProgress("正在读取卡库数据...", 55);
  await yieldToUi();
  const parsed = JSON.parse(strFromU8(entries[jsonName]));
  const cardList = extractCardListFromParsedZipJson(parsed);
  if (!Array.isArray(cardList)) {
    throw new StoreError(CODE_SYNC_FAILED, "同步失败", "cards.zip 解压后的 JSON 结构无法识别");
  }
  const cards = [];
  const batchSize = 200;
  for (let start = 0; start < cardList.length; start += batchSize) {
    const end = Math.min(start + batchSize, cardList.length);
    for (let index = start; index < end; index += 1) {
      try {
        cards.push(normalizeYgoCdbCard(cardList[index]));
      } catch (error) {
        // 跳过无法识别的条目
      }
    }
    if (onProgress) {
      const percent = 56 + Math.floor((end / cardList.length) * 4);
      onProgress(`正在解析卡牌 ${end}/${cardList.length}`, percent);
    }
    // 每批让出主线程，让 Vue 有机会刷新进度条和响应取消/返回操作。
    if (end < cardList.length) await yieldToUi();
  }
  return cards;
}

// 收集当前所有卡组构成中用到的卡(同步时可选下载这些卡的卡图)
async function collectDeckCardIds() {
  const result = await db.collection(DECK_CARDS_COLLECTION).get();
  const ids = new Set();
  (result.data || []).forEach((item) => {
    if (item && item.cardId) {
      ids.add(String(item.cardId));
    }
  });
  return Array.from(ids);
}

async function downloadDeckCardImages(onProgress) {
  const cardIds = await collectDeckCardIds();
  if (!cardIds.length) {
    return { total: 0, downloaded: 0, failed: 0 };
  }
  let downloaded = 0;
  let failed = 0;
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(IMAGE_DOWNLOAD_CONCURRENCY, cardIds.length) },
    async () => {
      while (cursor < cardIds.length) {
        const index = cursor;
        cursor += 1;
        const cardId = cardIds[index];
        try {
          await downloadCardImage(cardId);
          downloaded += 1;
        } catch (error) {
          failed += 1;
        }
        if (onProgress) {
          onProgress(`下载卡组卡图 ${downloaded + failed}/${cardIds.length}`);
        }
      }
    }
  );
  await Promise.all(workers);
  return { total: cardIds.length, downloaded, failed };
}

async function downloadAllCardThumbnails(cards, onProgress) {
  const cardIds = Array.from(
    new Set((cards || []).map((card) => String((card && card.cardId) || "")).filter(Boolean))
  );
  if (!cardIds.length) {
    return { total: 0, downloaded: 0, failed: 0 };
  }
  let completed = 0;
  let downloaded = 0;
  let failed = 0;
  let cursor = 0;
  let lastReport = 0;
  const report = (force = false) => {
    if (!onProgress || (!force && completed - lastReport < 20)) return;
    lastReport = completed;
    const percent = Math.min(99, 74 + Math.floor((completed / cardIds.length) * 25));
    onProgress(`保存卡牌缩略图 ${completed}/${cardIds.length}（失败 ${failed}）`, percent);
  };
  const workers = Array.from(
    { length: Math.min(IMAGE_DOWNLOAD_CONCURRENCY, cardIds.length) },
    async () => {
      while (cursor < cardIds.length) {
        const cardId = cardIds[cursor++];
        try {
          await downloadCardImage(cardId);
          downloaded += 1;
        } catch (error) {
          failed += 1;
        }
        completed += 1;
        report(false);
      }
    }
  );
  await Promise.all(workers);
  report(true);
  return { total: cardIds.length, downloaded, failed };
}

async function syncCardLibrary(options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const state = getSyncState();

  onProgress("检查远端卡库版本...");
  let remoteMd5 = "";
  try {
    remoteMd5 = await fetchRemoteCardsMd5(15000);
  } catch (error) {
    if (!options.force) {
      throw error;
    }
  }
  if (!options.force && state && remoteMd5 && state.cardsMd5 === remoteMd5) {
    onProgress("卡库已是最新");
    return {
      updated: false,
      totalCards: Number(state.totalCards) || 0,
      cardsMd5: state.cardsMd5,
      lastSyncedAt: state.lastSyncedAt || "",
    };
  }

  onProgress("下载卡库数据包...");
  await fsEnsureDir(getCardsDir());
  const zipPath = `${getCardsDir()}/cards.zip.tmp`;
  await fsUnlinkSilent(zipPath);
  // App 基座可能忽略 filePath，改将下载文件放到自己的临时目录并通过
  // tempFilePath 返回；后续必须读取实际返回路径，不能假定 zipPath 已落盘。
  const downloadedZipPath = await downloadToFile(YGOCDB_CARDS_ZIP_URL, zipPath, (progress) => {
    const percent = Math.max(0, Math.min(100, Math.floor(Number(progress.progress) || 0)));
    const written = Number(progress.totalBytesWritten) || 0;
    const total = Number(progress.totalBytesExpectedToWrite) || 0;
    const sizeText = total > 0 ? `（${formatSize(written)} / ${formatSize(total)}）` : "";
    onProgress(`下载卡库数据包 ${percent}%${sizeText}`, Math.floor(percent * 0.5));
  });

  onProgress("正在读取下载的卡库数据包...", 51);
  let cards = null;
  try {
    const buffer = await fsReadBuffer(downloadedZipPath);
    cards = await parseCardsFromZipU8(toBinaryU8(buffer), onProgress);
  } finally {
    await fsUnlinkSilent(zipPath);
    if (downloadedZipPath && downloadedZipPath !== zipPath) {
      await fsUnlinkSilent(downloadedZipPath);
    }
  }
  if (!cards.length) {
    throw new StoreError(CODE_SYNC_FAILED, "同步失败", "卡库数据为空");
  }

  onProgress(`写入本地卡库(共 ${cards.length} 张)...`, 62);
  const index = [];
  const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
  cards.forEach((card) => {
    index.push([card.cardId, card.searchText.toLowerCase(), card.isExtraDeckCard ? 1 : 0]);
    shards[shardOfCardId(card.cardId)][card.cardId] = card;
  });
  for (let shardNo = 0; shardNo < SHARD_COUNT; shardNo += 1) {
    await fsWriteText(shardFilePath(shardNo), JSON.stringify(shards[shardNo]));
    onProgress(
      `写入本地卡库分片 ${shardNo + 1}/${SHARD_COUNT}`,
      62 + Math.floor(((shardNo + 1) / SHARD_COUNT) * 10)
    );
  }
  await fsWriteText(indexFilePath(), JSON.stringify(index));
  onProgress("本地卡库索引写入完成", 73);

  const nextState = {
    cardsMd5: remoteMd5 || (state ? state.cardsMd5 : "") || "",
    totalCards: cards.length,
    lastSyncedAt: formatDateTime(new Date()),
    shardCount: SHARD_COUNT,
  };
  saveSyncState(nextState);
  resetMemoryCache();

  onProgress("开始保存全部卡牌缩略图...", 74);
  const imageResult = await downloadAllCardThumbnails(cards, onProgress);

  onProgress("同步完成", 100);
  return {
    updated: true,
    totalCards: cards.length,
    cardsMd5: nextState.cardsMd5,
    lastSyncedAt: nextState.lastSyncedAt,
    imageResult,
  };
}

async function clearCardLibrary() {
  for (let shardNo = 0; shardNo < SHARD_COUNT; shardNo += 1) {
    await fsUnlinkSilent(shardFilePath(shardNo));
  }
  await fsUnlinkSilent(indexFilePath());
  storageSet(STATE_STORAGE_KEY, "");
  resetMemoryCache();
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num) => String(num).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export {
  searchCards,
  getCard,
  cacheCardImage,
  getCardDetailImage,
  autoCacheCardImage,
  syncCardLibrary,
  checkCardLibraryUpdate,
  clearCardLibrary,
  getSyncState,
  hasLocalLibrary,
  isAutoCacheImagesEnabled,
  setAutoCacheImagesEnabled,
  getLocalCardImagePath,
  getImageCacheInfo,
  clearImageCache,
  downloadCardImage,
  buildCardThumbUrl,
};
