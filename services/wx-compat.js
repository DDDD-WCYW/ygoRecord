// wx-compat.js
// 小程序 → uni-app 兼容层:
// 1. 导出 wx 对象,提供页面逻辑用到的全部 wx.* API 的 uni 实现
// 2. 导出 pageMixin,为选项式页面补充 setData / createSelectorQuery 等 Page 能力
import { createPlatformFsm, toAbsoluteUrl } from "./file-io";

function getUserDataPath() {
  // App 端优先用 uni.env.USER_DATA_PATH,H5 下返回占位值(H5 不落地文件)
  if (typeof uni !== "undefined" && uni.env && uni.env.USER_DATA_PATH) {
    return uni.env.USER_DATA_PATH;
  }
  return "_doc";
}

// ---------- setData 路径解析 ----------
// 支持 "a.b[0].c" 形式的数据路径写入,行为对齐小程序 setData
function parseDataPath(path) {
  const tokens = [];
  const pattern = /([^.\[\]]+)|\[(\d+)\]/g;
  let match;
  while ((match = pattern.exec(path))) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else {
      tokens.push(Number(match[2]));
    }
  }
  return tokens;
}

function applyDataPath(target, path, value) {
  const tokens = parseDataPath(String(path));
  if (!tokens.length) {
    return;
  }
  let node = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const key = tokens[i];
    const nextKey = tokens[i + 1];
    if (node[key] === null || typeof node[key] !== "object") {
      node[key] = typeof nextKey === "number" ? [] : {};
    }
    node = node[key];
  }
  node[tokens[tokens.length - 1]] = value;
}

const pageMixin = {
  created() {
    // 对齐小程序的 this.data.xxx 读取方式,指向同一个响应式数据对象
    this.data = this.$data;
  },
  methods: {
    setData(patch, callback) {
      if (patch && typeof patch === "object") {
        // 写入 $data 而非实例代理,保证 setData 新增的顶层字段也是响应式的
        Object.keys(patch).forEach((path) => {
          applyDataPath(this.$data, path, patch[path]);
        });
      }
      if (typeof callback === "function") {
        this.$nextTick(() => callback());
      }
    },
    createSelectorQuery() {
      return uni.createSelectorQuery().in(this);
    },
  },
};

// ---------- wx API 映射 ----------
function toast(options) {
  const merged = Object.assign({ icon: "none" }, options || {});
  // uni 的 none 图标下 title 长度不受小程序限制,行为兼容
  return uni.showToast(merged);
}

function getWindowInfo() {
  if (typeof uni.getWindowInfo === "function") {
    return uni.getWindowInfo();
  }
  const info = uni.getSystemInfoSync();
  return {
    windowWidth: info.windowWidth,
    windowHeight: info.windowHeight,
    pixelRatio: info.pixelRatio,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    statusBarHeight: info.statusBarHeight,
    safeArea: info.safeArea,
  };
}

function copyFileToDownload(filePath, fileName) {
  // App 端尽力复制到系统 Download 目录,失败(权限/系统限制)时静默跳过
  // 使用 HTML5+ 根别名 _downloads,不硬编码绝对路径
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      const targetName = fileName || String(filePath).split("/").pop();
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (srcEntry) => {
          plus.io.resolveLocalFileSystemURL(
            "_downloads",
            (dirEntry) => {
              srcEntry.copyTo(
                dirEntry,
                targetName,
                (newEntry) => resolve((newEntry && newEntry.fullPath) || null),
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

function shareFileMessage(options) {
  // App 端没有微信文件转发,改为:先尽力落盘到系统 Download,再调起系统分享;都失败时提示文件位置
  const opts = options || {};
  const filePath = opts.filePath || "";
  // #ifdef APP-PLUS
  copyFileToDownload(filePath, opts.fileName).then(() => {
    // 系统分享要求 file:// 绝对路径,相对路径其他应用无法访问
    const sharePath = toAbsoluteUrl(filePath);
    plus.share.sendWithSystem(
      {
        type: "file",
        filePath: sharePath,
      },
      () => {
        if (typeof opts.success === "function") {
          opts.success();
        }
      },
      (err) => {
        if (typeof opts.fail === "function") {
          opts.fail(err);
        }
      }
    );
  });
  return;
  // #endif
  // eslint-disable-next-line no-unreachable
  toast({ title: "文件已保存: " + filePath, duration: 3000 });
  if (typeof opts.success === "function") {
    opts.success();
  }
}

function chooseMedia(options) {
  // 仅图片场景使用,映射到 chooseImage
  const opts = options || {};
  uni.chooseImage({
    count: opts.count || 1,
    success: (res) => {
      if (typeof opts.success === "function") {
        opts.success({
          tempFiles: (res.tempFilePaths || []).map((p, i) => ({
            tempFilePath: p,
            size:
              (res.tempFiles && res.tempFiles[i] && res.tempFiles[i].size) || 0,
          })),
        });
      }
    },
    fail: opts.fail,
    complete: opts.complete,
  });
}

function rejectCloudApi(name) {
  return () => Promise.reject(new Error(`本地模式不支持云开发能力: ${name}`));
}

const wx = {
  env: {
    get USER_DATA_PATH() {
      return getUserDataPath();
    },
  },

  // 云开发桩:本地模式下仅管理员/云端遗留路径会触达,统一拒绝
  cloud: {
    callFunction: rejectCloudApi("callFunction"),
    uploadFile: rejectCloudApi("uploadFile"),
    downloadFile: rejectCloudApi("downloadFile"),
  },

  // 交互反馈
  showToast: toast,
  hideToast: (o) => uni.hideToast(o),
  showLoading: (o) => uni.showLoading(o),
  hideLoading: (o) => uni.hideLoading(o),
  showModal: (o) => uni.showModal(o),
  showActionSheet: (o) => uni.showActionSheet(o),

  // 存储
  getStorageSync: (k) => uni.getStorageSync(k),
  setStorageSync: (k, v) => uni.setStorageSync(k, v),
  removeStorageSync: (k) => uni.removeStorageSync(k),
  getStorageInfoSync: () => uni.getStorageInfoSync(),

  // 系统 / 窗口
  getSystemInfoSync: () => uni.getSystemInfoSync(),
  getWindowInfo,
  onWindowResize: (cb) => uni.onWindowResize(cb),
  offWindowResize: (cb) => uni.offWindowResize(cb),
  nextTick: (cb) => {
    if (typeof uni.nextTick === "function") {
      uni.nextTick(cb);
    } else {
      setTimeout(cb, 0);
    }
  },
  hideKeyboard: () => uni.hideKeyboard(),

  // 媒体 / 文件
  previewImage: (o) => uni.previewImage(o),
  downloadFile: (o) => uni.downloadFile(o),
  // 统一平台 fsm 代理:App→plus.io / 小程序→真实 fsm / H5→fail 回调降级
  getFileSystemManager: () => createPlatformFsm(),
  shareFileMessage,
  chooseMedia,
};

export { wx, pageMixin, applyDataPath };

export default {
  wx,
  pageMixin,
  applyDataPath,
};
