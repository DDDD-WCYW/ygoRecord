// 本文件由 tools/build-local-api.js 自动生成,源文件: miniprogram-1/cloudfunctions/ygoApi/index.js
// 请勿手工编辑;重新生成: node tools/build-local-api.js
/* eslint-disable */
import { db, _, cloudShim as cloud } from "./local-db.mjs";
import { md5Hex } from "./md5.mjs";
import { getCard } from "./card-store.mjs";

// crypto.createHash("md5") 的最小 shim(仅支持一次 update + hex digest)
const crypto = {
  createHash() {
    let buffer = "";
    return {
      update(value) {
        buffer = String(value);
        return this;
      },
      digest() {
        return md5Hex(buffer);
      },
    };
  },
};
// 卡库同步相关依赖在本地模式不可用;相关路由由 local-api.js 拦截,不会执行到这里
const AdmZip = null;
const axios = null;

const COLLECTIONS = {
  decks: "ygo_decks",
  records: "ygo_match_records",
  dictItems: "ygo_dict_items",
  dictMemberships: "ygo_dict_memberships",
  cards: "ygo_cards",
  deckCards: "ygo_deck_cards",
  cardImages: "ygo_card_images",
  syncState: "ygo_sync_state",
  editLogs: "ygo_record_edit_logs",
  messages: "ygo_messages",
  messageReactions: "ygo_message_reactions",
};

const DICT_CODES = {
  dayOfWeek: "day_of_week",
  matchType: "match_type",
  matchMonth: "match_month",
  mdAccount: "md_account",
};

const MATCH_FORMATS = {
  md: "md",
  ocg: "ocg",
};

const OCG_GAME_RESULTS = {
  win: "win",
  loss: "loss",
  draw: "draw",
};

const ERROR_CODES = {
  recordNotFound: 700101,
  validationFailed: 700102,
  unauthorized: 700103,
  deckNotFound: 700201,
  deckNameExists: 700202,
  deckNameEmpty: 700203,
  dictCodeNotFound: 700301,
  cardNotFound: 700401,
  syncFailed: 700402,
  editRateLimited: 700104,
  messageNotFound: 700501,
  messageBlocked: 700502,
  messageRateLimited: 700503,
};

const SYSTEM_SCOPE = "__system__";
const SHARED_SCOPE = "__shared__";
const DEFAULT_MATCH_TYPE_BY_FORMAT = {
  [MATCH_FORMATS.md]: "排位",
  [MATCH_FORMATS.ocg]: "练牌",
};
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const QUERY_BATCH_SIZE = 100;
const EDIT_RATE_LIMIT_MAX = 3;
const EDIT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MATCH_RESULT_DRAW = 4;
const OPPONENT_DECK_MAX_LENGTH = 15;
const CARD_SYNC_SOURCE = "ygocdb";
const CARD_SYNC_STATE_KEY = "cards";
const CARD_SECTION_OPTIONS = new Set(["main", "extra", "side"]);
const YGOCDB_CARDS_ZIP_URL = "https://ygocdb.com/api/v0/cards.zip";
const YGOCDB_CARDS_MD5_URL = "https://ygocdb.com/api/v0/cards.zip.md5";
const CARD_SYNC_TEMP_PATH_PREFIX = "ygo-sync/cards";
const CARD_SYNC_CARD_CHUNK_SIZE = 200;
const CARD_SYNC_INACTIVE_CHUNK_SIZE = 500;
const CARD_SYNC_WRITE_CONCURRENCY = 4;
const EXTRA_DECK_TYPE_KEYWORDS = ["融合", "连接", "超量", "同步"];
const CARD_TYPE_FLAGS = {
  fusion: 0x40,
  synchro: 0x2000,
  xyz: 0x800000,
  link: 0x4000000,
};
const CARD_SYNC_MODES = {
  fast: "fast",
  full: "full",
};
const CARD_SYNC_JOB_STATUS = {
  syncingCards: "syncing_cards",
  markingInactive: "marking_inactive",
};
const ADMIN_OPENIDS = [];

const ALLOWED_DICT_CODES = new Set([
  DICT_CODES.dayOfWeek,
  DICT_CODES.matchType,
  DICT_CODES.matchMonth,
  DICT_CODES.mdAccount,
]);

const DEFAULT_DAY_OF_WEEK_ITEMS = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

let collectionsInitPromise = null;
let systemInitPromise = null;
const userInitPromises = new Map();

class ApiError extends Error {
  constructor(code, msg, detail) {
    super(detail || msg);
    this.code = code;
    this.msg = msg;
    this.detail = detail || msg;
  }
}

const success = (body = null) => ({
  code: 0,
  msg: "操作成功",
  detail: "",
  head: {},
  body,
});

const failure = (code, msg, detail) => ({
  code,
  msg,
  detail: detail || msg,
  head: {},
  body: null,
});

function getRequestPath(event) {
  return event.path || event.action || event.type || "";
}

function getRequestBody(event) {
  if (event.body && typeof event.body === "object" && !Array.isArray(event.body)) {
    return event.body;
  }

  const body = { ...event };
  delete body.path;
  delete body.action;
  delete body.type;
  return body;
}

function getUserContext() {
  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "无法获取用户身份",
      "云函数未获取到 OPENID，请确认从小程序端调用。"
    );
  }

  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || "",
  };
}

function getAdminOpenIds() {
  const envValue = normalizeOptionalString(undefined);
  if (envValue) {
    return envValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return ADMIN_OPENIDS.slice();
}

function isAdminUser(openid) {
  return getAdminOpenIds().includes(String(openid || "").trim());
}

function assertAdminUser(openid) {
  if (!isAdminUser(openid)) {
    throw new ApiError(
      ERROR_CODES.unauthorized,
      "无权限",
      "当前用户不是管理员，不能执行该操作"
    );
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    const message = String(error && (error.errMsg || error.message || error));
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes("already exists") ||
      normalizedMessage.includes("collection.create:fail") ||
      normalizedMessage.includes("createcollection:fail") ||
      normalizedMessage.includes("resourceunavailable.resourceexist") ||
      normalizedMessage.includes("table exist")
    ) {
      return;
    }
    throw error;
  }
}

async function ensureCollectionsInitialized() {
  if (!collectionsInitPromise) {
    collectionsInitPromise = Promise.all(
      Object.values(COLLECTIONS).map(ensureCollection)
    ).catch((error) => {
      collectionsInitPromise = null;
      throw error;
    });
  }

  return collectionsInitPromise;
}

async function ensureSystemInitialized() {
  if (!systemInitPromise) {
    systemInitPromise = (async () => {
      await ensureCollectionsInitialized();
      const existingDayItems = await fetchAllByQuery(
        COLLECTIONS.dictItems,
        {
          ownerOpenId: SYSTEM_SCOPE,
          dictCode: DICT_CODES.dayOfWeek,
        }
      );
      const existingDaySet = new Set(
        existingDayItems.map((item) => item.itemValue)
      );

      for (let index = 0; index < DEFAULT_DAY_OF_WEEK_ITEMS.length; index += 1) {
        const label = DEFAULT_DAY_OF_WEEK_ITEMS[index];
        if (!existingDaySet.has(label)) {
          await db.collection(COLLECTIONS.dictItems).add({
            data: {
              ownerOpenId: SYSTEM_SCOPE,
              dictCode: DICT_CODES.dayOfWeek,
              itemValue: label,
              itemLabel: label,
              sortOrder: index + 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }
    })().catch((error) => {
      systemInitPromise = null;
      throw error;
    });
  }

  return systemInitPromise;
}

async function ensureUserInitialized(openid) {
  if (!userInitPromises.has(openid)) {
    const promise = (async () => {
      await ensureCollectionsInitialized();
      for (const matchFormat of [MATCH_FORMATS.md, MATCH_FORMATS.ocg]) {
        const defaultLabel = DEFAULT_MATCH_TYPE_BY_FORMAT[matchFormat];
        const sharedItem = await findOrCreateSharedDictItem({
          dictCode: DICT_CODES.matchType,
          matchFormat,
          itemValue: defaultLabel,
        });
        await ensureMembership({
          openid,
          dictItem: sharedItem,
          sortOrder: 1,
          isDefault: true,
        });
      }
    })().catch((error) => {
      userInitPromises.delete(openid);
      throw error;
    });
    userInitPromises.set(openid, promise);
  }

  return userInitPromises.get(openid);
}

async function ensureInitialized(path, openid, body = {}) {
  await ensureCollectionsInitialized();

  if (path === "/match/record/save" || path === "/match/record/update") {
    await Promise.all([
      ensureSystemInitialized(),
      ensureUserInitialized(openid),
    ]);
    return;
  }

  if (path === "/dict/list") {
    if (body.dictCode === DICT_CODES.dayOfWeek) {
      await ensureSystemInitialized();
      return;
    }
    if (body.dictCode === DICT_CODES.matchType) {
      await ensureUserInitialized(openid);
      return;
    }
  }

  if (
    path === "/match/record/page" ||
    path === "/match/record/get" ||
    path === "/match/record/remove" ||
    path === "/match/record/statistics" ||
    path === "/deck/list" ||
    path === "/deck/save" ||
    path === "/deck/update" ||
    path === "/deck/remove" ||
    path === "/deck/cards/get" ||
    path === "/deck/cards/save" ||
    path === "/card/search" ||
    path === "/card/get" ||
    path === "/card/image/cache" ||
    path === "/admin/status" ||
    path === "/admin/migrate/shared-dict" ||
    path === "/sync/cards/check" ||
    path === "/sync/cards/fast" ||
    path === "/sync/cards/full" ||
    path === "/dict/item/save" ||
    path === "/dict/item/update" ||
    path === "/dict/item/remove" ||
    path === "/app/config/get" ||
    path === "/app/config/save" ||
    path === "/message/list" ||
    path === "/message/save" ||
    path === "/message/react" ||
    path === "/message/remove"
  ) {
    return;
  }

  await Promise.all([
    ensureSystemInitialized(),
    ensureUserInitialized(openid),
  ]);
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function asNonEmptyString(value, fieldName) {
  if (isBlank(value)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}不能为空`
    );
  }
  return String(value).trim();
}

function normalizeMonth(monthValue) {
  const raw = asNonEmptyString(monthValue, "对局月份");
  const match = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "对局月份格式应为 yyyy-MM"
    );
  }

  const year = match[1];
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "对局月份中的月份必须在 1-12 之间"
    );
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatMonthLabel(monthValue) {
  const [year, month] = normalizeMonth(monthValue).split("-");
  return `${year}-${Number(month)}`;
}

function compareMonthValueDesc(leftMonthValue, rightMonthValue) {
  const [leftYear, leftMonth] = normalizeMonth(leftMonthValue).split("-");
  const [rightYear, rightMonth] = normalizeMonth(rightMonthValue).split("-");
  const leftKey = Number(leftYear) * 100 + Number(leftMonth);
  const rightKey = Number(rightYear) * 100 + Number(rightMonth);

  return rightKey - leftKey;
}

function toTimeValue(value) {
  if (!value) {
    return 0;
  }
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareRecordSortDesc(leftRecord, rightRecord) {
  const leftMonth = leftRecord && leftRecord.matchMonth ? leftRecord.matchMonth : "1970-01";
  const rightMonth = rightRecord && rightRecord.matchMonth ? rightRecord.matchMonth : "1970-01";
  const monthDiff = compareMonthValueDesc(leftMonth, rightMonth);
  if (monthDiff !== 0) {
    return monthDiff;
  }

  const createdAtDiff = toTimeValue(rightRecord && rightRecord.createdAt) - toTimeValue(leftRecord && leftRecord.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return toTimeValue(rightRecord && rightRecord.updatedAt) - toTimeValue(leftRecord && leftRecord.updatedAt);
}

function normalizeOptionalInteger(value, fieldName) {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}必须是整数`
    );
  }
  return numberValue;
}

function normalizeCoinResultFlag(value, fieldName) {
  const numberValue = normalizeOptionalInteger(value, fieldName);
  if (numberValue !== 0 && numberValue !== 1) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}只能为 0 或 1`
    );
  }
  return numberValue;
}

function normalizeMatchFormat(value) {
  const format = String(value || MATCH_FORMATS.md).trim().toLowerCase();
  if (format !== MATCH_FORMATS.md && format !== MATCH_FORMATS.ocg) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "对战模式只能为 md 或 ocg"
    );
  }
  return format;
}

function isMatchFormatMatched(value, targetFormat) {
  const normalizedTarget = normalizeMatchFormat(targetFormat);
  const currentFormat = value ? normalizeMatchFormat(value) : MATCH_FORMATS.md;
  return currentFormat === normalizedTarget;
}

function normalizeMatchTypeNameList(value) {
  let rawList = [];
  if (Array.isArray(value)) {
    rawList = value;
  } else if (typeof value === "string") {
    rawList = value.split(",");
  }
  const seen = new Set();
  const result = [];
  rawList.forEach((item) => {
    const name = String(item == null ? "" : item).trim().toLocaleLowerCase();
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    result.push(name);
  });
  return result;
}

function normalizeMatchResultFlag(value, fieldName) {
  const numberValue = normalizeOptionalInteger(value, fieldName);
  if (
    numberValue !== 0 &&
    numberValue !== 1 &&
    numberValue !== 2 &&
    numberValue !== 3 &&
    numberValue !== MATCH_RESULT_DRAW
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}只能为 0、1、2、3 或 4`
    );
  }
  return numberValue;
}

function isDuelMatchResult(value) {
  return value === 0 || value === 1 || value === 2 || value === MATCH_RESULT_DRAW;
}

function isResolvedMatchResult(value) {
  return value === 0 || value === 1 || value === 2 || value === MATCH_RESULT_DRAW;
}

function normalizeOcgGameResult(value, fieldName) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized !== OCG_GAME_RESULTS.win &&
    normalized !== OCG_GAME_RESULTS.loss &&
    normalized !== OCG_GAME_RESULTS.draw
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}只能为 win、loss 或 draw`
    );
  }
  return normalized;
}

function normalizeOcgGameResults(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "OCG 对战必须记录三局结果"
    );
  }

  return value.map((item, index) =>
    normalizeOcgGameResult(item, `第 ${index + 1} 局结果`)
  );
}

function deriveOcgMatchResult(gameResults) {
  const winCount = gameResults.filter((item) => item === OCG_GAME_RESULTS.win).length;
  const lossCount = gameResults.filter((item) => item === OCG_GAME_RESULTS.loss).length;

  if (winCount > lossCount) {
    return 1;
  }
  if (lossCount > winCount) {
    return 0;
  }
  return MATCH_RESULT_DRAW;
}

function normalizePageSize(value) {
  const pageSize = normalizeOptionalInteger(value, "pageSize");
  if (pageSize === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `pageSize必须在 1-${MAX_PAGE_SIZE} 之间`
    );
  }
  return pageSize;
}

function normalizePageNum(value) {
  const pageNum = normalizeOptionalInteger(value, "pageNum");
  if (pageNum === undefined) {
    return 1;
  }
  if (pageNum < 1) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "pageNum必须大于等于 1"
    );
  }
  return pageNum;
}

function normalizeRecordMetricCount(value, label) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const metricCount = Number(value);
  if (!Number.isInteger(metricCount) || metricCount < 0 || metricCount > 10) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${label}应在 0-10 之间`
    );
  }
  return metricCount;
}

function normalizeStarterCount(value) {
  return normalizeRecordMetricCount(value, "动点数");
}

function normalizeHandTrapCount(value) {
  return normalizeRecordMetricCount(value, "手坑数");
}

function normalizeBrickCount(value) {
  return normalizeRecordMetricCount(value, "废件数");
}

function normalizeOcgMetricCounts(value, label, normalizer) {
  if (value === "" || value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length !== 3) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `OCG ${label}必须是长度为 3 的数组`
    );
  }
  return value.map((item) => normalizer(item));
}

function normalizeOcgStarterCounts(value) {
  return normalizeOcgMetricCounts(value, "动点数", normalizeStarterCount);
}

function normalizeOcgHandTrapCounts(value) {
  return normalizeOcgMetricCounts(value, "手坑数", normalizeHandTrapCount);
}

function normalizeOcgBrickCounts(value) {
  return normalizeOcgMetricCounts(value, "废件数", normalizeBrickCount);
}

function normalizeRemark(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const remark = String(value).trim();
  if (remark.length > 200) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "备注长度不能超过 200 个字符"
    );
  }
  return remark;
}

function normalizeOpponentDeck(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const opponentDeck = String(value).replace(/[\r\n]+/g, "").trim();
  if (opponentDeck.length > OPPONENT_DECK_MAX_LENGTH) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `对手卡组长度不能超过 ${OPPONENT_DECK_MAX_LENGTH} 个字符`
    );
  }
  return opponentDeck;
}

function normalizeFailureReasons(value) {
  if (value === null || value === undefined || value === "") return [];
  if (!Array.isArray(value)) {
    throw new ApiError(ERROR_CODES.validationFailed, "参数校验失败", "失败原因必须是数组");
  }
  const seen = new Set();
  return value
    .map((item) => String(item === null || item === undefined ? "" : item).replace(/[\r\n]+/g, "").trim())
    .filter(Boolean)
    .filter((item) => {
      if (item.length > 10) throw new ApiError(ERROR_CODES.validationFailed, "参数校验失败", "单个失败原因不能超过 10 个字符");
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function normalizeId(value, fieldName) {
  const id = asNonEmptyString(value, fieldName);
  return id;
}

function normalizeIdArray(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}必须是数组`
    );
  }
  return value
    .filter((item) => item !== null && item !== undefined && String(item).trim() !== "")
    .map((item) => String(item).trim());
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeOptionalDayOfWeek(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return asNonEmptyString(value, "日期");
}

function normalizeStringArray(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}必须是数组`
    );
  }
  return value
    .filter((item) => item !== null && item !== undefined && String(item).trim() !== "")
    .map((item) => String(item).trim());
}

function normalizeCardId(value, fieldName = "卡片ID") {
  const raw = asNonEmptyString(value, fieldName);
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}必须为数字字符串`
    );
  }
  return raw;
}

function normalizeCardSearchKeyword(value) {
  const keyword = normalizeOptionalString(value);
  if (!keyword) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "搜索关键词不能为空"
    );
  }
  if (keyword.length > 50) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "搜索关键词长度不能超过 50 个字符"
    );
  }
  return keyword;
}

function normalizeCardSection(value) {
  const section = asNonEmptyString(value, "卡组分区").toLowerCase();
  if (!CARD_SECTION_OPTIONS.has(section)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "卡组分区只能为 main、extra 或 side"
    );
  }
  return section;
}

function normalizeDeckName(deckName) {
  if (isBlank(deckName)) {
    throw new ApiError(
      ERROR_CODES.deckNameEmpty,
      "卡组名称不能为空",
      "请输入卡组名称"
    );
  }
  const value = asNonEmptyString(deckName, "卡组名称").replace(/[\r\n]+/g, "").trim();
  if (!value) {
    throw new ApiError(
      ERROR_CODES.deckNameEmpty,
      "卡组名称不能为空",
      "请输入卡组名称"
    );
  }
  if (value.length > 15) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "卡组名称长度不能超过 15 个字符"
    );
  }
  return value;
}

function validateDictCode(dictCode) {
  const code = asNonEmptyString(dictCode, "字典编码");
  if (!ALLOWED_DICT_CODES.has(code)) {
    throw new ApiError(
      ERROR_CODES.dictCodeNotFound,
      "字典编码不存在",
      `不支持的字典编码: ${code}`
    );
  }
  return code;
}

function getDictionaryOwner(dictCode, openid) {
  if (dictCode === DICT_CODES.dayOfWeek) {
    return SYSTEM_SCOPE;
  }
  if (
    dictCode === DICT_CODES.matchType ||
    dictCode === DICT_CODES.matchMonth ||
    dictCode === DICT_CODES.mdAccount
  ) {
    return SHARED_SCOPE;
  }
  return openid;
}

function normalizeDictValue(dictCode, itemValue, itemLabel) {
  if (dictCode === DICT_CODES.matchMonth) {
    const normalizedMonth = normalizeMonth(itemValue);
    return {
      itemValue: normalizedMonth,
      itemLabel: itemLabel && String(itemLabel).trim() ? String(itemLabel).trim() : formatMonthLabel(normalizedMonth),
    };
  }

  const value = asNonEmptyString(itemValue, "字典项值");
  const label = asNonEmptyString(itemLabel, "字典项标签");
  if (value.length > 50) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "字典项值长度不能超过 50 个字符"
    );
  }
  if (label.length > 100) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "字典项标签长度不能超过 100 个字符"
    );
  }

  return {
    itemValue: value,
    itemLabel: label,
  };
}

function toLowerSafe(value) {
  return String(value).trim().toLocaleLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CHINA_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const displayDate = new Date(date.getTime() + CHINA_TIMEZONE_OFFSET_MS);
  const year = displayDate.getUTCFullYear();
  const month = String(displayDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(displayDate.getUTCDate()).padStart(2, "0");
  const hours = String(displayDate.getUTCHours()).padStart(2, "0");
  const minutes = String(displayDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(displayDate.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function createZeroStats() {
  return {
    totalGames: 0,
    winCount: 0,
    drawCount: 0,
    winRate: "0.00%",
    coinGames: 0,
    coinWinCount: 0,
    coinWinRate: "0.00%",
    winCoinGames: 0,
    winCoinWinCount: 0,
    winRateWhenCoinWin: "0.00%",
    loseCoinGames: 0,
    loseCoinWinCount: 0,
    winRateWhenCoinLoss: "0.00%",
    starterGames: 0,
    hasStarterCount: 0,
    hasStarterRate: "0.00%",
    averageStarterCount: "0.00",
    averageHandTrapCount: "0.00",
    averageBrickCount: "0.00",
  };
}

function formatRate(numerator, denominator) {
  if (!denominator) {
    return "0.00%";
  }
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatAverage(totalValue, recordedCount) {
  if (!recordedCount) {
    return "-";
  }
  return (Number(totalValue || 0) / Number(recordedCount || 0)).toFixed(2);
}

function createHash(value) {
  return crypto.createHash("md5").update(String(value || "")).digest("hex");
}

function toArraySafe(value) {
  return Array.isArray(value) ? value : [];
}

function extractCardDisplayName(card) {
  return (
    card.cnName ||
    card.scName ||
    card.mdName ||
    card.name ||
    ""
  );
}

function isExtraDeckMonsterCard(card) {
  if (typeof (card && card.isExtraDeckCard) === "boolean") {
    return card.isExtraDeckCard;
  }
  const typeText = toArraySafe(card && card.types)
    .map((item) => String(item || ""))
    .join(" ");
  return EXTRA_DECK_TYPE_KEYWORDS.some((keyword) => typeText.includes(keyword));
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

function getDeckCardNameKey(card) {
  return toLowerSafe(extractCardDisplayName(card) || card.cardId || "");
}

function validateDeckCardSectionRules(items, cardMap) {
  const sameNameCountMap = new Map();
  items.forEach((item) => {
    const card = cardMap.get(String(item.cardId));
    const displayName = extractCardDisplayName(card) || String(item.cardId);
    const isExtraCard = isExtraDeckMonsterCard(card);

    if (item.section === "extra" && !isExtraCard) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `${displayName} 不能加入额外卡组`
      );
    }
    if (item.section === "main" && isExtraCard) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `${displayName} 只能加入额外卡组或副卡组`
      );
    }

    const nameKey = getDeckCardNameKey(card);
    const nextCount = (sameNameCountMap.get(nameKey) || 0) + Number(item.count || 1);
    if (nextCount > 3) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `${displayName} 在主卡组、额外卡组、副卡组中的总数不能超过 3 张`
      );
    }
    sameNameCountMap.set(nameKey, nextCount);
  });
}

function stripCardDesc(card) {
  if (!card) {
    return card;
  }
  const nextCard = { ...card };
  delete nextCard.desc;
  return nextCard;
}

function buildCardThumbUrl(cardId) {
  return `https://cdn.233.momobako.com/ygopro/pics/${cardId}.jpg!thumb2`;
}

function normalizeYgoCdbCard(rawCard) {
  const cardId = normalizeCardId(
    rawCard.card_id || rawCard.id || rawCard.cid,
    "卡片ID"
  );
  const cnName = normalizeOptionalString(rawCard.cn_name);
  const scName = normalizeOptionalString(rawCard.sc_name);
  const mdName = normalizeOptionalString(rawCard.md_name);
  const name = normalizeOptionalString(rawCard.name);
  const desc = normalizeOptionalString(rawCard.text && rawCard.text.desc);
  const payload = {
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
    atk: rawCard.atk === undefined || rawCard.atk === null ? null : Number(rawCard.atk),
    def: rawCard.def === undefined || rawCard.def === null ? null : Number(rawCard.def),
    level: rawCard.level === undefined || rawCard.level === null ? null : Number(rawCard.level),
    scale: rawCard.scale === undefined || rawCard.scale === null ? null : Number(rawCard.scale),
    linkval: rawCard.linkval === undefined || rawCard.linkval === null ? null : Number(rawCard.linkval),
    ot: normalizeOptionalString(rawCard.ot),
    forb: rawCard.forb === undefined || rawCard.forb === null ? null : Number(rawCard.forb),
    setcode: normalizeOptionalString(rawCard.setcode),
    thumbUrl: buildCardThumbUrl(cardId),
    searchText: [cnName, scName, mdName, name, cardId].filter(Boolean).join(" "),
    isExtraDeckCard: resolveIsExtraDeckCard(rawCard),
    isActive: true,
  };

  return {
    ...payload,
    sourceHash: createHash(JSON.stringify(payload)),
  };
}

function toCardResponse(card, imageRecord) {
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
    cachedImageFileId: imageRecord ? imageRecord.cloudFileId || "" : "",
    syncedAt: formatDateTime(card.syncedAt),
  };
}

function buildStats(records) {
  const duelRecords = records.filter((item) => isResolvedMatchResult(item.matchResult));
  const totalGames = duelRecords.length;
  const winCount = duelRecords.filter((item) => item.matchResult === 1).length;
  const drawCount = duelRecords.filter((item) => item.matchResult === MATCH_RESULT_DRAW).length;
  const coinGames = records.filter((item) => item.coinResult === 0 || item.coinResult === 1).length;
  const coinWinCount = records.filter((item) => item.coinResult === 1).length;
  const winCoinRecords = duelRecords.filter((item) => item.coinResult === 1);
  const winCoinGames = winCoinRecords.length;
  const winCoinWinCount = winCoinRecords.filter((item) => item.matchResult === 1).length;
  const loseCoinRecords = duelRecords.filter((item) => item.coinResult === 0);
  const loseCoinGames = loseCoinRecords.length;
  const loseCoinWinCount = loseCoinRecords.filter((item) => item.matchResult === 1).length;
  const getMetricStats = (item, fieldName, ocgFieldName) => {
    const metricValues = Array.isArray(item[ocgFieldName]) ? item[ocgFieldName] : [];
    if (metricValues.length) {
      return metricValues.reduce((result, value) => {
        if (Number.isInteger(value) && value >= 0) {
          result.recordedCount += 1;
          result.totalCount += Number(value);
          if (value > 0) {
            result.positiveCount += 1;
          }
        }
        return result;
      }, {
        recordedCount: 0,
        totalCount: 0,
        positiveCount: 0,
      });
    }
    if (Number.isInteger(item[fieldName]) && item[fieldName] >= 0) {
      return {
        recordedCount: 1,
        totalCount: Number(item[fieldName]),
        positiveCount: Number(item[fieldName]) > 0 ? 1 : 0,
      };
    }
    return {
      recordedCount: 0,
      totalCount: 0,
      positiveCount: 0,
    };
  };
  const starterMetrics = records.reduce((result, item) => {
    const current = getMetricStats(item, "starterCount", "ocgStarterCounts");
    result.recordedCount += current.recordedCount;
    result.totalCount += current.totalCount;
    result.positiveCount += current.positiveCount;
    return result;
  }, {
    recordedCount: 0,
    totalCount: 0,
    positiveCount: 0,
  });
  const handTrapMetrics = records.reduce((result, item) => {
    const current = getMetricStats(item, "handTrapCount", "ocgHandTrapCounts");
    result.recordedCount += current.recordedCount;
    result.totalCount += current.totalCount;
    return result;
  }, {
    recordedCount: 0,
    totalCount: 0,
  });
  const brickMetrics = records.reduce((result, item) => {
    const current = getMetricStats(item, "brickCount", "ocgBrickCounts");
    result.recordedCount += current.recordedCount;
    result.totalCount += current.totalCount;
    return result;
  }, {
    recordedCount: 0,
    totalCount: 0,
  });
  const starterGames = starterMetrics.recordedCount;
  const hasStarterCount = starterMetrics.positiveCount;

  return {
    totalGames,
    winCount,
    drawCount,
    winRate: formatRate(winCount, totalGames),
    coinGames,
    coinWinCount,
    coinWinRate: formatRate(coinWinCount, coinGames),
    winCoinGames,
    winCoinWinCount,
    winRateWhenCoinWin: formatRate(winCoinWinCount, winCoinGames),
    loseCoinGames,
    loseCoinWinCount,
    winRateWhenCoinLoss: formatRate(loseCoinWinCount, loseCoinGames),
    starterGames,
    hasStarterCount,
    hasStarterRate: formatRate(hasStarterCount, starterGames),
    averageStarterCount: formatAverage(starterMetrics.totalCount, starterGames),
    averageHandTrapCount: formatAverage(handTrapMetrics.totalCount, handTrapMetrics.recordedCount),
    averageBrickCount: formatAverage(brickMetrics.totalCount, brickMetrics.recordedCount),
  };
}

function toRecordResponse(record, deckMap, matchTypeMap, monthMap, accountMap) {
  const deckName = record.deckId ? (deckMap.get(record.deckId) || "已删除卡组") : "已删除卡组";
  const matchTypeItem = record.matchTypeId ? matchTypeMap.get(record.matchTypeId) : null;
  const matchMonthItem = record.matchMonthId ? monthMap.get(record.matchMonthId) : null;
  const mdAccountItem =
    record.mdAccountId && accountMap ? accountMap.get(record.mdAccountId) : null;
  const hasEdited = toTimeValue(record.updatedAt) > toTimeValue(record.createdAt);
  return {
    id: record._id,
    importKey: record.importKey || "",
    matchFormat: record.matchFormat || MATCH_FORMATS.md,
    matchMonthId: record.matchMonthId || null,
    matchMonth: matchMonthItem ? matchMonthItem.itemValue : record.matchMonth,
    dayOfWeek: record.dayOfWeek,
    coinResult: record.coinResult,
    matchResult: record.matchResult,
    ocgGameResults: Array.isArray(record.ocgGameResults) ? record.ocgGameResults : [],
    ocgStarterCounts: Array.isArray(record.ocgStarterCounts) ? record.ocgStarterCounts : [],
    ocgHandTrapCounts: Array.isArray(record.ocgHandTrapCounts) ? record.ocgHandTrapCounts : [],
    ocgBrickCounts: Array.isArray(record.ocgBrickCounts) ? record.ocgBrickCounts : [],
    deckId: record.deckId || null,
    deckName,
    opponentDeck: record.opponentDeck || "",
    matchTypeId: record.matchTypeId || null,
    matchType: matchTypeItem ? matchTypeItem.itemLabel : "",
    mdAccountId: record.mdAccountId || null,
    mdAccount: mdAccountItem ? mdAccountItem.itemLabel : "",
    starterCount: Number.isInteger(record.starterCount) ? record.starterCount : null,
    handTrapCount: Number.isInteger(record.handTrapCount) ? record.handTrapCount : null,
    brickCount: Number.isInteger(record.brickCount) ? record.brickCount : null,
    remark: record.remark || "",
    failureReasons: normalizeFailureReasons(record.failureReasons),
    createTime: formatDateTime(record.createdAt),
    updateTime: formatDateTime(record.updatedAt),
    hasEdited,
    editCount: record.editCount || 0,
  };
}

function buildSharedDictNameKey(dictCode, itemValue) {
  if (dictCode === DICT_CODES.matchMonth) {
    return normalizeMonth(itemValue);
  }
  return toLowerSafe(itemValue);
}

function buildSharedDictItemId(dictCode, matchFormat, nameKey) {
  const hash = crypto
    .createHash("md5")
    .update(`${dictCode}|${matchFormat || ""}|${nameKey}`)
    .digest("hex");
  return `sd_${hash}`;
}

function buildMembershipId(openid, dictItemId) {
  const hash = crypto
    .createHash("md5")
    .update(`${openid}|${dictItemId}`)
    .digest("hex");
  return `mb_${hash}`;
}

async function findOrCreateSharedDictItem({ dictCode, matchFormat, itemValue, itemLabel }) {
  const normalizedFormat =
    dictCode === DICT_CODES.matchType ? normalizeMatchFormat(matchFormat) : null;
  const normalizedValue =
    dictCode === DICT_CODES.matchMonth ? normalizeMonth(itemValue) : String(itemValue).trim();
  const nameKey = buildSharedDictNameKey(dictCode, normalizedValue);
  const sharedId = buildSharedDictItemId(dictCode, normalizedFormat, nameKey);

  try {
    const existing = await db.collection(COLLECTIONS.dictItems).doc(sharedId).get();
    if (existing && existing.data) {
      return existing.data;
    }
  } catch (error) {
    // not found, fall through to create
  }

  const now = new Date();
  const data = {
    _id: sharedId,
    ownerOpenId: SHARED_SCOPE,
    dictCode,
    ...(normalizedFormat ? { matchFormat: normalizedFormat } : {}),
    nameKey,
    itemValue: normalizedValue,
    itemLabel:
      itemLabel ||
      (dictCode === DICT_CODES.matchMonth ? formatMonthLabel(normalizedValue) : normalizedValue),
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection(COLLECTIONS.dictItems).add({ data });
    return data;
  } catch (error) {
    const existing = await db.collection(COLLECTIONS.dictItems).doc(sharedId).get();
    return existing.data;
  }
}

async function ensureMembership({ openid, dictItem, sortOrder, isDefault }) {
  const membershipId = buildMembershipId(openid, dictItem._id);
  try {
    const existing = await db.collection(COLLECTIONS.dictMemberships).doc(membershipId).get();
    if (existing && existing.data) {
      return existing.data;
    }
  } catch (error) {
    // not found, fall through to create
  }

  const now = new Date();
  const data = {
    _id: membershipId,
    ownerOpenId: openid,
    dictItemId: dictItem._id,
    dictCode: dictItem.dictCode,
    ...(dictItem.matchFormat ? { matchFormat: dictItem.matchFormat } : {}),
    nameKey: dictItem.nameKey || buildSharedDictNameKey(dictItem.dictCode, dictItem.itemValue),
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    ...(isDefault ? { isDefault: true } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection(COLLECTIONS.dictMemberships).add({ data });
    return data;
  } catch (error) {
    const existing = await db.collection(COLLECTIONS.dictMemberships).doc(membershipId).get();
    return existing.data;
  }
}

async function countMemberships(dictItemId) {
  const result = await db
    .collection(COLLECTIONS.dictMemberships)
    .where({ dictItemId })
    .count();
  return result.total || 0;
}

async function removeMembershipAndMaybeOrphan(openid, dictItemId) {
  const membershipId = buildMembershipId(openid, dictItemId);
  try {
    await db.collection(COLLECTIONS.dictMemberships).doc(membershipId).remove();
  } catch (error) {
    // ignore missing membership
  }
  const remaining = await countMemberships(dictItemId);
  if (remaining === 0) {
    try {
      await db.collection(COLLECTIONS.dictItems).doc(dictItemId).remove();
    } catch (error) {
      // ignore missing shared item
    }
  }
  return remaining;
}

async function fetchUserMemberships(openid, dictCode, matchFormat) {
  const memberships = await fetchAllByQuery(
    COLLECTIONS.dictMemberships,
    { ownerOpenId: openid, dictCode },
    { orderByField: "sortOrder", orderDirection: "asc" }
  );
  if (dictCode === DICT_CODES.matchType && matchFormat) {
    return memberships.filter((item) =>
      isMatchFormatMatched(item.matchFormat, matchFormat)
    );
  }
  return memberships;
}

async function fetchSharedDictItemsByIds(dictItemIds) {
  const ids = Array.from(new Set((dictItemIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }
  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.dictItems)
      .where({
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...(result.data || []));
  }
  return new Map(resultData.map((item) => [item._id, item]));
}

async function findDictItemByValue({ ownerOpenId, dictCode, itemValue, matchFormat }) {
  const result = await fetchAllByQuery(COLLECTIONS.dictItems, {
    ownerOpenId,
    dictCode,
    itemValue,
  });
  return (
    (result || []).find((item) =>
      dictCode === DICT_CODES.matchType
        ? isMatchFormatMatched(item.matchFormat, matchFormat)
        : true
    ) || null
  );
}

async function findDeckByName({ ownerOpenId, deckName, matchFormat }) {
  const result = await fetchAllByQuery(COLLECTIONS.decks, {
    ownerOpenId,
    deckNameLower: toLowerSafe(deckName),
  });
  return (
    (result || []).find((item) => isMatchFormatMatched(item.matchFormat, matchFormat)) || null
  );
}

async function getDeckById(openid, deckId, matchFormat = MATCH_FORMATS.md) {
  try {
    const result = await db.collection(COLLECTIONS.decks).doc(deckId).get();
    const deck = result.data;
    if (
      !deck ||
      deck.ownerOpenId !== openid ||
      !isMatchFormatMatched(deck.matchFormat, matchFormat)
    ) {
      return null;
    }
    return deck;
  } catch (error) {
    return null;
  }
}

async function getDictItemById(openid, dictCode, itemId, matchFormat) {
  try {
    const result = await db.collection(COLLECTIONS.dictItems).doc(itemId).get();
    const item = result.data;
    if (!item || item.dictCode !== dictCode) {
      return null;
    }
    if (
      dictCode === DICT_CODES.matchType ||
      dictCode === DICT_CODES.matchMonth ||
      dictCode === DICT_CODES.mdAccount
    ) {
      // shared dictionary: validate existence + (for type) format only
      if (item.ownerOpenId !== SHARED_SCOPE) {
        return null;
      }
    } else if (item.ownerOpenId !== getDictionaryOwner(dictCode, openid)) {
      return null;
    }
    if (
      dictCode === DICT_CODES.matchType &&
      !isMatchFormatMatched(item.matchFormat, matchFormat || MATCH_FORMATS.md)
    ) {
      return null;
    }
    return item;
  } catch (error) {
    return null;
  }
}

async function ensureMonthDictItem(openid, matchMonth) {
  const sharedItem = await findOrCreateSharedDictItem({
    dictCode: DICT_CODES.matchMonth,
    itemValue: matchMonth,
  });
  const memberships = await fetchUserMemberships(openid, DICT_CODES.matchMonth);
  await ensureMembership({
    openid,
    dictItem: sharedItem,
    sortOrder: memberships.length + 1,
  });
  return sharedItem;
}

function buildRecordQuery(openid, params) {
  const query = {
    ownerOpenId: openid,
  };
  const matchFormat = normalizeMatchFormat(params.matchFormat);

  const matchMonth = params.matchMonth;
  const isAllMode = !matchMonth || matchMonth === "all";
  if (!isAllMode) {
    query.matchMonth = normalizeMonth(matchMonth);
  }

  if (!isAllMode && params.dayOfWeek && params.dayOfWeek.length) {
    query.dayOfWeek = _.in(params.dayOfWeek);
  }

  if (params.deckId && params.deckId.length) {
    query.deckId = _.in(params.deckId);
  }

  // 对战类型与月份筛选彼此独立；月份为“全部”时也必须保留类型条件。
  if (params.matchType) {
    query.matchTypeId = params.matchType;
  }

  if (params.coinResult === 0 || params.coinResult === 1) {
    query.coinResult = params.coinResult;
  }

  if (
    params.matchResult === 0 ||
    params.matchResult === 1 ||
    params.matchResult === 2 ||
    params.matchResult === 3 ||
    params.matchResult === MATCH_RESULT_DRAW
  ) {
    query.matchResult = params.matchResult;
  }

  return {
    query,
    isAllMode,
    matchFormat,
  };
}

async function fetchAllRecords(openid, params) {
  const { query, matchFormat } = buildRecordQuery(openid, params);
  const records = [];
  for (let skip = 0; ; skip += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.records)
      .where(query)
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(QUERY_BATCH_SIZE)
      .get();
    const batch = result.data || [];
    if (!batch.length) {
      break;
    }
    records.push(...batch);
    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }
  }

  return records
    .filter((item) =>
      matchFormat === MATCH_FORMATS.ocg
        ? item.matchFormat === MATCH_FORMATS.ocg
        : (item.matchFormat || MATCH_FORMATS.md) === MATCH_FORMATS.md
    )
    .sort(compareRecordSortDesc);
}

async function fetchAllByQuery(collectionName, query, options = {}) {
  const {
    orderByField = "",
    orderDirection = "asc",
  } = options;
  const collection = db.collection(collectionName);
  const rows = [];
  for (let skip = 0; ; skip += QUERY_BATCH_SIZE) {
    let queryBuilder = collection.where(query);
    if (orderByField) {
      queryBuilder = queryBuilder.orderBy(orderByField, orderDirection);
    }
    const result = await queryBuilder.skip(skip).limit(QUERY_BATCH_SIZE).get();
    const batch = result.data || [];
    if (!batch.length) {
      break;
    }
    rows.push(...batch);
    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchSyncState(source, stateKey) {
  const result = await db
    .collection(COLLECTIONS.syncState)
    .where({
      source,
      stateKey,
    })
    .limit(1)
    .get();
  return result.data[0] || null;
}

async function saveSyncState(source, stateKey, data) {
  const existing = await fetchSyncState(source, stateKey);
  const sanitizedData = { ...(data || {}) };
  delete sanitizedData._id;
  delete sanitizedData.createdAt;
  delete sanitizedData.updatedAt;
  delete sanitizedData.source;
  delete sanitizedData.stateKey;
  const payload = {
    source,
    stateKey,
    ...sanitizedData,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.collection(COLLECTIONS.syncState).doc(existing._id).update({
      data: payload,
    });
    return existing._id;
  }

  const result = await db.collection(COLLECTIONS.syncState).add({
    data: {
      ...payload,
      createdAt: new Date(),
    },
  });
  return result._id;
}

async function removeRecordsByQuery(query) {
  const records = await fetchAllByQuery(COLLECTIONS.records, query);
  for (const record of records) {
    await db.collection(COLLECTIONS.records).doc(record._id).remove();
  }
  return records.length;
}

async function clearRecordMdAccountByQuery(query) {
  const records = await fetchAllByQuery(COLLECTIONS.records, query);
  for (const record of records) {
    await db.collection(COLLECTIONS.records).doc(record._id).update({
      data: {
        mdAccountId: null,
      },
    });
  }
  return records.length;
}

async function transferRecordMdAccountByQuery(query, targetAccountId) {
  const records = await fetchAllByQuery(COLLECTIONS.records, query);
  for (const record of records) {
    await db.collection(COLLECTIONS.records).doc(record._id).update({
      data: {
        mdAccountId: targetAccountId,
      },
    });
  }
  return records.length;
}

async function removeDeckCardsByQuery(query) {
  const records = await fetchAllByQuery(COLLECTIONS.deckCards, query);
  for (const record of records) {
    await db.collection(COLLECTIONS.deckCards).doc(record._id).remove();
  }
  return records.length;
}

async function fetchDeckMap(openid, deckIds, matchFormat = MATCH_FORMATS.md) {
  const ids = Array.from(new Set((deckIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.decks)
      .where({
        ownerOpenId: openid,
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData
      .filter((item) => isMatchFormatMatched(item.matchFormat, matchFormat))
      .map((item) => [item._id, item.deckName])
  );
}

async function fetchGlobalDeckMap(deckIds, matchFormat = MATCH_FORMATS.md) {
  const ids = Array.from(new Set((deckIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.decks)
      .where({
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData
      .filter((item) => isMatchFormatMatched(item.matchFormat, matchFormat))
      .map((item) => [item._id, item.deckName])
  );
}

async function filterRecordsWithExistingDecks(openid, records, matchFormat = MATCH_FORMATS.md) {
  const deckMap = await fetchDeckMap(
    openid,
    (records || []).map((item) => item.deckId),
    matchFormat
  );

  return {
    deckMap,
    records: (records || []).filter(
      (item) => item && item.deckId && deckMap.has(item.deckId)
    ),
  };
}

async function fetchMatchTypeMap(openid, matchTypeIds, matchFormat = MATCH_FORMATS.md) {
  const ids = Array.from(new Set((matchTypeIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.dictItems)
      .where({
        dictCode: DICT_CODES.matchType,
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData
      .filter((item) => isMatchFormatMatched(item.matchFormat, matchFormat))
      .map((item) => [
      item._id,
      {
        id: item._id,
        itemValue: item.itemValue,
        itemLabel: item.itemLabel,
      },
    ])
  );
}

async function fetchGlobalMatchTypeNameMap(matchTypeIds, matchFormat = MATCH_FORMATS.md) {
  const ids = Array.from(new Set((matchTypeIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.dictItems)
      .where({
        dictCode: DICT_CODES.matchType,
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData
      .filter((item) => isMatchFormatMatched(item.matchFormat, matchFormat))
      .map((item) => [
        item._id,
        {
          nameKey: toLowerSafe(item.itemValue),
          itemValue: item.itemValue,
          itemLabel: item.itemLabel,
        },
      ])
  );
}

async function fetchMonthMap(openid, monthIds) {
  const ids = Array.from(new Set((monthIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.dictItems)
      .where({
        dictCode: DICT_CODES.matchMonth,
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData.map((item) => [
      item._id,
      {
        id: item._id,
        itemValue: item.itemValue,
        itemLabel: item.itemLabel,
      },
    ])
  );
}

async function fetchMdAccountMap(openid, accountIds) {
  const ids = Array.from(new Set((accountIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const resultData = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.dictItems)
      .where({
        dictCode: DICT_CODES.mdAccount,
        _id: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    resultData.push(...result.data);
  }

  return new Map(
    resultData.map((item) => [
      item._id,
      {
        id: item._id,
        itemValue: item.itemValue,
        itemLabel: item.itemLabel,
      },
    ])
  );
}

async function fetchCardMap(cardIds) {
  const ids = Array.from(new Set((cardIds || []).filter(Boolean).map((item) => String(item))));
  if (!ids.length) {
    return new Map();
  }

  const cards = [];
  const foundIds = new Set();
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.cards)
      .where({
        cardId: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    cards.push(...(result.data || []));
    (result.data || []).forEach((c) => foundIds.add(String(c.cardId)));
  }

  // 本地库未同步时的在线降级：逐张查 ygocdb（H5 / 首次使用无本地卡库时）
  const missingIds = ids.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    for (const cardId of missingIds) {
      try {
        const onlineCard = await getCard({ cardId });
        if (onlineCard) {
          cards.push(onlineCard);
        }
      } catch (e) {
        // 在线也找不到就跳过，由调用方（handleDeckCardsSave 等）统一报错
      }
    }
  }

  return new Map(cards.map((item) => [String(item.cardId), item]));
}

async function fetchCardImageMap(cardIds) {
  const ids = Array.from(new Set((cardIds || []).filter(Boolean).map((item) => String(item))));
  if (!ids.length) {
    return new Map();
  }

  const images = [];
  for (let index = 0; index < ids.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.cardImages)
      .where({
        cardId: _.in(ids.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    images.push(...(result.data || []));
  }

  return new Map(images.map((item) => [String(item.cardId), item]));
}

async function upsertCardImageRecord(cardId, payload) {
  const existingMap = await fetchCardImageMap([cardId]);
  const existing = existingMap.get(String(cardId));

  if (existing) {
    await db.collection(COLLECTIONS.cardImages).doc(existing._id).update({
      data: {
        ...payload,
        updatedAt: new Date(),
      },
    });
    return {
      ...existing,
      ...payload,
    };
  }

  const result = await db.collection(COLLECTIONS.cardImages).add({
    data: {
      cardId: String(cardId),
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    _id: result._id,
    cardId: String(cardId),
    ...payload,
  };
}

function isTimeoutLikeError(error) {
  const message = String(error && (error.errMsg || error.message || error) || "");
  const code = String((error && error.code) || "");
  return code === "ECONNABORTED" || /timeout|timed out|超时/i.test(message);
}

async function fetchYgoCdbCardsMd5(options = {}) {
  const timeoutMs =
    Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;
  const response = await axios.get(YGOCDB_CARDS_MD5_URL, {
    timeout: timeoutMs,
    responseType: "text",
  });
  const value = String(response.data || "")
    .trim()
    .replace(/^"+|"+$/g, "");
  if (!value) {
    throw new ApiError(
      ERROR_CODES.syncFailed,
      "同步失败",
      "未获取到 cards.zip.md5 内容"
    );
  }
  return value;
}

async function fetchYgoCdbCardsZipBuffer() {
  const response = await axios.get(YGOCDB_CARDS_ZIP_URL, {
    timeout: 120000,
    responseType: "arraybuffer",
  });
  return Buffer.from(response.data);
}

function parseCardsFromZipBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const jsonEntry = entries.find((item) =>
    String(item.entryName || "").toLowerCase().endsWith(".json")
  );

  if (!jsonEntry) {
    throw new ApiError(
      ERROR_CODES.syncFailed,
      "同步失败",
      "cards.zip 中未找到 JSON 数据文件"
    );
  }

  const jsonText = zip.readAsText(jsonEntry, "utf8");
  const parsed = JSON.parse(jsonText);
  const cardList = extractCardListFromParsedZipJson(parsed);
  if (!Array.isArray(cardList)) {
    const objectKeys =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).slice(0, 10).join(", ")
        : "";
    throw new ApiError(
      ERROR_CODES.syncFailed,
      "同步失败",
      objectKeys
        ? `cards.zip JSON 根结构无法识别，可用顶层字段: ${objectKeys}`
        : "cards.zip 解压后的 JSON 结构无法识别"
    );
  }

  return cardList.map(normalizeYgoCdbCard);
}

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

async function fetchYgoCdbCardsZip() {
  return parseCardsFromZipBuffer(await fetchYgoCdbCardsZipBuffer());
}

async function runWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(concurrency) || 1);
  let currentIndex = 0;

  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (currentIndex < list.length) {
      const index = currentIndex;
      currentIndex += 1;
      await worker(list[index], index);
    }
  });

  await Promise.all(runners);
}

function hasActiveCardSyncJob(state) {
  return (
    state &&
    state.syncJobCloudFileId &&
    (state.syncJobStatus === CARD_SYNC_JOB_STATUS.syncingCards ||
      state.syncJobStatus === CARD_SYNC_JOB_STATUS.markingInactive)
  );
}

function buildCardSyncProgress(state, overrides = {}) {
  const totalCards = Number(state && state.syncJobTotalCards) || 0;
  const processedCards = Math.min(Number(state && state.syncJobCursor) || 0, totalCards);
  const inactiveCursor = Number(state && state.syncJobInactiveCursor) || 0;
  const mode =
    overrides.mode ||
    (state && state.syncJobMode) ||
    CARD_SYNC_MODES.full;
  const stage =
    overrides.stage ||
    (state && state.syncJobStatus === CARD_SYNC_JOB_STATUS.markingInactive
      ? "marking_inactive"
      : state && state.syncJobStatus === CARD_SYNC_JOB_STATUS.syncingCards
        ? "syncing_cards"
        : "completed");
  let progressText =
    mode === CARD_SYNC_MODES.fast
      ? `快速同步已写入 ${processedCards}/${totalCards} 张卡`
      : `已写入 ${processedCards}/${totalCards} 张卡`;
  if (stage === "marking_inactive") {
    progressText = `已写入 ${totalCards}/${totalCards} 张卡，正在检查失效卡 ${inactiveCursor}`;
  }
  if (overrides.progressText) {
    progressText = overrides.progressText;
  }

  return {
    completed: false,
    stage,
    mode,
    cardsMd5: (state && state.syncJobCardsMd5) || (state && state.cardsMd5) || "",
    totalCards,
    processedCards,
    createdCount: Number(state && state.syncJobCreatedCount) || 0,
    updatedCount: Number(state && state.syncJobUpdatedCount) || 0,
    inactiveCount: Number(state && state.syncJobInactiveCount) || 0,
    inactiveCheckPending: Boolean(state && state.inactiveCheckPending),
    progressText,
    ...overrides,
  };
}

async function loadCardsFromSyncJob(state) {
  const downloadResult = await cloud.downloadFile({
    fileID: state.syncJobCloudFileId,
  });
  return parseCardsFromZipBuffer(Buffer.from(downloadResult.fileContent));
}

async function upsertCardChunk(cardList) {
  const cards = cardList || [];
  const now = new Date();
  const existingMap = await fetchCardMap(cards.map((item) => item.cardId));
  const createList = [];
  const updateList = [];

  for (const card of cards) {
    const existing = existingMap.get(String(card.cardId));
    if (!existing) {
      createList.push(card);
      continue;
    }

    if (existing.sourceHash !== card.sourceHash || existing.isActive !== true) {
      updateList.push({
        id: existing._id,
        card,
      });
    }
  }

  await runWithConcurrency(createList, CARD_SYNC_WRITE_CONCURRENCY, async (card) => {
    await db.collection(COLLECTIONS.cards).add({
      data: {
        ...card,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  await runWithConcurrency(updateList, CARD_SYNC_WRITE_CONCURRENCY, async (item) => {
    await db.collection(COLLECTIONS.cards).doc(item.id).update({
      data: {
        ...item.card,
        syncedAt: now,
        updatedAt: now,
      },
    });
  });

  return {
    createdCount: createList.length,
    updatedCount: updateList.length,
  };
}

async function markInactiveCardsChunk(activeSet, skip) {
  const result = await db
    .collection(COLLECTIONS.cards)
    .skip(skip)
    .limit(CARD_SYNC_INACTIVE_CHUNK_SIZE)
    .get();
  const cards = result.data || [];
  const toDeactivate = cards.filter((card) => {
    const cardId = String(card.cardId || "");
    return cardId && !activeSet.has(cardId) && card.isActive !== false;
  });
  const now = new Date();

  await runWithConcurrency(toDeactivate, CARD_SYNC_WRITE_CONCURRENCY, async (card) => {
    await db.collection(COLLECTIONS.cards).doc(card._id).update({
      data: {
        isActive: false,
        updatedAt: now,
      },
    });
  });

  return {
    scannedCount: cards.length,
    inactiveCount: toDeactivate.length,
    hasMore: cards.length === CARD_SYNC_INACTIVE_CHUNK_SIZE,
  };
}

async function initializeCardSyncJob(state, mode) {
  const [cardsMd5, zipBuffer] = await Promise.all([
    fetchYgoCdbCardsMd5(),
    fetchYgoCdbCardsZipBuffer(),
  ]);
  const cards = parseCardsFromZipBuffer(zipBuffer);
  const uploadResult = await cloud.uploadFile({
    cloudPath: `${CARD_SYNC_TEMP_PATH_PREFIX}/${cardsMd5}-${Date.now()}.zip`,
    fileContent: zipBuffer,
  });
  const now = new Date();
  const nextState = {
    cardsMd5: state && state.cardsMd5 ? state.cardsMd5 : "",
    remoteCardsMd5: cardsMd5,
    lastCheckedAt: now,
    lastSyncedAt: state && state.lastSyncedAt ? state.lastSyncedAt : null,
    totalCards: state && state.totalCards ? state.totalCards : 0,
    syncJobStatus: CARD_SYNC_JOB_STATUS.syncingCards,
    syncJobMode: mode,
    syncJobCardsMd5: cardsMd5,
    syncJobCloudFileId: uploadResult.fileID,
    syncJobCursor: 0,
    syncJobInactiveCursor: 0,
    syncJobTotalCards: cards.length,
    syncJobCreatedCount: 0,
    syncJobUpdatedCount: 0,
    syncJobInactiveCount: 0,
    syncJobStartedAt: now,
    syncJobFinishedAt: null,
    syncJobError: "",
    inactiveCheckPending: Boolean(state && state.inactiveCheckPending),
    lastInactiveCheckAt: state && state.lastInactiveCheckAt ? state.lastInactiveCheckAt : null,
  };
  await saveSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY, nextState);
  return nextState;
}

async function finalizeCardSyncJob(state) {
  const now = new Date();
  const mode = state && state.syncJobMode === CARD_SYNC_MODES.fast
    ? CARD_SYNC_MODES.fast
    : CARD_SYNC_MODES.full;
  const inactiveCheckPending =
    mode === CARD_SYNC_MODES.fast
      ? true
      : false;
  const finalState = {
    cardsMd5: state.syncJobCardsMd5 || "",
    remoteCardsMd5: state.syncJobCardsMd5 || "",
    lastCheckedAt: now,
    lastSyncedAt: now,
    totalCards: Number(state.syncJobTotalCards) || 0,
    syncJobStatus: "",
    syncJobMode: "",
    syncJobCardsMd5: "",
    syncJobCloudFileId: "",
    syncJobCursor: 0,
    syncJobInactiveCursor: 0,
    syncJobTotalCards: 0,
    syncJobCreatedCount: 0,
    syncJobUpdatedCount: 0,
    syncJobInactiveCount: 0,
    syncJobStartedAt: null,
    syncJobFinishedAt: now,
    syncJobError: "",
    inactiveCheckPending,
    lastInactiveCheckAt:
      mode === CARD_SYNC_MODES.full
        ? now
        : state && state.lastInactiveCheckAt
          ? state.lastInactiveCheckAt
          : null,
  };
  await saveSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY, finalState);

  return {
    completed: true,
    stage: "completed",
    mode,
    cardsMd5: finalState.cardsMd5,
    totalCards: finalState.totalCards,
    processedCards: finalState.totalCards,
    createdCount: Number(state.syncJobCreatedCount) || 0,
    updatedCount: Number(state.syncJobUpdatedCount) || 0,
    inactiveCount: Number(state.syncJobInactiveCount) || 0,
    inactiveCheckPending,
    progressText:
      mode === CARD_SYNC_MODES.fast
        ? `快速同步完成，共 ${finalState.totalCards} 张卡，未检查失效卡`
        : `同步完成，共 ${finalState.totalCards} 张卡`,
    syncedAt: formatDateTime(now),
  };
}

async function runCardSyncStep(state) {
  const cards = await loadCardsFromSyncJob(state);
  const mode = state && state.syncJobMode === CARD_SYNC_MODES.fast
    ? CARD_SYNC_MODES.fast
    : CARD_SYNC_MODES.full;

  if (state.syncJobStatus === CARD_SYNC_JOB_STATUS.syncingCards) {
    const start = Number(state.syncJobCursor) || 0;
    const end = Math.min(start + CARD_SYNC_CARD_CHUNK_SIZE, cards.length);
    const chunk = cards.slice(start, end);
    const chunkResult = await upsertCardChunk(chunk);
    const nextState = {
      ...state,
      syncJobCursor: end,
      syncJobCreatedCount:
        (Number(state.syncJobCreatedCount) || 0) + chunkResult.createdCount,
      syncJobUpdatedCount:
        (Number(state.syncJobUpdatedCount) || 0) + chunkResult.updatedCount,
      syncJobStatus:
        end >= cards.length && mode === CARD_SYNC_MODES.full
          ? CARD_SYNC_JOB_STATUS.markingInactive
          : CARD_SYNC_JOB_STATUS.syncingCards,
    };

    if (end >= cards.length && mode === CARD_SYNC_MODES.fast) {
      return finalizeCardSyncJob(nextState);
    }

    await saveSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY, nextState);

    return buildCardSyncProgress(nextState, {
      mode,
      stage:
        end >= cards.length ? "marking_inactive" : "syncing_cards",
      progressText:
        end >= cards.length
          ? `已写入 ${cards.length}/${cards.length} 张卡，准备检查失效卡`
          : mode === CARD_SYNC_MODES.fast
            ? `快速同步已写入 ${end}/${cards.length} 张卡`
            : `已写入 ${end}/${cards.length} 张卡`,
    });
  }

  const activeSet = new Set(cards.map((item) => String(item.cardId)));
  const inactiveCursor = Number(state.syncJobInactiveCursor) || 0;
  const chunkResult = await markInactiveCardsChunk(activeSet, inactiveCursor);
  const nextState = {
    ...state,
    syncJobInactiveCursor: inactiveCursor + chunkResult.scannedCount,
    syncJobInactiveCount:
      (Number(state.syncJobInactiveCount) || 0) + chunkResult.inactiveCount,
  };

  if (!chunkResult.hasMore) {
    return finalizeCardSyncJob(nextState);
  }

  await saveSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY, nextState);
  return buildCardSyncProgress(nextState, {
    mode,
    stage: "marking_inactive",
  });
}

async function cacheCardThumbImage(card) {
  const cardId = String(card.cardId);
  const remoteUrl = card.thumbUrl || buildCardThumbUrl(cardId);
  const response = await axios.get(remoteUrl, {
    timeout: 30000,
    responseType: "arraybuffer",
  });
  const fileContent = Buffer.from(response.data);
  const uploadResult = await cloud.uploadFile({
    cloudPath: `ygo-cards/thumb/${cardId}.jpg`,
    fileContent,
  });
  const now = new Date();
  const record = await upsertCardImageRecord(cardId, {
    remoteUrl,
    cloudFileId: uploadResult.fileID,
    status: "ready",
    downloadedAt: now,
    lastAccessedAt: now,
  });

  return record;
}

async function resolveDefaultMatchTypeId(openid, matchFormat) {
  const normalizedFormat = normalizeMatchFormat(matchFormat);
  const memberships = await fetchUserMemberships(
    openid,
    DICT_CODES.matchType,
    normalizedFormat
  );

  if (memberships[0]) {
    return memberships[0].dictItemId;
  }

  const defaultLabel = DEFAULT_MATCH_TYPE_BY_FORMAT[normalizedFormat];
  const sharedItem = await findOrCreateSharedDictItem({
    dictCode: DICT_CODES.matchType,
    matchFormat: normalizedFormat,
    itemValue: defaultLabel,
  });
  await ensureMembership({
    openid,
    dictItem: sharedItem,
    sortOrder: 1,
    isDefault: true,
  });
  return sharedItem._id;
}

async function validateRecordPayload(openid, payload, options = {}) {
  const matchFormat = normalizeMatchFormat(payload.matchFormat);
  let matchMonth;
  let matchMonthId = payload.matchMonthId ? normalizeId(payload.matchMonthId, "对局月份") : "";
  if (matchMonthId) {
    const matchMonthItem = await getDictItemById(openid, DICT_CODES.matchMonth, matchMonthId);
    if (!matchMonthItem) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `无效的对局月份: ${matchMonthId}`
      );
    }
    matchMonth = normalizeMonth(matchMonthItem.itemValue);
  } else {
    matchMonth = options.allowMissingMonth && isBlank(payload.matchMonth)
      ? undefined
      : normalizeMonth(payload.matchMonth);
  }
  const dayOfWeek = normalizeOptionalDayOfWeek(payload.dayOfWeek);
  const coinResult = normalizeCoinResultFlag(payload.coinResult, "硬币结果");
  const deckId = normalizeId(payload.deckId, "卡组ID");
  const remark = normalizeRemark(payload.remark);
  let matchResult;
  let ocgGameResults = [];

  if (matchFormat === MATCH_FORMATS.ocg) {
    ocgGameResults = normalizeOcgGameResults(payload.ocgGameResults);
    matchResult = deriveOcgMatchResult(ocgGameResults);
  } else {
    matchResult = normalizeMatchResultFlag(payload.matchResult, "胜负结果");
  }

  if (dayOfWeek) {
    const legacyDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const dayNumber = Number(dayOfWeek);
    const isDayNumber = /^\d{1,2}$/.test(dayOfWeek) && dayNumber >= 1 && dayNumber <= 31;
    if (!isDayNumber && !legacyDayLabels.includes(dayOfWeek)) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `无效的日期值: ${dayOfWeek}`
      );
    }
  }

  const deckMatched = await getDeckById(openid, deckId, matchFormat);
  if (!deckMatched) {
    throw new ApiError(
      ERROR_CODES.deckNotFound,
      "卡组不存在",
      `未找到卡组: ${deckId}`
    );
  }

  let matchTypeId = payload.matchType ? normalizeId(payload.matchType, "对局类型") : null;
  if (!matchTypeId) {
    matchTypeId = await resolveDefaultMatchTypeId(openid, matchFormat);
  }

  if (!matchTypeId) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "当前用户没有可用的对局类型，请先创建对局类型字典项"
    );
  }

  const matchTypeItem = await getDictItemById(openid, DICT_CODES.matchType, matchTypeId, matchFormat);
  if (!matchTypeItem) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `无效的对局类型: ${matchTypeId}`
    );
  }

  return {
    matchFormat,
    matchMonth,
    matchMonthId,
    dayOfWeek,
    coinResult,
    matchResult,
    ocgGameResults,
    deckId,
    remark,
    matchTypeId,
  };
}

async function handleRecordPage(params, context) {
  const pageNum = normalizePageNum(params.pageNum);
  const pageSize = normalizePageSize(params.pageSize);
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const dayOfWeek = normalizeStringArray(params.dayOfWeek, "星期筛选");
  const deckId = normalizeIdArray(params.deckId, "卡组筛选");
  const matchType = params.matchType ? normalizeId(params.matchType, "对局类型") : "";
  const coinResult =
    params.coinResult === "" || params.coinResult === null || params.coinResult === undefined
      ? undefined
      : normalizeCoinResultFlag(params.coinResult, "硬币结果");
  const matchResult =
    params.matchResult === "" || params.matchResult === null || params.matchResult === undefined
      ? undefined
      : normalizeMatchResultFlag(params.matchResult, "胜负结果");

  const allRecords = await fetchAllRecords(context.openid, {
    matchFormat,
    matchMonth: params.matchMonth,
    dayOfWeek,
    deckId,
    matchType,
    coinResult,
    matchResult,
  });
  const { records: filteredRecords, deckMap } = await filterRecordsWithExistingDecks(
    context.openid,
    allRecords,
    matchFormat
  );
  const total = filteredRecords.length;
  const records = filteredRecords.slice(
    (pageNum - 1) * pageSize,
    pageNum * pageSize
  );
  const matchTypeMap = await fetchMatchTypeMap(
    context.openid,
    records.map((item) => item.matchTypeId),
    matchFormat
  );
  const monthMap = await fetchMonthMap(
    context.openid,
    records.map((item) => item.matchMonthId)
  );
  const accountMap = await fetchMdAccountMap(
    context.openid,
    records.map((item) => item.mdAccountId)
  );

  return success({
    total,
    data: records.map((item) =>
      toRecordResponse(item, deckMap, matchTypeMap, monthMap, accountMap)
    ),
  });
}

async function handleRecordGet(params, context) {
  const id = normalizeId(params.id, "对局记录ID");
  try {
    const result = await db.collection(COLLECTIONS.records).doc(id).get();
    const record = result.data;
    if (!record || record.ownerOpenId !== context.openid) {
      throw new ApiError(
        ERROR_CODES.recordNotFound,
        "对局记录不存在",
        `未找到对局记录: ${id}`
      );
    }

    const { records: filteredRecords, deckMap } = await filterRecordsWithExistingDecks(
      context.openid,
      [record],
      record.matchFormat || MATCH_FORMATS.md
    );
    if (!filteredRecords.length) {
      throw new ApiError(
        ERROR_CODES.recordNotFound,
        "对局记录不存在",
        `未找到对局记录: ${id}`
      );
    }
    const matchTypeMap = await fetchMatchTypeMap(
      context.openid,
      [record.matchTypeId],
      record.matchFormat || MATCH_FORMATS.md
    );
    const monthMap = await fetchMonthMap(context.openid, [record.matchMonthId]);
    const accountMap = await fetchMdAccountMap(context.openid, [record.mdAccountId]);
    return success(toRecordResponse(record, deckMap, matchTypeMap, monthMap, accountMap));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      ERROR_CODES.recordNotFound,
      "对局记录不存在",
      `未找到对局记录: ${id}`
    );
  }
}

async function handleRecordSave(params, context) {
  const payload = await validateRecordPayload(context.openid, params);
  if (!payload.matchMonthId) {
    const monthItem = await ensureMonthDictItem(context.openid, payload.matchMonth);
    payload.matchMonthId = monthItem ? monthItem._id : "";
  }

  const now = new Date();
  const result = await db.collection(COLLECTIONS.records).add({
    data: {
      ownerOpenId: context.openid,
      appid: context.appid,
      unionid: context.unionid,
      matchFormat: payload.matchFormat,
      matchMonth: payload.matchMonth,
      matchMonthId: payload.matchMonthId || null,
      dayOfWeek: payload.dayOfWeek,
      coinResult: payload.coinResult,
      matchResult: payload.matchResult,
      ocgGameResults: payload.ocgGameResults,
      ocgStarterCounts: payload.ocgStarterCounts,
      ocgHandTrapCounts: payload.ocgHandTrapCounts,
      ocgBrickCounts: payload.ocgBrickCounts,
      deckId: payload.deckId,
      matchTypeId: payload.matchTypeId,
      remark: payload.remark,
      importKey: String(params.importKey || "").trim().slice(0, 128),
      editCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  });

  return success({
    id: result._id,
    createTime: formatDateTime(now),
  });
}

async function handleRecordUpdate(params, context) {
  const id = normalizeId(params.id, "对局记录ID");
  let existing;
  try {
    const result = await db.collection(COLLECTIONS.records).doc(id).get();
    existing = result.data;
  } catch (error) {
    existing = null;
  }

  if (!existing || existing.ownerOpenId !== context.openid) {
    throw new ApiError(
      ERROR_CODES.recordNotFound,
      "对局记录不存在",
      `未找到对局记录: ${id}`
    );
  }

  // Rate limit: max 3 edits per minute
  const rateWindowStart = new Date(Date.now() - EDIT_RATE_LIMIT_WINDOW_MS);
  const recentEdits = await db
    .collection(COLLECTIONS.editLogs)
    .where({
      recordId: id,
      createdAt: _.gte(rateWindowStart),
    })
    .count();
  if (recentEdits.total >= EDIT_RATE_LIMIT_MAX) {
    throw new ApiError(
      ERROR_CODES.editRateLimited,
      "修改过于频繁",
      "一分钟内最多修改3次，请稍后再试"
    );
  }

  const payload = await validateRecordPayload(context.openid, {
    matchFormat: isBlank(params.matchFormat)
      ? (existing.matchFormat || MATCH_FORMATS.md)
      : params.matchFormat,
    matchMonthId: params.matchMonthId,
    matchMonth: isBlank(params.matchMonth) ? existing.matchMonth : params.matchMonth,
    dayOfWeek: params.dayOfWeek,
    coinResult: params.coinResult,
    matchResult: params.matchResult,
    ocgGameResults:
      params.ocgGameResults === undefined
        ? (Array.isArray(existing.ocgGameResults) ? existing.ocgGameResults : [])
        : params.ocgGameResults,
    deckId: params.deckId,
    matchType: params.matchType,
    remark: params.remark,
  });

  if (!payload.matchMonthId) {
    const monthItem = await ensureMonthDictItem(context.openid, payload.matchMonth);
    payload.matchMonthId = monthItem ? monthItem._id : "";
  }

  const nextEditCount = (existing.editCount || 0) + 1;

  await db.collection(COLLECTIONS.records).doc(id).update({
    data: {
      matchFormat: payload.matchFormat,
      matchMonth: payload.matchMonth,
      matchMonthId: payload.matchMonthId || null,
      dayOfWeek: payload.dayOfWeek,
      coinResult: payload.coinResult,
      matchResult: payload.matchResult,
      ocgGameResults: payload.ocgGameResults,
      deckId: payload.deckId,
      matchTypeId: payload.matchTypeId,
      remark: payload.remark,
      editCount: nextEditCount,
      updatedAt: new Date(),
    },
  });

  // Record edit history
  const changedFields = await getChangedFields(existing, payload, context.openid);
  await db.collection(COLLECTIONS.editLogs).add({
    data: {
      recordId: id,
      ownerOpenId: context.openid,
      changedFields,
      sequence: nextEditCount,
      createdAt: new Date(),
    },
  });

  return success(null);
}

async function getChangedFields(existing, payload, openid) {
  const fieldLabelMap = {
    matchMonth: "月份",
    dayOfWeek: "日期",
    coinResult: "骰子",
    matchResult: "胜负",
    deckId: "卡组",
    matchTypeId: "对战类型",
    mdAccountId: "MD账号",
    starterCount: "动点数",
    handTrapCount: "手坑数",
    brickCount: "废件数",
    opponentDeck: "对手卡组",
    remark: "备注",
    failureReasons: "失败原因",
  };
  const matchTypeNames = new Map();
  const matchTypeIds = [existing.matchTypeId, payload.matchTypeId]
    .filter(Boolean)
    .map((id) => String(id));
  await Promise.all(
    Array.from(new Set(matchTypeIds)).map(async (id) => {
      const item = await getDictItemById(
        openid,
        DICT_CODES.matchType,
        id,
        payload.matchFormat || existing.matchFormat
      );
      matchTypeNames.set(id, String(item && (item.itemLabel || item.itemValue) || id));
    })
  );
  const changed = [];
  for (const [key, label] of Object.entries(fieldLabelMap)) {
    const oldVal = existing[key];
    const newVal = payload[key];
    if (key === "coinResult") {
      const oldText = oldVal === 1 ? "赢骰" : oldVal === 0 ? "输骰" : "";
      const newText = newVal === 1 ? "赢骰" : newVal === 0 ? "输骰" : "";
      if (oldText !== newText) changed.push(`${label}: ${oldText} → ${newText}`);
    } else if (key === "matchResult") {
      const oldText = oldVal === 1 ? "胜" : oldVal === 0 ? "负" : oldVal === 4 ? "平" : "";
      const newText = newVal === 1 ? "胜" : newVal === 0 ? "负" : newVal === 4 ? "平" : "";
      if (oldText !== newText) changed.push(`${label}: ${oldText} → ${newText}`);
    } else if (key === "matchTypeId") {
      const oldId = oldVal === null || oldVal === undefined ? "" : String(oldVal);
      const newId = newVal === null || newVal === undefined ? "" : String(newVal);
      if (oldId !== newId) {
        changed.push(
          `${label}: ${matchTypeNames.get(oldId) || oldId || "(空)"} → ${matchTypeNames.get(newId) || newId || "(空)"}`
        );
      }
    } else {
      const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
      const newStr = newVal === null || newVal === undefined ? "" : String(newVal);
      if (oldStr !== newStr) changed.push(`${label}: ${oldStr || "(空)"} → ${newStr || "(空)"}`);
    }
  }
  return changed.length ? changed : ["无字段变更"];
}

async function handleRecordEditLogs(params, context) {
  const id = normalizeId(params.id, "对局记录ID");
  let existing;
  try {
    const result = await db.collection(COLLECTIONS.records).doc(id).get();
    existing = result.data;
  } catch (error) {
    existing = null;
  }
  if (!existing || existing.ownerOpenId !== context.openid) {
    throw new ApiError(
      ERROR_CODES.recordNotFound,
      "对局记录不存在",
      `未找到对局记录: ${id}`
    );
  }
  const logs = await fetchAllByQuery(
    COLLECTIONS.editLogs,
    { recordId: id },
    { orderByField: "createdAt", orderDirection: "desc" }
  );
  return success(
    logs.map((log) => ({
      changedFields: log.changedFields || [],
      sequence: log.sequence || 0,
      createdAt: formatDateTime(log.createdAt),
    }))
  );
}

async function handleRecordRemove(params, context) {
  const id = normalizeId(params.id, "对局记录ID");
  let existing;
  try {
    const result = await db.collection(COLLECTIONS.records).doc(id).get();
    existing = result.data;
  } catch (error) {
    existing = null;
  }

  if (!existing || existing.ownerOpenId !== context.openid) {
    throw new ApiError(
      ERROR_CODES.recordNotFound,
      "对局记录不存在",
      `未找到对局记录: ${id}`
    );
  }

  await db.collection(COLLECTIONS.records).doc(id).remove();

  // Clean up edit logs
  try {
    const editLogs = await fetchAllByQuery(COLLECTIONS.editLogs, { recordId: id });
    for (const log of editLogs) {
      try {
        await db.collection(COLLECTIONS.editLogs).doc(log._id).remove();
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  return success(null);
}

function buildDeckStats(records, deckMap, selectedDecks) {
  const grouped = new Map();

  (selectedDecks || []).forEach((deck) => {
    grouped.set(deck._id, {
      deckId: deck._id,
      deckName: deck.deckName,
      records: [],
    });
  });

  records.forEach((record) => {
    const deckId = record.deckId || "__deleted__";
    if (!grouped.has(deckId)) {
      grouped.set(deckId, {
        deckId: record.deckId || null,
        deckName: record.deckId ? (deckMap.get(record.deckId) || "已删除卡组") : "已删除卡组",
        records: [],
      });
    }
    grouped.get(deckId).records.push(record);
  });

  return Array.from(grouped.values())
    .map((item) => {
      const stats = buildStats(item.records);
      return {
        deckId: item.deckId,
        deckName: item.deckName,
        ...stats,
      };
    })
    .sort((left, right) => {
      if (right.totalGames !== left.totalGames) {
        return right.totalGames - left.totalGames;
      }
      return String(left.deckName).localeCompare(String(right.deckName), "zh-CN");
    });
}

async function handleRecordStatistics(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const dayOfWeek = normalizeStringArray(params.dayOfWeek, "星期筛选");
  const deckId = normalizeIdArray(params.deckId, "卡组筛选");
  const matchType = params.matchType ? normalizeId(params.matchType, "对局类型") : "";
  const coinResult =
    params.coinResult === "" || params.coinResult === null || params.coinResult === undefined
      ? undefined
      : normalizeCoinResultFlag(params.coinResult, "硬币结果");
  const matchResult =
    params.matchResult === "" || params.matchResult === null || params.matchResult === undefined
      ? undefined
      : normalizeMatchResultFlag(params.matchResult, "胜负结果");

  const allRecords = await fetchAllRecords(context.openid, {
    matchFormat,
    matchMonth: params.matchMonth,
    dayOfWeek,
    deckId,
    matchType,
    coinResult,
    matchResult,
  });
  const { records, deckMap } = await filterRecordsWithExistingDecks(
    context.openid,
    allRecords,
    matchFormat
  );

  const overall = buildStats(records);
  const distinctDeckKeys = new Set(records.map((item) => item.deckId));
  overall.deckCount = distinctDeckKeys.size;

  const selectedDecks = deckId.length
    ? (
        await Promise.all(
          deckId.map((id) => getDeckById(context.openid, id, matchFormat))
        )
      ).filter(Boolean)
    : [];
  const byDeck = buildDeckStats(records, deckMap, selectedDecks);

  return success({
    overall,
    byDeck,
  });
}

async function handleDeckList(params, context) {
  const matchMonth = params.matchMonth || "all";
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const allDecks = await fetchAllByQuery(
    COLLECTIONS.decks,
    {
      ownerOpenId: context.openid,
    },
    {
      orderByField: "createdAt",
      orderDirection: "asc",
    }
  );
  const decks = (allDecks || []).filter((item) =>
    isMatchFormatMatched(item.matchFormat, matchFormat)
  );

  const normalizedMonth =
    matchMonth && matchMonth !== "all" ? normalizeMonth(matchMonth) : "all";
  const records = await fetchAllRecords(context.openid, {
    matchFormat,
    matchMonth: normalizedMonth,
  });
  const countMap = new Map();

  records.forEach((record) => {
    const deckId = record.deckId;
    if (!deckId) {
      return;
    }
    countMap.set(deckId, (countMap.get(deckId) || 0) + 1);
  });

  const body = decks
    .map((deck) => ({
      id: deck._id,
      deckName: deck.deckName,
      totalGames: countMap.get(deck._id) || 0,
    }))
    .sort((left, right) => {
      if (right.totalGames !== left.totalGames) {
        return right.totalGames - left.totalGames;
      }
      return left.deckName.localeCompare(right.deckName, "zh-CN");
    });

  return success(body);
}

async function handleDeckSave(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const deckName = normalizeDeckName(params.deckName);
  const existing = await findDeckByName({
    ownerOpenId: context.openid,
    deckName,
    matchFormat,
  });
  if (existing) {
    throw new ApiError(
      ERROR_CODES.deckNameExists,
      "卡组名称已存在",
      `卡组名称'${deckName}'已存在，请使用其他名称`
    );
  }

  const now = new Date();
  const result = await db.collection(COLLECTIONS.decks).add({
    data: {
      ownerOpenId: context.openid,
      appid: context.appid,
      unionid: context.unionid,
      matchFormat,
      deckName,
      deckNameLower: toLowerSafe(deckName),
      createdAt: now,
      updatedAt: now,
    },
  });

  return success({
    id: result._id,
    deckName,
    createTime: formatDateTime(now),
  });
}

async function handleDeckUpdate(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const id = normalizeId(params.id, "卡组ID");
  const deckName = normalizeDeckName(params.deckName);
  const existingDeck = await getDeckById(context.openid, id, matchFormat);
  if (!existingDeck) {
    throw new ApiError(
      ERROR_CODES.deckNotFound,
      "卡组不存在",
      `未找到卡组: ${id}`
    );
  }

  const duplicateDeck = await findDeckByName({
    ownerOpenId: context.openid,
    deckName,
    matchFormat,
  });
  if (duplicateDeck && duplicateDeck._id !== id) {
    throw new ApiError(
      ERROR_CODES.deckNameExists,
      "卡组名称已存在",
      `卡组名称'${deckName}'已存在，请使用其他名称`
    );
  }

  await db.collection(COLLECTIONS.decks).doc(id).update({
    data: {
      deckName,
      deckNameLower: toLowerSafe(deckName),
      updatedAt: new Date(),
    },
  });

  return success(null);
}

async function handleDeckRemove(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const id = normalizeId(params.id, "卡组ID");
  const deck = await getDeckById(context.openid, id, matchFormat);
  if (!deck) {
    throw new ApiError(
      ERROR_CODES.deckNotFound,
      "卡组不存在",
      `未找到卡组: ${id}`
    );
  }

  const affectedRecords = await removeRecordsByQuery({
    ownerOpenId: context.openid,
    deckId: id,
  });
  const affectedDeckCards = await removeDeckCardsByQuery({
    ownerOpenId: context.openid,
    deckId: id,
  });

  await db.collection(COLLECTIONS.decks).doc(id).remove();
  return success({
    affectedRecords,
    affectedDeckCards,
  });
}

async function handleCardSearch(params) {
  const keyword = normalizeCardSearchKeyword(params.keyword || params.search);
  const pageNumRaw = normalizeOptionalInteger(params.pageNum, "pageNum");
  const pageSizeRaw = normalizeOptionalInteger(params.pageSize || params.limit, "pageSize");
  const pageNum = pageNumRaw === undefined ? 1 : Math.max(pageNumRaw, 1);
  const pageSize = pageSizeRaw === undefined ? 20 : Math.min(Math.max(pageSizeRaw, 1), 50);
  const skip = (pageNum - 1) * pageSize;
  const regexp = db.RegExp({
    regexp: escapeRegExp(keyword),
    options: "i",
  });
  const result = await db
    .collection(COLLECTIONS.cards)
    .where({
      isActive: true,
      searchText: regexp,
    })
    .orderBy("cardId", "asc")
    .skip(skip)
    .limit(pageSize + 1)
    .get();
  const cards = result.data || [];
  const hasMore = cards.length > pageSize;
  const finalCards = cards.slice(0, pageSize);
  const imageMap = await fetchCardImageMap(finalCards.map((item) => item.cardId));

  return success({
    list: finalCards.map((item) =>
      stripCardDesc(toCardResponse(item, imageMap.get(String(item.cardId))))
    ),
    pageNum,
    pageSize,
    hasMore,
  });
}

async function handleCardGet(params) {
  const cardId = normalizeCardId(params.cardId || params.id, "卡片ID");
  const result = await db
    .collection(COLLECTIONS.cards)
    .where({
      cardId,
      isActive: true,
    })
    .limit(1)
    .get();
  const card = result.data[0] || null;
  if (!card) {
    throw new ApiError(
      ERROR_CODES.cardNotFound,
      "卡片不存在",
      `未找到卡片: ${cardId}`
    );
  }

  const imageMap = await fetchCardImageMap([cardId]);
  return success(toCardResponse(card, imageMap.get(cardId)));
}

async function handleCardImageCache(params) {
  const cardId = normalizeCardId(params.cardId || params.id, "卡片ID");
  const result = await db
    .collection(COLLECTIONS.cards)
    .where({
      cardId,
      isActive: true,
    })
    .limit(1)
    .get();
  const card = result.data[0] || null;
  if (!card) {
    throw new ApiError(
      ERROR_CODES.cardNotFound,
      "卡片不存在",
      `未找到卡片: ${cardId}`
    );
  }

  let imageRecord = (await fetchCardImageMap([cardId])).get(cardId);
  if (!imageRecord || !imageRecord.cloudFileId) {
    imageRecord = await cacheCardThumbImage(card);
  } else {
    await upsertCardImageRecord(cardId, {
      remoteUrl: imageRecord.remoteUrl || card.thumbUrl || buildCardThumbUrl(cardId),
      cloudFileId: imageRecord.cloudFileId,
      status: imageRecord.status || "ready",
      downloadedAt: imageRecord.downloadedAt || new Date(),
      lastAccessedAt: new Date(),
    });
  }

  return success({
    cardId,
    remoteUrl: card.thumbUrl || buildCardThumbUrl(cardId),
    cloudFileId: imageRecord.cloudFileId || "",
  });
}

function normalizeDeckCardPayloadItem(item, fallbackDeckId) {
  const deckId = normalizeId(item.deckId || fallbackDeckId, "卡组ID");
  const cardId = normalizeCardId(item.cardId, "卡片ID");
  const section = normalizeCardSection(item.section);
  const count = normalizeOptionalInteger(item.count, "卡片数量");
  if (count === undefined || count < 1 || count > 3) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "卡片数量必须在 1-3 之间"
    );
  }

  return {
    deckId,
    cardId,
    section,
    count,
  };
}

async function handleDeckCardsSave(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const deckId = normalizeId(params.deckId, "卡组ID");
  const deck = await getDeckById(context.openid, deckId, matchFormat);
  if (!deck) {
    throw new ApiError(
      ERROR_CODES.deckNotFound,
      "卡组不存在",
      `未找到卡组: ${deckId}`
    );
  }

  const cards = Array.isArray(params.cards) ? params.cards : [];
  const normalizedCards = cards.map((item) =>
    normalizeDeckCardPayloadItem(item, deckId)
  );
  const uniqueKeys = new Set();
  normalizedCards.forEach((item) => {
    const key = `${item.section}:${item.cardId}`;
    if (uniqueKeys.has(key)) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `卡片重复提交: ${item.cardId}`
      );
    }
    uniqueKeys.add(key);
  });

  const cardMap = await fetchCardMap(normalizedCards.map((item) => item.cardId));
  normalizedCards.forEach((item) => {
    if (!cardMap.has(item.cardId)) {
      throw new ApiError(
        ERROR_CODES.cardNotFound,
        "卡片不存在",
        `未找到卡片: ${item.cardId}`
      );
    }
  });
  if (matchFormat === MATCH_FORMATS.md && normalizedCards.some((item) => item.section === "side")) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "MD 模式不支持副卡组"
    );
  }
  validateDeckCardSectionRules(normalizedCards, cardMap);

  await removeDeckCardsByQuery({
    ownerOpenId: context.openid,
    deckId,
  });

  const now = new Date();
  for (const item of normalizedCards) {
    await db.collection(COLLECTIONS.deckCards).add({
      data: {
        ownerOpenId: context.openid,
        deckId,
        cardId: item.cardId,
        section: item.section,
        count: item.count,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return success({
    deckId,
    totalCards: normalizedCards.length,
  });
}

async function handleDeckCardsGet(params, context) {
  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const deckId = normalizeId(params.deckId, "卡组ID");
  const deck = await getDeckById(context.openid, deckId, matchFormat);
  if (!deck) {
    throw new ApiError(
      ERROR_CODES.deckNotFound,
      "卡组不存在",
      `未找到卡组: ${deckId}`
    );
  }

  const deckCards = await fetchAllByQuery(
    COLLECTIONS.deckCards,
    {
      ownerOpenId: context.openid,
      deckId,
    },
    {
      orderByField: "createdAt",
      orderDirection: "asc",
    }
  );
  const cardMap = await fetchCardMap(deckCards.map((item) => item.cardId));
  const imageMap = await fetchCardImageMap(deckCards.map((item) => item.cardId));
  const grouped = {
    main: [],
    extra: [],
    side: [],
  };

  deckCards.forEach((item) => {
    const card = cardMap.get(String(item.cardId));
    if (!card) {
      return;
    }
    grouped[item.section] = grouped[item.section] || [];
    grouped[item.section].push({
      cardId: item.cardId,
      count: item.count,
      section: item.section,
      card: toCardResponse(card, imageMap.get(String(item.cardId))),
    });
  });

  return success({
    deckId,
    deckName: deck.deckName,
    sections: grouped,
  });
}

async function handleSyncCardsCheck() {
  const context = getUserContext();
  assertAdminUser(context.openid);
  const state = await fetchSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY);
  const now = new Date();
  let remoteMd5 = "";
  let checkFailed = false;
  let checkError = "";

  try {
    remoteMd5 = await fetchYgoCdbCardsMd5({
      timeoutMs: 1500,
    });
  } catch (error) {
    checkFailed = true;
    checkError = isTimeoutLikeError(error)
      ? "远端 MD5 检查超时，请将云函数超时时间调大到 10 秒以上后重试"
      : String(error && (error.detail || error.message || error.errMsg || error) || "远端 MD5 检查失败");
  }

  const changed = !checkFailed && (!state || state.cardsMd5 !== remoteMd5);

  return success({
    changed,
    localCardsMd5: state ? state.cardsMd5 || "" : "",
    remoteCardsMd5: remoteMd5 || (state ? state.remoteCardsMd5 || "" : ""),
    lastCheckedAt: formatDateTime(now),
    lastSyncedAt: state ? formatDateTime(state.lastSyncedAt) : "",
    lastInactiveCheckAt: state ? formatDateTime(state.lastInactiveCheckAt) : "",
    totalCards: state ? state.totalCards || 0 : 0,
    inactiveCheckPending: Boolean(state && state.inactiveCheckPending),
    checkFailed,
    checkError,
  });
}

async function handleSyncCardsByMode(mode) {
  const context = getUserContext();
  assertAdminUser(context.openid);
  let state = await fetchSyncState(CARD_SYNC_SOURCE, CARD_SYNC_STATE_KEY);
  if (!hasActiveCardSyncJob(state)) {
    state = await initializeCardSyncJob(state, mode);
    return success(
      buildCardSyncProgress(state, {
        stage: "prepared",
        mode,
        progressText:
          mode === CARD_SYNC_MODES.fast
            ? "快速同步任务已创建，开始分片写入卡库"
            : "同步任务已创建，开始分片写入卡库",
      })
    );
  }
  return success(await runCardSyncStep(state));
}

async function handleSyncCardsFast() {
  return handleSyncCardsByMode(CARD_SYNC_MODES.fast);
}

async function handleSyncCardsFull() {
  return handleSyncCardsByMode(CARD_SYNC_MODES.full);
}

async function handleAdminStatus(params, context) {
  return success({
    isAdmin: isAdminUser(context.openid),
  });
}

async function handleAdminOverallStats(params, context) {
  assertAdminUser(context.openid);

  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const matchMonth =
    params.matchMonth && params.matchMonth !== "all"
      ? normalizeMonth(params.matchMonth)
      : "all";
  const matchTypeNames = normalizeMatchTypeNameList(params.matchTypeNames);
  const matchTypeNameSet = matchTypeNames.length ? new Set(matchTypeNames) : null;
  const recordQuery = {};
  if (matchMonth !== "all") {
    recordQuery.matchMonth = matchMonth;
  }

  const allRecords = await fetchAllByQuery(
    COLLECTIONS.records,
    recordQuery,
    {
      orderByField: "createdAt",
      orderDirection: "desc",
    }
  );
  let records = (allRecords || []).filter(
    (item) =>
      isMatchFormatMatched(item.matchFormat, matchFormat) && !isBlank(item.deckId)
  );
  if (matchTypeNameSet) {
    const matchTypeNameMap = await fetchGlobalMatchTypeNameMap(
      records.map((item) => item.matchTypeId),
      matchFormat
    );
    records = records.filter((item) => {
      const info = matchTypeNameMap.get(String(item.matchTypeId || ""));
      return info && matchTypeNameSet.has(info.nameKey);
    });
  }
  const deckMap = await fetchGlobalDeckMap(
    records.map((item) => item.deckId),
    matchFormat
  );
  const grouped = new Map();

  records.forEach((item) => {
    const deckName = String(deckMap.get(item.deckId) || "").trim();
    if (!deckName) {
      return;
    }
    const key = toLowerSafe(deckName);
    if (!grouped.has(key)) {
      grouped.set(key, {
        deckName,
        matchCount: 0,
      });
    }
    grouped.get(key).matchCount += 1;
  });

  const items = Array.from(grouped.values())
    .sort((left, right) => {
      if (Number(right.matchCount || 0) !== Number(left.matchCount || 0)) {
        return Number(right.matchCount || 0) - Number(left.matchCount || 0);
      }
      return String(left.deckName || "").localeCompare(String(right.deckName || ""), "zh-CN");
    });
  const totalGames = items.reduce(
    (sum, item) => sum + Number(item.matchCount || 0),
    0
  );

  return success({
    matchFormat,
    matchMonth,
    matchTypeNames,
    totalGames,
    deckCount: items.length,
    items: items.map((item) => ({
      deckName: item.deckName,
      matchCount: item.matchCount,
      shareRate: formatRate(item.matchCount, totalGames),
    })),
  });
}

async function handleAdminMatchTypeList(params, context) {
  assertAdminUser(context.openid);

  const matchFormat = normalizeMatchFormat(params.matchFormat);
  const allItems = await fetchAllByQuery(
    COLLECTIONS.dictItems,
    {
      dictCode: DICT_CODES.matchType,
    },
    {
      orderByField: "sortOrder",
      orderDirection: "asc",
    }
  );
  const grouped = new Map();
  (allItems || [])
    .filter((item) => isMatchFormatMatched(item.matchFormat, matchFormat))
    .forEach((item) => {
      const nameKey = toLowerSafe(item.itemValue);
      if (!nameKey) {
        return;
      }
      if (!grouped.has(nameKey)) {
        grouped.set(nameKey, {
          key: nameKey,
          itemValue: item.itemValue,
          itemLabel: item.itemLabel || item.itemValue,
          sortOrder: Number(item.sortOrder || 0),
        });
      }
    });

  const body = Array.from(grouped.values())
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }
      return String(left.itemValue).localeCompare(String(right.itemValue), "zh-CN");
    })
    .map((item) => ({
      id: item.key,
      itemValue: item.itemValue,
      itemLabel: item.itemLabel,
    }));

  return success(body);
}

async function handleDictList(params, context) {
  const dictCode = validateDictCode(params.dictCode);
  const matchFormat = dictCode === DICT_CODES.matchType
    ? normalizeMatchFormat(params.matchFormat)
    : MATCH_FORMATS.md;

  let result = [];
  if (
    dictCode === DICT_CODES.matchType ||
    dictCode === DICT_CODES.matchMonth ||
    dictCode === DICT_CODES.mdAccount
  ) {
    const memberships = await fetchUserMemberships(
      context.openid,
      dictCode,
      dictCode === DICT_CODES.matchType ? matchFormat : null
    );
    const sharedMap = await fetchSharedDictItemsByIds(
      memberships.map((item) => item.dictItemId)
    );
    result = memberships
      .map((membership) => {
        const shared = sharedMap.get(membership.dictItemId);
        if (!shared) {
          return null;
        }
        return {
          _id: shared._id,
          dictCode: shared.dictCode,
          itemValue: shared.itemValue,
          itemLabel: shared.itemLabel,
          sortOrder: Number.isInteger(membership.sortOrder)
            ? membership.sortOrder
            : shared.sortOrder || 0,
        };
      })
      .filter(Boolean);
  } else {
    const ownerOpenId = getDictionaryOwner(dictCode, context.openid);
    result = await fetchAllByQuery(
      COLLECTIONS.dictItems,
      {
        ownerOpenId,
        dictCode,
      },
      {
        orderByField: "sortOrder",
        orderDirection: "asc",
      }
    );
  }

  if (dictCode === DICT_CODES.matchMonth && params.includeRecordMonths) {
    const records = await fetchAllRecords(context.openid, {
      matchMonth: "all",
    });
    const existingMonths = new Set(result.map((item) => item.itemValue));
    const monthsFromRecords = Array.from(
      new Set(records.map((item) => item.matchMonth).filter(Boolean))
    );

    monthsFromRecords.forEach((monthValue) => {
      if (!existingMonths.has(monthValue)) {
        result.push({
          _id: `virtual:${monthValue}`,
          dictCode,
          itemValue: monthValue,
          itemLabel: formatMonthLabel(monthValue),
          sortOrder: 9999,
        });
      }
    });
  }

  const body = result
    .slice()
    .sort((left, right) => {
      if (dictCode === DICT_CODES.matchMonth) {
        return compareMonthValueDesc(left.itemValue, right.itemValue);
      }
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }
      return String(left.itemValue).localeCompare(String(right.itemValue), "zh-CN");
    })
    .map((item) => ({
      id: item._id,
      dictCode: item.dictCode,
      itemValue: item.itemValue,
      itemLabel: item.itemLabel,
      sortOrder: item.sortOrder || 0,
    }));

  return success(body);
}

async function ensureDictValueNotDuplicate(openid, dictCode, itemValue, ignoreDictItemId, matchFormat) {
  const memberships = await fetchUserMemberships(
    openid,
    dictCode,
    dictCode === DICT_CODES.matchType ? (matchFormat || MATCH_FORMATS.md) : null
  );

  const target = buildSharedDictNameKey(dictCode, itemValue);
  const duplicate = memberships.find((item) => {
    if (ignoreDictItemId && item.dictItemId === ignoreDictItemId) {
      return false;
    }
    const current =
      item.nameKey || buildSharedDictNameKey(dictCode, item.itemValue);
    return current === target;
  });

  if (duplicate) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `字典项值已存在: ${itemValue}`
    );
  }
}

async function handleDictItemSave(params, context) {
  const dictCode = validateDictCode(params.dictCode);
  if (dictCode === DICT_CODES.dayOfWeek) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "星期字典为系统内置数据，不支持新增"
    );
  }

  const matchFormat = dictCode === DICT_CODES.matchType
    ? normalizeMatchFormat(params.matchFormat)
    : null;
  const normalized = normalizeDictValue(dictCode, params.itemValue, params.itemLabel);
  const sortOrder = normalizeOptionalInteger(params.sortOrder, "排序号") || 0;

  await ensureDictValueNotDuplicate(
    context.openid,
    dictCode,
    normalized.itemValue,
    null,
    matchFormat
  );

  const sharedItem = await findOrCreateSharedDictItem({
    dictCode,
    matchFormat,
    itemValue: normalized.itemValue,
    itemLabel: normalized.itemLabel,
  });
  await ensureMembership({
    openid: context.openid,
    dictItem: sharedItem,
    sortOrder,
  });

  return success(null);
}

async function handleDictItemUpdate(params, context) {
  const id = normalizeId(params.id, "字典项ID");
  let existing;
  try {
    const result = await db.collection(COLLECTIONS.dictItems).doc(id).get();
    existing = result.data;
  } catch (error) {
    existing = null;
  }

  if (!existing) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `未找到字典项: ${id}`
    );
  }

  const dictCode = validateDictCode(existing.dictCode);
  const membershipId = buildMembershipId(context.openid, id);
  let membership = null;
  try {
    const membershipResult = await db
      .collection(COLLECTIONS.dictMemberships)
      .doc(membershipId)
      .get();
    membership = membershipResult.data;
  } catch (error) {
    membership = null;
  }
  if (
    dictCode === DICT_CODES.dayOfWeek ||
    existing.ownerOpenId !== SHARED_SCOPE ||
    !membership
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "该字典项不允许修改"
    );
  }

  const matchFormat = dictCode === DICT_CODES.matchType
    ? normalizeMatchFormat(params.matchFormat)
    : null;
  if (
    dictCode === DICT_CODES.matchType &&
    !isMatchFormatMatched(existing.matchFormat, matchFormat)
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "该对战类型不属于当前赛制"
    );
  }

  const normalized = normalizeDictValue(dictCode, params.itemValue, params.itemLabel);
  const sortOrder = normalizeOptionalInteger(params.sortOrder, "排序号");

  const oldNameKey = existing.nameKey || buildSharedDictNameKey(dictCode, existing.itemValue);
  const newNameKey = buildSharedDictNameKey(dictCode, normalized.itemValue);

  // 同名（nameKey 相同）视为仅调排序，不改动共用文档本身
  if (oldNameKey === newNameKey) {
    if (sortOrder !== undefined && sortOrder !== (membership.sortOrder || 0)) {
      await db.collection(COLLECTIONS.dictMemberships).doc(membershipId).update({
        data: { sortOrder, updatedAt: new Date() },
      });
    }
    return success(null);
  }

  await ensureDictValueNotDuplicate(
    context.openid,
    dictCode,
    normalized.itemValue,
    id,
    matchFormat
  );

  // 重命名＝重指向到另一条共用文档（不改动共用文档，避免影响他人）
  const newSharedItem = await findOrCreateSharedDictItem({
    dictCode,
    matchFormat,
    itemValue: normalized.itemValue,
    itemLabel: normalized.itemLabel,
  });
  await ensureMembership({
    openid: context.openid,
    dictItem: newSharedItem,
    sortOrder: sortOrder === undefined ? (membership.sortOrder || 0) : sortOrder,
    isDefault: membership.isDefault,
  });

  // 将本用户 records 的引用由旧共用 id 重映射为新共用 id
  const recordField =
    dictCode === DICT_CODES.matchMonth
      ? "matchMonthId"
      : dictCode === DICT_CODES.mdAccount
        ? "mdAccountId"
        : "matchTypeId";
  const records = await fetchAllByQuery(COLLECTIONS.records, {
    ownerOpenId: context.openid,
    [recordField]: id,
  });
  for (const record of records) {
    const updateData = {
      [recordField]: newSharedItem._id,
      updatedAt: new Date(),
    };
    if (dictCode === DICT_CODES.matchMonth) {
      updateData.matchMonth = newSharedItem.itemValue;
    }
    await db.collection(COLLECTIONS.records).doc(record._id).update({ data: updateData });
  }

  // 删除旧成员关系，引用计数归零则真删旧共用文档
  await removeMembershipAndMaybeOrphan(context.openid, id);

  return success(null);
}

async function handleDictItemRemove(params, context) {
  const requestedMatchFormat = params.matchFormat ? normalizeMatchFormat(params.matchFormat) : null;
  const id = normalizeId(params.id, "字典项ID");
  let existing;
  try {
    const result = await db.collection(COLLECTIONS.dictItems).doc(id).get();
    existing = result.data;
  } catch (error) {
    existing = null;
  }

  if (!existing) {
    return success(null);
  }

  const dictCode = validateDictCode(existing.dictCode);
  const membershipId = buildMembershipId(context.openid, id);
  let membership = null;
  try {
    const membershipResult = await db
      .collection(COLLECTIONS.dictMemberships)
      .doc(membershipId)
      .get();
    membership = membershipResult.data;
  } catch (error) {
    membership = null;
  }

  if (
    dictCode === DICT_CODES.dayOfWeek ||
    existing.ownerOpenId !== SHARED_SCOPE ||
    !membership
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "该字典项不允许删除"
    );
  }

  if (
    dictCode === DICT_CODES.matchType &&
    !isMatchFormatMatched(existing.matchFormat, requestedMatchFormat || MATCH_FORMATS.md)
  ) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "该对战类型不属于当前赛制"
    );
  }

  let affectedRecords = 0;
  if (dictCode === DICT_CODES.matchMonth) {
    affectedRecords = await removeRecordsByQuery({
      ownerOpenId: context.openid,
      matchMonthId: id,
    });
  } else if (dictCode === DICT_CODES.matchType) {
    affectedRecords = await removeRecordsByQuery({
      ownerOpenId: context.openid,
      matchTypeId: id,
    });
  } else if (dictCode === DICT_CODES.mdAccount) {
    const recordAction = String(params.recordAction || "clear");
    if (recordAction === "delete") {
      // 连同该账号下的战绩一并删除
      affectedRecords = await removeRecordsByQuery({
        ownerOpenId: context.openid,
        mdAccountId: id,
      });
    } else if (recordAction === "merge") {
      // 保留战绩并入目标账号
      const targetAccountId = normalizeId(params.targetAccountId, "并入账号");
      if (targetAccountId === id) {
        throw new ApiError(
          ERROR_CODES.validationFailed,
          "参数校验失败",
          "并入账号不能是被删除的账号"
        );
      }
      const targetItem = await getDictItemById(
        context.openid,
        DICT_CODES.mdAccount,
        targetAccountId
      );
      if (!targetItem) {
        throw new ApiError(
          ERROR_CODES.validationFailed,
          "参数校验失败",
          `无效的并入账号: ${targetAccountId}`
        );
      }
      affectedRecords = await transferRecordMdAccountByQuery(
        {
          ownerOpenId: context.openid,
          mdAccountId: id,
        },
        targetAccountId
      );
    } else {
      // 默认：保留战绩，仅清空关联战绩的账号引用
      affectedRecords = await clearRecordMdAccountByQuery({
        ownerOpenId: context.openid,
        mdAccountId: id,
      });
    }
  }

  // 仅删本用户成员关系；引用计数归零时才真删共用文档
  await removeMembershipAndMaybeOrphan(context.openid, id);
  return success({
    affectedRecords,
  });
}

const MIGRATION_SOURCE = "migration";
const MIGRATION_STATE_KEY = "shared_dict";
const MIGRATION_DICT_CODES = [DICT_CODES.matchType, DICT_CODES.matchMonth];

function buildMigrationProgress(state, completed) {
  const phaseTextMap = {
    A: `阶段1/3：合并同名字典，已合并 ${state.dictProcessed || 0} 条`,
    B: `阶段2/3：重映射战绩引用，已扫描 ${state.recordCursor || 0} 条`,
    C: `阶段3/3：清理旧字典，已删除 ${state.dictDeleted || 0} 条`,
    completed: `迁移完成：合并 ${state.dictProcessed || 0} 条字典、重映射 ${state.recordsRemapped || 0} 条战绩、清理 ${state.dictDeleted || 0} 条旧字典`,
  };
  return {
    completed,
    phase: state.phase,
    dictProcessed: state.dictProcessed || 0,
    recordsRemapped: state.recordsRemapped || 0,
    dictDeleted: state.dictDeleted || 0,
    progressText: phaseTextMap[state.phase] || "",
  };
}

async function migratePhaseA(state) {
  const result = await db
    .collection(COLLECTIONS.dictItems)
    .where({
      dictCode: _.in(MIGRATION_DICT_CODES),
      ownerOpenId: _.neq(SHARED_SCOPE),
      migratedTo: _.exists(false),
    })
    .limit(QUERY_BATCH_SIZE)
    .get();
  const batch = result.data || [];
  let processed = state.dictProcessed || 0;
  for (const legacy of batch) {
    const sharedItem = await findOrCreateSharedDictItem({
      dictCode: legacy.dictCode,
      matchFormat: legacy.matchFormat,
      itemValue: legacy.itemValue,
      itemLabel: legacy.itemLabel,
    });
    await ensureMembership({
      openid: legacy.ownerOpenId,
      dictItem: sharedItem,
      sortOrder: Number.isInteger(legacy.sortOrder) ? legacy.sortOrder : 0,
      isDefault: legacy.isDefault,
    });
    await db.collection(COLLECTIONS.dictItems).doc(legacy._id).update({
      data: { migratedTo: sharedItem._id, updatedAt: new Date() },
    });
    processed += 1;
  }
  const done = batch.length < QUERY_BATCH_SIZE;
  return {
    ...state,
    dictProcessed: processed,
    phase: done ? "B" : "A",
    recordCursor: 0,
  };
}

async function migratePhaseB(state) {
  const cursor = state.recordCursor || 0;
  const result = await db
    .collection(COLLECTIONS.records)
    .orderBy("_id", "asc")
    .skip(cursor)
    .limit(QUERY_BATCH_SIZE)
    .get();
  const batch = result.data || [];
  const refIds = [];
  batch.forEach((record) => {
    if (record.matchTypeId) {
      refIds.push(record.matchTypeId);
    }
    if (record.matchMonthId) {
      refIds.push(record.matchMonthId);
    }
  });
  const dictMap = await fetchSharedDictItemsByIds(refIds);
  let remapped = state.recordsRemapped || 0;
  for (const record of batch) {
    const updateData = {};
    const typeDoc = record.matchTypeId ? dictMap.get(record.matchTypeId) : null;
    if (typeDoc && typeDoc.migratedTo) {
      updateData.matchTypeId = typeDoc.migratedTo;
    }
    const monthDoc = record.matchMonthId ? dictMap.get(record.matchMonthId) : null;
    if (monthDoc && monthDoc.migratedTo) {
      updateData.matchMonthId = monthDoc.migratedTo;
    }
    if (Object.keys(updateData).length) {
      updateData.updatedAt = new Date();
      await db.collection(COLLECTIONS.records).doc(record._id).update({ data: updateData });
      remapped += 1;
    }
  }
  const done = batch.length < QUERY_BATCH_SIZE;
  return {
    ...state,
    recordCursor: cursor + batch.length,
    recordsRemapped: remapped,
    phase: done ? "C" : "B",
  };
}

async function migratePhaseC(state) {
  const result = await db
    .collection(COLLECTIONS.dictItems)
    .where({
      dictCode: _.in(MIGRATION_DICT_CODES),
      ownerOpenId: _.neq(SHARED_SCOPE),
      migratedTo: _.exists(true),
    })
    .limit(QUERY_BATCH_SIZE)
    .get();
  const batch = result.data || [];
  let deleted = state.dictDeleted || 0;
  for (const legacy of batch) {
    await db.collection(COLLECTIONS.dictItems).doc(legacy._id).remove();
    deleted += 1;
  }
  const done = batch.length < QUERY_BATCH_SIZE;
  return {
    ...state,
    dictDeleted: deleted,
    phase: done ? "completed" : "C",
  };
}

async function handleMigrateSharedDict(params, context) {
  assertAdminUser(context.openid);
  await ensureCollectionsInitialized();

  let state = await fetchSyncState(MIGRATION_SOURCE, MIGRATION_STATE_KEY);
  if (!state || params.restart) {
    state = {
      phase: "A",
      dictProcessed: 0,
      recordCursor: 0,
      recordsRemapped: 0,
      dictDeleted: 0,
      startedAt: new Date(),
    };
  }

  if (state.phase === "completed") {
    return success(buildMigrationProgress(state, true));
  }

  if (state.phase === "A") {
    state = await migratePhaseA(state);
  } else if (state.phase === "B") {
    state = await migratePhaseB(state);
  } else if (state.phase === "C") {
    state = await migratePhaseC(state);
  } else {
    state.phase = "A";
    state = await migratePhaseA(state);
  }

  const completed = state.phase === "completed";
  if (completed) {
    state.completedAt = new Date();
  }
  await saveSyncState(MIGRATION_SOURCE, MIGRATION_STATE_KEY, state);
  return success(buildMigrationProgress(state, completed));
}

const APP_CONFIG_SOURCE = "app";
const APP_CONFIG_STATE_KEY = "config";
const APP_CONFIG_TEXT_MAX_LENGTH = 200;

function buildAppConfigPayload(state) {
  const source = state && typeof state === "object" ? state : {};
  return {
    donationEnabled: Boolean(source.donationEnabled),
    donationImageUrl: String(source.donationImageUrl || "").trim(),
    donationText: String(source.donationText || "").trim(),
    mpQrcodeUrl: String(source.mpQrcodeUrl || "").trim(),
    mpName: String(source.mpName || "").trim(),
  };
}

function normalizeAppConfigText(value, fieldName) {
  const text = String(value || "").trim();
  if (text.length > APP_CONFIG_TEXT_MAX_LENGTH) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `${fieldName}最多 ${APP_CONFIG_TEXT_MAX_LENGTH} 字`
    );
  }
  return text;
}

async function handleAppConfigGet() {
  const state = await fetchSyncState(APP_CONFIG_SOURCE, APP_CONFIG_STATE_KEY);
  return success(await attachAppConfigImageUrls(buildAppConfigPayload(state)));
}

// 把配置里的云存储 fileID 转成带签名的临时 HTTPS 链接后再下发。
// 云函数有管理端权限不受存储 ACL 限制，避免非创建者用户无法加载图片
async function attachAppConfigImageUrls(config) {
  const fileIds = [config.donationImageUrl, config.mpQrcodeUrl].filter(
    (value) => typeof value === "string" && value.indexOf("cloud://") === 0
  );
  if (!fileIds.length) {
    return config;
  }

  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds });
    const urlMap = new Map(
      (result.fileList || [])
        .filter((item) => item && item.status === 0 && item.tempFileURL)
        .map((item) => [item.fileID, item.tempFileURL])
    );
    return {
      ...config,
      donationImageUrl: urlMap.get(config.donationImageUrl) || config.donationImageUrl,
      mpQrcodeUrl: urlMap.get(config.mpQrcodeUrl) || config.mpQrcodeUrl,
    };
  } catch (error) {
    console.warn(
      "getTempFileURL failed =>",
      (error && (error.errMsg || error.message)) || error
    );
    return config;
  }
}

async function handleAppConfigSave(params, context) {
  assertAdminUser(context.openid);

  const existing = buildAppConfigPayload(
    await fetchSyncState(APP_CONFIG_SOURCE, APP_CONFIG_STATE_KEY)
  );
  const next = { ...existing };

  if (params.donationEnabled !== undefined) {
    next.donationEnabled = Boolean(params.donationEnabled);
  }
  if (params.donationImageUrl !== undefined) {
    next.donationImageUrl = normalizeAppConfigText(params.donationImageUrl, "赞赏码地址");
  }
  if (params.donationText !== undefined) {
    next.donationText = normalizeAppConfigText(params.donationText, "赞赏文案");
  }
  if (params.mpQrcodeUrl !== undefined) {
    next.mpQrcodeUrl = normalizeAppConfigText(params.mpQrcodeUrl, "公众号二维码地址");
  }
  if (params.mpName !== undefined) {
    next.mpName = normalizeAppConfigText(params.mpName, "公众号名称");
  }

  await saveSyncState(APP_CONFIG_SOURCE, APP_CONFIG_STATE_KEY, next);
  return success(await attachAppConfigImageUrls(next));
}

const MESSAGE_MAX_LENGTH = 200;
const MESSAGE_RATE_LIMIT_MAX = 3;
const MESSAGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MESSAGE_REACTIONS = new Set(["like", "dislike", "none"]);
// 本地屏蔽词兑底名单，云端 msgSecCheck 不可用时也能拦截常见违规内容
const MESSAGE_BLOCKED_WORDS = [
  // 广告导流
  "加微信", "加vx", "加v信", "加qq", "加群", "代刷", "刷单", "兼职赚钱",
  "微商代理", "免费领取", "点击链接", "代开发票", "办证", "套现",
  // 赌博
  "赌博", "博彩", "网赌", "六合彩", "时时彩", "百家乐", "下注",
  // 色情
  "色情", "约炮", "一夜情", "援交", "卖淫", "嫖娼",
  // 毒品
  "吸毒", "贩毒", "冰毒", "海洛因", "摇头丸",
  // 辱骂攻击
  "傻逼", "煞笔", "沙比", "操你", "草你", "草泥马", "你妈死", "去死",
  "脑残", "智障", "弱智", "贱人", "婊子", "王八蛋", "狗东西",
  // 违法暴力
  "买枪", "卖枪", "炸药", "杭人",
];

function normalizeMessageContentForCheck(content) {
  return String(content || "")
    .toLowerCase()
    .replace(/[\s*·.\-_,，。!！?？~～#@$%^&+=|\\/、;；:：'"“”‘’()（）\[\]【】]+/g, "");
}

function findBlockedWord(content) {
  const normalized = normalizeMessageContentForCheck(content);
  return (
    MESSAGE_BLOCKED_WORDS.find((word) => normalized.includes(word)) || null
  );
}

function buildMessageBlockedError() {
  return new ApiError(
    ERROR_CODES.messageBlocked,
    "留言包含违规内容",
    "留言包含违规内容，请修改后再发布"
  );
}

async function assertMessageContentAllowed(content, openid) {
  if (findBlockedWord(content)) {
    throw buildMessageBlockedError();
  }

  try {
    const checkResult = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 2,
      version: 2,
      content,
    });
    const suggest =
      checkResult && checkResult.result && checkResult.result.suggest;
    if (suggest && suggest !== "pass") {
      throw buildMessageBlockedError();
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (Number(error && error.errCode) === 87014) {
      throw buildMessageBlockedError();
    }
    // 接口未开通权限或调用失败时降级为仅本地屏蔽词检测
    console.warn(
      "msgSecCheck skipped =>",
      (error && (error.errMsg || error.message)) || error
    );
  }
}

function buildMessageReactPayload(message, myReaction) {
  return {
    id: message._id,
    likeCount: Math.max(0, Number(message.likeCount || 0)),
    dislikeCount: Math.max(0, Number(message.dislikeCount || 0)),
    adminLiked: Number(message.adminLikeCount || 0) > 0,
    myReaction,
  };
}

async function handleMessageList(params, context) {
  const messages = await fetchAllByQuery(COLLECTIONS.messages, {});
  messages.sort((left, right) => toTimeValue(left.createdAt) - toTimeValue(right.createdAt));

  const myReactions = await fetchAllByQuery(COLLECTIONS.messageReactions, {
    ownerOpenId: context.openid,
  });
  const reactionMap = new Map(
    myReactions.map((item) => [item.messageId, item.reaction])
  );
  const isAdmin = isAdminUser(context.openid);

  const data = messages
    .map((item, index) => ({
      id: item._id,
      floorNo: index + 1,
      content: String(item.content || ""),
      createdAt: item.createdAt,
      likeCount: Math.max(0, Number(item.likeCount || 0)),
      dislikeCount: Math.max(0, Number(item.dislikeCount || 0)),
      adminLiked: Number(item.adminLikeCount || 0) > 0,
      myReaction: reactionMap.get(item._id) || "none",
      isMine: item.ownerOpenId === context.openid,
      canRemove: item.ownerOpenId === context.openid || isAdmin,
    }))
    .reverse();

  return success({
    data,
    total: data.length,
  });
}

async function handleMessageSave(params, context) {
  const content = asNonEmptyString(params.content, "留言内容");
  if (content.length > MESSAGE_MAX_LENGTH) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `留言最多 ${MESSAGE_MAX_LENGTH} 字`
    );
  }

  const windowStart = new Date(Date.now() - MESSAGE_RATE_LIMIT_WINDOW_MS);
  const recentResult = await db
    .collection(COLLECTIONS.messages)
    .where({
      ownerOpenId: context.openid,
      createdAt: _.gte(windowStart),
    })
    .count();
  if (Number(recentResult.total || 0) >= MESSAGE_RATE_LIMIT_MAX) {
    throw new ApiError(
      ERROR_CODES.messageRateLimited,
      "留言太频繁",
      "留言太频繁了，休息一会儿再发吧"
    );
  }

  await assertMessageContentAllowed(content, context.openid);

  const now = new Date();
  await db.collection(COLLECTIONS.messages).add({
    data: {
      ownerOpenId: context.openid,
      content,
      likeCount: 0,
      dislikeCount: 0,
      adminLikeCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  });

  return success(null);
}

async function handleMessageReact(params, context) {
  const messageId = asNonEmptyString(params.messageId, "留言ID");
  const reaction = String(params.reaction || "").trim();
  if (!MESSAGE_REACTIONS.has(reaction)) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "无效的留言操作类型"
    );
  }

  const messageResult = await db
    .collection(COLLECTIONS.messages)
    .doc(messageId)
    .get()
    .catch(() => null);
  const message = messageResult && messageResult.data;
  if (!message) {
    throw new ApiError(
      ERROR_CODES.messageNotFound,
      "留言不存在",
      "留言已被删除，刷新后再试试吧"
    );
  }

  const existingResult = await db
    .collection(COLLECTIONS.messageReactions)
    .where({
      messageId,
      ownerOpenId: context.openid,
    })
    .limit(1)
    .get();
  const existing = existingResult.data[0] || null;
  const prevReaction = existing ? String(existing.reaction || "none") : "none";

  if (prevReaction === reaction) {
    return success(buildMessageReactPayload(message, reaction));
  }

  const isAdmin = isAdminUser(context.openid);
  const likeDelta = (reaction === "like" ? 1 : 0) - (prevReaction === "like" ? 1 : 0);
  const dislikeDelta =
    (reaction === "dislike" ? 1 : 0) - (prevReaction === "dislike" ? 1 : 0);
  // 管理员赞计数增减分别使用当前身份与历史快照，避免管理员名单变更后计数错乱
  const adminLikeDelta =
    (reaction === "like" && isAdmin ? 1 : 0) -
    (prevReaction === "like" && Boolean(existing && existing.isAdmin) ? 1 : 0);

  const now = new Date();
  if (reaction === "none") {
    await db.collection(COLLECTIONS.messageReactions).doc(existing._id).remove();
  } else if (existing) {
    await db.collection(COLLECTIONS.messageReactions).doc(existing._id).update({
      data: {
        reaction,
        isAdmin,
        updatedAt: now,
      },
    });
  } else {
    await db.collection(COLLECTIONS.messageReactions).add({
      data: {
        messageId,
        ownerOpenId: context.openid,
        reaction,
        isAdmin,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const updateData = {
    updatedAt: now,
  };
  if (likeDelta) {
    updateData.likeCount = _.inc(likeDelta);
  }
  if (dislikeDelta) {
    updateData.dislikeCount = _.inc(dislikeDelta);
  }
  if (adminLikeDelta) {
    updateData.adminLikeCount = _.inc(adminLikeDelta);
  }
  await db.collection(COLLECTIONS.messages).doc(messageId).update({
    data: updateData,
  });

  return success(
    buildMessageReactPayload(
      {
        ...message,
        likeCount: Number(message.likeCount || 0) + likeDelta,
        dislikeCount: Number(message.dislikeCount || 0) + dislikeDelta,
        adminLikeCount: Number(message.adminLikeCount || 0) + adminLikeDelta,
      },
      reaction
    )
  );
}

async function handleMessageRemove(params, context) {
  const messageId = asNonEmptyString(params.messageId, "留言ID");

  const messageResult = await db
    .collection(COLLECTIONS.messages)
    .doc(messageId)
    .get()
    .catch(() => null);
  const message = messageResult && messageResult.data;
  if (!message) {
    return success(null);
  }

  if (message.ownerOpenId !== context.openid && !isAdminUser(context.openid)) {
    throw new ApiError(
      ERROR_CODES.unauthorized,
      "无权限",
      "只能删除自己的留言"
    );
  }

  await db.collection(COLLECTIONS.messages).doc(messageId).remove();
  const reactions = await fetchAllByQuery(COLLECTIONS.messageReactions, {
    messageId,
  });
  for (const reactionDoc of reactions) {
    await db
      .collection(COLLECTIONS.messageReactions)
      .doc(reactionDoc._id)
      .remove();
  }

  return success(null);
}

// 将无归属的 MD 战绩批量划入指定账号（仅允许迁移无归属数据）
async function handleRecordAssignMdAccount(params, context) {
  const targetAccountId = normalizeId(params.mdAccountId, "MD账号");
  const targetItem = await getDictItemById(
    context.openid,
    DICT_CODES.mdAccount,
    targetAccountId
  );
  if (!targetItem) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      `无效的MD账号: ${targetAccountId}`
    );
  }

  const recordIds = Array.from(
    new Set(
      (Array.isArray(params.recordIds) ? params.recordIds : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  if (!recordIds.length) {
    throw new ApiError(
      ERROR_CODES.validationFailed,
      "参数校验失败",
      "请选择要迁移的战绩"
    );
  }

  let updated = 0;
  for (let index = 0; index < recordIds.length; index += QUERY_BATCH_SIZE) {
    const result = await db
      .collection(COLLECTIONS.records)
      .where({
        ownerOpenId: context.openid,
        _id: _.in(recordIds.slice(index, index + QUERY_BATCH_SIZE)),
      })
      .limit(QUERY_BATCH_SIZE)
      .get();
    for (const record of result.data || []) {
      // 仅允许迁移无归属的 MD 战绩，已有归属的直接跳过
      if (record.mdAccountId) {
        continue;
      }
      if (!isMatchFormatMatched(record.matchFormat, MATCH_FORMATS.md)) {
        continue;
      }
      await db.collection(COLLECTIONS.records).doc(record._id).update({
        data: {
          mdAccountId: targetAccountId,
        },
      });
      updated += 1;
    }
  }

  return success({
    updated,
  });
}

const ROUTES = {
  "/match/record/page": handleRecordPage,
  "/match/record/get": handleRecordGet,
  "/match/record/save": handleRecordSave,
  "/match/record/update": handleRecordUpdate,
  "/match/record/remove": handleRecordRemove,
  "/match/record/assign-md-account": handleRecordAssignMdAccount,
  "/match/record/edit-logs": handleRecordEditLogs,
  "/match/record/statistics": handleRecordStatistics,
  "/deck/list": handleDeckList,
  "/deck/save": handleDeckSave,
  "/deck/update": handleDeckUpdate,
  "/deck/remove": handleDeckRemove,
  "/deck/cards/get": handleDeckCardsGet,
  "/deck/cards/save": handleDeckCardsSave,
  "/dict/list": handleDictList,
  "/dict/item/save": handleDictItemSave,
  "/dict/item/update": handleDictItemUpdate,
  "/dict/item/remove": handleDictItemRemove,
  "/card/search": handleCardSearch,
  "/card/get": handleCardGet,
  "/card/image/cache": handleCardImageCache,
  "/app/config/get": handleAppConfigGet,
  "/app/config/save": handleAppConfigSave,
  "/message/list": handleMessageList,
  "/message/save": handleMessageSave,
  "/message/react": handleMessageReact,
  "/message/remove": handleMessageRemove,
  "/admin/status": handleAdminStatus,
  "/admin/overall-stats": handleAdminOverallStats,
  "/admin/match-types": handleAdminMatchTypeList,
  "/admin/migrate/shared-dict": handleMigrateSharedDict,
  "/sync/cards/check": handleSyncCardsCheck,
  "/sync/cards/fast": handleSyncCardsFast,
  "/sync/cards/full": handleSyncCardsFull,
};

export const main = async (event) => {
  try {
    const path = getRequestPath(event);
    const handler = ROUTES[path];
    if (!handler) {
      throw new ApiError(
        ERROR_CODES.validationFailed,
        "参数校验失败",
        `未定义的接口路径: ${path || "(empty)"}`
      );
    }

    const context = getUserContext();
    const body = getRequestBody(event);
    await ensureInitialized(path, context.openid, body);
    return await handler(body, context);
  } catch (error) {
    if (error instanceof ApiError) {
      return failure(error.code, error.msg, error.detail);
    }

    const detail =
      (error && (error.errMsg || error.message)) || "云函数执行失败";
    return failure(
      ERROR_CODES.validationFailed,
      "操作失败",
      detail
    );
  }
};
