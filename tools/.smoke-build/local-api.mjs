// local-api.js
// 本地 API 分发器:替代原小程序的 wx.cloud.callFunction("ygoApi")。
// - 业务路由(战绩/卡组/字典)委托给自动生成的 local-api.gen.js(云函数业务逻辑原样移植)
// - 卡牌路由(/card/*)改由 card-store 实现(本地卡库/在线直连 + 本地卡图缓存)
// - 云端多用户专属路由(/message/*、/admin/*、/app/config/*)在本地模式拦截,
//   返回兼容的空数据或"不支持"错误,保证前端逻辑不崩
// 响应结构与云函数保持一致:{ code, msg, detail, head, body }

import { main as runGeneratedApi } from "./local-api.gen.mjs";
import { db } from "./local-db.mjs";
import { unlinkFile } from "./file-io.mjs";
import {
  searchCards,
  getCard,
  cacheCardImage,
  getCardDetailImage,
} from "./card-store.mjs";

const CODE_UNSUPPORTED = 700102; // 与云函数 validationFailed 一致,前端按通用错误提示处理
const LITE_REMOVED_RECORD_FIELDS = [
  "opponentDeck",
  "starterCount",
  "handTrapCount",
  "brickCount",
  "ocgStarterCounts",
  "ocgHandTrapCounts",
  "ocgBrickCounts",
  "failureReasons",
  "mdAccountId",
];

function stripLiteRecordFields(body = {}) {
  const next = { ...(body || {}) };
  LITE_REMOVED_RECORD_FIELDS.forEach((key) => delete next[key]);
  return next;
}

const ok = (body = null) => ({
  code: 0,
  msg: "操作成功",
  detail: "",
  head: {},
  body,
});

const fail = (code, msg, detail) => ({
  code,
  msg,
  detail: detail || msg,
  head: {},
  body: null,
});

const unsupported = (name) => async () =>
  fail(CODE_UNSUPPORTED, "本地模式不支持该功能", `本地模式不支持: ${name}`);

const DECK_IMAGES_COLLECTION = "ygo_deck_images";
const MAX_DECK_IMAGES = 3;
const MAX_DECK_IMAGE_BYTES = 7 * 1024 * 1024;

function isManagedDeckImagePath(path) {
  return /[\\/]ygo_deck_image_/.test(String(path || ""));
}

async function removeManagedDeckImageFiles(items) {
  await Promise.all(
    (items || []).map(async (item) => {
      const path = String(item && item.path || "").trim();
      if (!isManagedDeckImagePath(path)) return;
      await unlinkFile(path).catch(() => {});
    })
  );
}

function normalizeDeckImagePayload(item, deckId, matchFormat) {
  const path = String(item && (item.path || item.filePath || item.url) || "").trim();
  const sizeBytes = Number(item && item.sizeBytes);
  if (!path) throw new Error("图片路径不能为空");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_DECK_IMAGE_BYTES) {
    throw new Error("图片大小必须在 1B 至 7MB 之间");
  }
  return {
    deckId: String(deckId || "").trim(),
    matchFormat: String(matchFormat || "md").trim(),
    path,
    name: String(item && item.name || "图片").trim().slice(0, 120),
    sizeBytes: Math.floor(sizeBytes),
    createdAt: new Date(),
  };
}

async function getDeckImages(body = {}) {
  const deckId = String(body.deckId || "").trim();
  if (!deckId) throw new Error("卡组ID不能为空");
  const result = await db.collection(DECK_IMAGES_COLLECTION).where({
    deckId,
    matchFormat: String(body.matchFormat || "md"),
  }).orderBy("createdAt", "asc").get();
  return {
    deckId,
    images: (result.data || []).map((item) => ({
      ...item,
      url: item.url || item.path,
    })),
  };
}

async function saveDeckImages(body = {}) {
  const deckId = String(body.deckId || "").trim();
  const matchFormat = String(body.matchFormat || "md").trim();
  const items = Array.isArray(body.images) ? body.images : [];
  if (!deckId) throw new Error("卡组ID不能为空");
  if (items.length > MAX_DECK_IMAGES) throw new Error("每个卡组最多保存 3 张图片");
  const normalized = items.map((item) => normalizeDeckImagePayload(item, deckId, matchFormat));
  const old = await db.collection(DECK_IMAGES_COLLECTION).where({ deckId, matchFormat }).get();
  for (const item of old.data || []) await db.collection(DECK_IMAGES_COLLECTION).doc(item._id).remove();
  for (const item of normalized) await db.collection(DECK_IMAGES_COLLECTION).add({ data: item });
  const retainedPaths = new Set(normalized.map((item) => item.path));
  await removeManagedDeckImageFiles(
    (old.data || []).filter((item) => !retainedPaths.has(item.path))
  );
  return { deckId, images: normalized.map((item) => ({ ...item, url: item.path })) };
}

async function removeDeckImages(body = {}) {
  const deckId = String(body.deckId || body.id || "").trim();
  const matchFormat = String(body.matchFormat || "md").trim();
  if (!deckId) return 0;
  const result = await db.collection(DECK_IMAGES_COLLECTION).where({ deckId, matchFormat }).get();
  for (const item of result.data || []) {
    await db.collection(DECK_IMAGES_COLLECTION).doc(item._id).remove();
  }
  await removeManagedDeckImageFiles(result.data || []);
  return (result.data || []).length;
}

// 本地模式拦截路由表(其余路径全部走生成的业务模块)
const LOCAL_ROUTES = {
  // 精简版不再保存已移除的可选字段，旧记录读取时也清空这些字段。
  "/match/record/save": async (body) =>
    runGeneratedApi({ path: "/match/record/save", body: stripLiteRecordFields(body) }),
  "/match/record/update": async (body) =>
    runGeneratedApi({ path: "/match/record/update", body: stripLiteRecordFields(body) }),
  "/match/record/page": async (body) => {
    const response = await runGeneratedApi({ path: "/match/record/page", body });
    if (response && response.code === 0 && response.body && Array.isArray(response.body.data)) {
      response.body.data = response.body.data.map(stripLiteRecordFields);
    }
    return response;
  },
  "/match/record/get": async (body) => {
    const response = await runGeneratedApi({ path: "/match/record/get", body });
    if (response && response.code === 0 && response.body) {
      response.body = stripLiteRecordFields(response.body);
    }
    return response;
  },
  // 卡牌:本地卡库/在线直连,由 card-store 实现
  "/card/search": async (body) => ok(await searchCards(body)),
  "/card/get": async (body) => ok(await getCard(body)),
  "/card/image/cache": async (body) => ok(await cacheCardImage(body)),
  "/card/image/detail": async (body) => ok(await getCardDetailImage(body)),
  "/deck/images/get": async (body) => ok(await getDeckImages(body)),
  "/deck/images/save": async (body) => ok(await saveDeckImages(body)),
  "/deck/remove": async (body) => {
    const response = await runGeneratedApi({ path: "/deck/remove", body });
    if (response && response.code === 0) {
      await removeDeckImages(body);
    }
    return response;
  },

  // 云端配置:返回静态默认值(赞赏/公众号功能在本地版全部关闭)
  "/app/config/get": async () =>
    ok({
      donationEnabled: false,
      donationImageUrl: "",
      donationText: "",
      mpQrcodeUrl: "",
      mpName: "",
    }),
  "/app/config/save": unsupported("/app/config/save"),

  // 管理员/留言板:本地单机模式无此概念
  "/admin/status": async () => ok({ isAdmin: false }),
  "/admin/overall-stats": unsupported("/admin/overall-stats"),
  "/admin/match-types": unsupported("/admin/match-types"),
  "/admin/migrate/shared-dict": unsupported("/admin/migrate/shared-dict"),
  "/message/list": async (body) =>
    ok({
      list: [],
      pageNum: Number((body && body.pageNum) || 1),
      pageSize: Number((body && body.pageSize) || 20),
      total: 0,
      hasMore: false,
    }),
  "/message/save": unsupported("/message/save"),
  "/message/react": unsupported("/message/react"),
  "/message/remove": unsupported("/message/remove"),

};

function getPath(event) {
  return (event && (event.path || event.action || event.type)) || "";
}

function getBody(event) {
  if (
    event &&
    event.body &&
    typeof event.body === "object" &&
    !Array.isArray(event.body)
  ) {
    return event.body;
  }
  const body = { ...(event || {}) };
  delete body.path;
  delete body.action;
  delete body.type;
  return body;
}

// 与云函数 exports.main 同签名:event = { path, body } 或平铺参数
async function callLocalApi(event) {
  const path = getPath(event);
  const handler = LOCAL_ROUTES[path];
  if (!handler) {
    return runGeneratedApi(event);
  }
  try {
    return await handler(getBody(event));
  } catch (error) {
    if (error && typeof error.code === "number" && error.msg) {
      return fail(error.code, error.msg, error.detail);
    }
    return fail(
      CODE_UNSUPPORTED,
      "操作失败",
      (error && (error.errMsg || error.message)) || "本地接口执行失败"
    );
  }
}

export { callLocalApi };
