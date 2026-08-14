// backup.js
// JSON 全量备份导入导出:
// - 导出:打包全部本地集合 + 本地设置,写入应用私有目录,尽力复制到系统 Download,再调起系统分享
// - 导入:扫描 Download / 私有目录中的备份文件,校验后按"覆盖"或"合并"模式写回,导入前自动备份当前数据
import {
  exportCollections,
  replaceCollections,
  flushLocalDb,
} from "./local-db.mjs";
import {
  isH5,
  getUserDataPath,
  chooseSaveFile,
  writeTextToContentUri,
  saveTextToPublicDownloads,
  toAbsoluteUrl,
  writeTextFile,
  readTextFile,
  listDir,
  statFile,
  unlinkFile,
  downloadTextFile,
} from "./file-io.mjs";

const BACKUP_APP_TAG = "ygo-app";
const BACKUP_VERSION = 1;
const BACKUP_FILE_PREFIX = "ygo-backup-";
const AUTO_BACKUP_FILE_PREFIX = "ygo-backup-auto-";
const MAX_AUTO_BACKUPS = 3;
const AUTO_BACKUP_TIMEOUT_MS = 3000;

// 随备份迁移的本地设置(与 index.vue / card-store 中的 Storage key 保持一致)
const SETTING_STORAGE_KEYS = [
  "ygo_record_field_visibility:v1",
  "ygo_md_current_account:v1",
  "ygo_opponent_deck_categories:v1",
  "ygo_failure_reason_categories:v1",
  "ygo_pie_colors:v1",
  "ygo_card_store:autoCacheImages",
];

// ---------- 基础工具 ----------

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTimestampForFileName(date) {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

function toDisplayTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

// ---------- 备份负载 ----------

function collectSettings() {
  const settings = {};
  SETTING_STORAGE_KEYS.forEach((key) => {
    const value = uni.getStorageSync(key);
    if (value !== "" && value !== null && value !== undefined) {
      settings[key] = value;
    }
  });
  return settings;
}

function applySettings(settings) {
  if (!settings || typeof settings !== "object") {
    return;
  }
  SETTING_STORAGE_KEYS.forEach((key) => {
    if (settings[key] !== undefined) {
      uni.setStorageSync(key, settings[key]);
    }
  });
}

function createBackupPayload() {
  const collections = exportCollections();
  return {
    app: BACKUP_APP_TAG,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    collections,
    settings: collectSettings(),
  };
}

function summarizePayload(payload) {
  const collections = (payload && payload.collections) || {};
  return {
    records: (collections.ygo_match_records || []).length,
    decks: (collections.ygo_decks || []).length,
    dictItems: (collections.ygo_dict_items || []).length,
    deckCards: (collections.ygo_deck_cards || []).length,
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("备份文件内容无法识别");
  }
  if (payload.app !== BACKUP_APP_TAG) {
    throw new Error("不是本应用的备份文件");
  }
  if (Number(payload.version) > BACKUP_VERSION) {
    throw new Error("备份文件版本过新,请先升级应用");
  }
  if (!payload.collections || typeof payload.collections !== "object") {
    throw new Error("备份文件缺少数据集合");
  }
}

// ---------- 导出 ----------

// App 端尽力复制到系统 Download 目录,失败(权限/系统限制)时静默跳过
// 使用 HTML5+ 根别名 _downloads(Android 映射 /storage/emulated/0/Download),
// 不硬编码绝对路径,适配不同系统/设备
function copyToDownload(srcPath, fileName) {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      plus.io.resolveLocalFileSystemURL(
        srcPath,
        (srcEntry) => {
          plus.io.resolveLocalFileSystemURL(
            "_downloads",
            (dirEntry) => {
              srcEntry.copyTo(
                dirEntry,
                fileName,
                (newEntry) => resolve(newEntry.fullPath || null),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        },
        () => resolve(null)
      );
      return;
    } catch (error) {
      resolve(null);
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    resolve(null);
  });
}

function shareFileBySystem(filePath) {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      // 系统分享要求 file:// 绝对路径,_doc 等相对路径其他应用无法访问
      const sharePath = toAbsoluteUrl(filePath);
      plus.share.sendWithSystem(
        { type: "file", filePath: sharePath },
        () => resolve(true),
        () => resolve(false)
      );
      return;
    } catch (error) {
      resolve(false);
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    resolve(false);
  });
}

async function writeBackupFile(fileName, payload) {
  flushLocalDb();
  const filePath = `${getUserDataPath()}/${fileName}`;
  const text = JSON.stringify(payload);
  await writeTextFile(filePath, text);
  // plus.io 的 FileWriter 在少数 Android 基座会回调成功却未真正写入。
  // 私有目录回退时立刻回读校验,绝不把空文件报告为成功。
  const writtenText = await readTextFile(filePath);
  if (writtenText !== text) {
    throw new Error("备份文件写入校验失败");
  }
  return filePath;
}

// 导出备份:返回 { filePath, downloadPath, fileName, savedToDownload, savedPath, summary }
// savedPath 为文件真实绝对路径(file:// URL),供 UI 展示;不自动调起系统分享。
// H5 端无落地文件,直接触发浏览器下载(Blob),返回 viaBrowser:true
async function exportBackup() {
  const payload = createBackupPayload();
  const fileName = `${BACKUP_FILE_PREFIX}${formatTimestampForFileName(new Date())}.json`;
  if (isH5()) {
    downloadTextFile(fileName, JSON.stringify(payload), "application/json;charset=utf-8");
    return {
      filePath: "",
      downloadPath: "",
      fileName,
      savedPath: "",
      viaBrowser: true,
      summary: summarizePayload(payload),
    };
  }
  // App 端通过系统“另存为”选择器决定保存目录（可选择 Download），
  // 系统授予本次 URI 写权限，无需申请存储权限。
  let selectedUri = null;
  let pickerSupported = true;
  try {
    selectedUri = await chooseSaveFile(fileName, "application/json");
  } catch (pickerError) {
    // 旧基座不支持 CREATE_DOCUMENT 时继续使用 MediaStore 兼容回退。
    pickerSupported = false;
  }
  if (selectedUri) {
    let byteLength;
    try {
      byteLength = await writeTextToContentUri(selectedUri, JSON.stringify(payload));
    } catch (error) {
      throw new Error(`写入用户选择的位置失败：${error.message || error}`);
    }
    if (Number(byteLength) <= 0) {
      throw new Error("备份文件写入后为空");
    }
    return {
      filePath: selectedUri,
      downloadPath: selectedUri,
      fileName,
      savedToDownload: false,
      savedByPicker: true,
      savedPath: selectedUri,
      summary: summarizePayload(payload),
    };
  }
  // 用户取消选择时不继续自动保存到其他目录。
  if (pickerSupported && selectedUri === null) {
    return {
      cancelled: true,
      filePath: "",
      downloadPath: "",
      fileName,
      savedToDownload: false,
      savedByPicker: false,
      savedPath: "",
      summary: summarizePayload(payload),
    };
  }
  // Android 10+ 必须通过 MediaStore 写入真正的公共 Download,而非 _downloads
  // (后者在分区存储下会变成 Android/data 下的应用私有目录)。
  flushLocalDb();
  const text = JSON.stringify(payload);
  let filePath = "";
  let downloadPath = "";
  let savedPath = "";
  let savedToDownload = false;
  try {
    const saved = await saveTextToPublicDownloads(
      fileName,
      text,
      "application/json;charset=utf-8"
    );
    // 非空 JSON 必须写出非零字节,否则当作失败走回退而不是显示假成功。
    if (!saved || Number(saved.sizeBytes) <= 0) {
      throw new Error("备份文件写入后为空");
    }
    filePath = saved.uri;
    downloadPath = saved.uri;
    savedPath = saved.displayPath;
    savedToDownload = true;
  } catch (error) {
    // MediaStore 不可用(旧 Android/异常基座)时才退回应用私有目录。
    filePath = "";
  }
  if (!filePath) {
    filePath = await writeBackupFile(fileName, payload);
    savedPath = toAbsoluteUrl(filePath);
  }
  // 不再自动调起系统分享(云打包无需勾选 Share 模块),保存后由 UI 展示文件路径
  return {
    filePath,
    downloadPath,
    fileName,
    savedToDownload,
    savedPath,
    summary: summarizePayload(payload),
  };
}

// ---------- 备份文件扫描 ----------

function listDirFiles(dirPath) {
  return listDir(dirPath).then(
    (files) => files || [],
    () => []
  );
}

function statFileSafe(filePath) {
  return statFile(filePath).then(
    (stats) => stats || null,
    () => null
  );
}

function listDownloadBackupFiles() {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      plus.io.resolveLocalFileSystemURL(
        "file:///storage/emulated/0/Download",
        (dirEntry) => {
          const reader = dirEntry.createReader();
          reader.readEntries(
            (entries) => {
              const files = (entries || [])
                .filter(
                  (entry) =>
                    entry.isFile &&
                    /^ygo-backup-.*\.json$/i.test(entry.name || "")
                )
                .map((entry) => ({
                  name: entry.name,
                  path: entry.fullPath.startsWith("file://")
                    ? entry.fullPath
                    : `file://${entry.fullPath}`,
                  source: "download",
                }));
              resolve(files);
            },
            () => resolve([])
          );
        },
        () => resolve([])
      );
      return;
    } catch (error) {
      resolve([]);
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    resolve([]);
  });
}

async function listLocalBackupFiles() {
  const dirPath = getUserDataPath();
  const files = await listDirFiles(dirPath);
  return files
    .filter((name) => /^ygo-backup-.*\.json$/i.test(name))
    .map((name) => ({
      name,
      path: `${dirPath}/${name}`,
      source: "local",
    }));
}

// 列出可导入的备份文件(Download 优先,其次应用私有目录),按修改时间倒序
async function listBackupFiles() {
  const [downloadFiles, localFiles] = await Promise.all([
    listDownloadBackupFiles(),
    listLocalBackupFiles(),
  ]);
  const merged = [...downloadFiles, ...localFiles];
  const withStats = await Promise.all(
    merged.map(async (file) => {
      const stats = await statFileSafe(file.path);
      const mtime = (stats && stats.mtime) || 0;
      return {
        ...file,
        size: (stats && stats.size) || 0,
        mtime,
        mtimeLabel: stats
          ? toDisplayTime(
              Number(mtime) < 1e12 ? Number(mtime) * 1000 : Number(mtime)
            )
          : "",
      };
    })
  );
  return withStats.sort((a, b) => Number(b.mtime) - Number(a.mtime));
}

// ---------- 导入 ----------

async function readBackupFile(filePath) {
  const text = await readTextFile(filePath);
  return parseBackupText(text);
}

// 解析备份 JSON 文本并校验,供文件导入与 H5 文本导入共用
function parseBackupText(text) {
  let payload;
  try {
    payload = JSON.parse(String(text || ""));
  } catch (error) {
    throw new Error("备份文件不是有效的 JSON");
  }
  validateBackupPayload(payload);
  return payload;
}

// 读取备份文件元信息供导入前预览
async function readBackupMeta(filePath) {
  const payload = await readBackupFile(filePath);
  return {
    version: payload.version,
    exportedAt: payload.exportedAt || "",
    exportedAtLabel: toDisplayTime(payload.exportedAt),
    summary: summarizePayload(payload),
  };
}

async function cleanupAutoBackups() {
  const files = await listLocalBackupFiles();
  const autoFiles = files
    .filter((file) => file.name.startsWith(AUTO_BACKUP_FILE_PREFIX))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  const excess = autoFiles.slice(MAX_AUTO_BACKUPS);
  await Promise.all(
    excess.map((file) =>
      unlinkFile(file.path).catch(() => null)
    )
  );
}

async function autoBackupBeforeImport() {
  const payload = createBackupPayload();
  const fileName = `${AUTO_BACKUP_FILE_PREFIX}${formatTimestampForFileName(new Date())}.json`;
  const filePath = await writeBackupFile(fileName, payload);
  await cleanupAutoBackups();
  return filePath;
}

// 私有目录在部分 Android 基座可能不回调 FileWriter，自动备份不能因此
// 无限阻塞用户主动导入。超时后让导入继续，已开始的备份任务仍可自行完成。
function autoBackupBeforeImportWithTimeout() {
  return Promise.race([
    autoBackupBeforeImport(),
    new Promise((resolve) => setTimeout(() => resolve(""), AUTO_BACKUP_TIMEOUT_MS)),
  ]);
}

function mergeCollectionDocs(currentDocs, importedDocs) {
  const map = new Map();
  (currentDocs || []).forEach((doc) => {
    if (doc && doc._id !== undefined) {
      map.set(String(doc._id), doc);
    }
  });
  // 同 _id 以导入数据为准,本机独有的文档保留
  (importedDocs || []).forEach((doc) => {
    if (doc && doc._id !== undefined) {
      map.set(String(doc._id), doc);
    }
  });
  return Array.from(map.values());
}

// 导入备份:mode 为 "overwrite"(覆盖)或 "merge"(合并)
// 返回 { autoBackupPath, summary }
async function importBackup(filePath, options = {}) {
  const payload = await readBackupFile(filePath);
  return importPayload(payload, options);
}

// H5 端无文件系统:直接导入已读取的备份文本(来自 <input type=file>)
async function importBackupFromText(text, options = {}) {
  const payload = parseBackupText(text);
  return importPayload(payload, options);
}

async function importPayload(payload, options = {}) {
  const mode = options.mode === "merge" ? "merge" : "overwrite";

  // 导入前自动备份当前数据;H5 等不支持落盘的环境跳过
  let autoBackupPath = "";
  try {
    autoBackupPath = await autoBackupBeforeImportWithTimeout();
  } catch (error) {
    autoBackupPath = "";
  }

  if (mode === "overwrite") {
    replaceCollections(payload.collections);
    applySettings(payload.settings);
  } else {
    const current = exportCollections();
    const merged = {};
    Object.keys(payload.collections).forEach((name) => {
      merged[name] = mergeCollectionDocs(
        current[name],
        payload.collections[name]
      );
    });
    replaceCollections(merged);
    // 合并模式不覆盖本机设置,仅填充本机缺失项
    const settings = payload.settings || {};
    SETTING_STORAGE_KEYS.forEach((key) => {
      const localValue = uni.getStorageSync(key);
      if (
        (localValue === "" || localValue === null || localValue === undefined) &&
        settings[key] !== undefined
      ) {
        uni.setStorageSync(key, settings[key]);
      }
    });
  }
  flushLocalDb();

  return {
    autoBackupPath,
    mode,
    summary: summarizePayload(payload),
  };
}

export {
  BACKUP_VERSION,
  createBackupPayload,
  exportBackup,
  listBackupFiles,
  readBackupMeta,
  importBackup,
  importBackupFromText,
  autoBackupBeforeImport,
  autoBackupBeforeImportWithTimeout,
  copyToDownload,
  shareFileBySystem,
  summarizePayload,
};
