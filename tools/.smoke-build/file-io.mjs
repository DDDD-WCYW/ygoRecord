// file-io.js
// 平台自适应的文件系统抽象(统一小程序 fsm 接口):
// - App(Android/iOS): plus.io
// - 小程序: wx.getFileSystemManager(或 uni.getFileSystemManager 若存在)
// - H5: 不支持落地文件,导出走浏览器下载(Blob),导入走 <input type=file>
// 说明: uni.getFileSystemManager 不是 uni-app 的合法 API(小程序专属),
// 之前 backup.js / wx-compat.js 直接调用导致 App/H5 端 TypeError,本模块统一修复。

// ---------- 平台探测 ----------

function getRuntime() {
  if (typeof uni !== "undefined") {
    return uni;
  }
  if (typeof globalThis !== "undefined" && globalThis.uni) {
    return globalThis.uni;
  }
  return null;
}

// App 端:HTML5+ 环境(plus.io)存在
function isApp() {
  return typeof plus !== "undefined" && !!plus.io;
}

// 小程序端:存在真实文件系统管理器
function getMiniProgramFsm() {
  const runtime = getRuntime();
  if (runtime && typeof runtime.getFileSystemManager === "function") {
    return runtime.getFileSystemManager();
  }
  if (typeof wx !== "undefined" && typeof wx.getFileSystemManager === "function") {
    return wx.getFileSystemManager();
  }
  return null;
}

function hasMiniProgramFsm() {
  return !!getMiniProgramFsm();
}

// H5 端:无 plus 且无小程序 fsm
function isH5() {
  return !isApp() && !hasMiniProgramFsm();
}

function getUserDataPath() {
  const runtime = getRuntime();
  if (runtime && runtime.env && runtime.env.USER_DATA_PATH) {
    return runtime.env.USER_DATA_PATH;
  }
  // App 端 plus 环境私有文档目录
  return "_doc";
}

// App 端公共下载目录(HTML5+ 根别名 _downloads):
// Android 映射到 /storage/emulated/0/Download(系统 Download 文件夹),
// iOS 映射到 App 的 Documents 目录(系统相册/文件 App 可见)。
// 仅 App 端可用,小程序/H5 返回 null(无公共目录概念)。
function getDownloadDirPath() {
  return isApp() ? "_downloads" : null;
}

// Android 10+ 开启分区存储后,HTML5+ 的 _downloads 可能映射到
// Android/data/<package>/files/Download,并非用户在文件管理器看到的公共 Download。
// 写入真正的公共 Download 必须经 MediaStore,不能靠 WRITE_EXTERNAL_STORAGE 或
// MANAGE_EXTERNAL_STORAGE 权限硬写路径。成功时返回 content:// URI 与展示路径。
function saveTextToPublicDownloads(fileName, text, mimeType) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try {
      if (
        !isApp() ||
        !plus.android ||
        typeof plus.android.runtimeMainActivity !== "function"
      ) {
        reject(new Error("当前 App 运行环境不支持写入公共下载目录"));
        return;
      }

      const activity = plus.android.runtimeMainActivity();
      const resolver = activity.getContentResolver();
      const BuildVersion = plus.android.importClass("android.os.Build$VERSION");
      const ContentValues = plus.android.importClass("android.content.ContentValues");
      const Downloads = plus.android.importClass(
        "android.provider.MediaStore$Downloads"
      );
      const MediaColumns = plus.android.importClass(
        "android.provider.MediaStore$MediaColumns"
      );
      const JavaString = plus.android.importClass("java.lang.String");
      const sdkInt = Number(BuildVersion.SDK_INT) || 0;

      // Android 10 以前仍沿用 plus.io,避免使用仅 API 29 起可用的 RELATIVE_PATH。
      if (sdkInt < 29) {
        reject(new Error("当前 Android 版本不支持 MediaStore 下载目录写入"));
        return;
      }

      const values = new ContentValues();
      values.put(MediaColumns.DISPLAY_NAME, String(fileName));
      values.put(MediaColumns.MIME_TYPE, mimeType || "application/octet-stream");
      values.put(MediaColumns.RELATIVE_PATH, "Download");
      values.put(MediaColumns.IS_PENDING, 1);

      const uri = resolver.insert(Downloads.EXTERNAL_CONTENT_URI, values);
      if (!uri) {
        throw new Error("系统拒绝创建 Download 文件");
      }

      let stream = null;
      try {
        stream = resolver.openOutputStream(uri, "w");
        if (!stream) {
          throw new Error("无法打开 Download 文件");
        }
        // 直接写 UTF-8 字节,避免 FileWriter 的异步事件在部分基座中提前触发,
        // 从而产生 0 B 文件。
        const bytes = new JavaString(String(text)).getBytes("UTF-8");
        stream.write(bytes);
        stream.flush();
        stream.close();
        stream = null;

        values.clear();
        values.put(MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        resolve({
          uri: String(uri.toString()),
          displayPath: `/storage/emulated/0/Download/${fileName}`,
          sizeBytes: Number(bytes.length) || 0,
        });
      } catch (error) {
        if (stream) {
          try {
            stream.close();
          } catch (closeError) {
            // 保留原始写入错误
          }
        }
        try {
          resolver.delete(uri, null, null);
        } catch (deleteError) {
          // 清理失败不掩盖写入错误
        }
        throw error;
      }
      return;
    } catch (error) {
      reject(toError(error, "写入公共下载目录失败"));
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    reject(new Error("当前环境不支持写入公共下载目录"));
  });
}

// 调起 Android 系统“另存为”文件选择器。用户可在界面中选择 Download
// 或其他目录；返回 content:// URI,无需申请存储权限。
function chooseSaveFile(fileName, mimeType) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try {
      if (!isApp() || !plus.android) {
        reject(new Error("当前环境不支持文件保存选择器"));
        return;
      }
      const activity = plus.android.runtimeMainActivity();
      const Intent = plus.android.importClass("android.content.Intent");
      const intent = new Intent("android.intent.action.CREATE_DOCUMENT");
      intent.addCategory("android.intent.category.OPENABLE");
      intent.setType(mimeType || "application/octet-stream");
      intent.putExtra("android.intent.extra.TITLE", String(fileName));
      intent.addFlags(3); // FLAG_GRANT_READ_URI_PERMISSION | WRITE_URI_PERMISSION
      const requestCode = 28640 + Math.floor(Math.random() * 1000);
      const previousHandler = activity.onActivityResult;
      let settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        try {
          activity.onActivityResult = previousHandler;
        } catch (restoreError) {
          // 忽略恢复旧回调失败
        }
        if (error) reject(error);
        else resolve(value);
      };
      activity.onActivityResult = function (code, resultCode, data) {
        if (Number(code) !== requestCode) {
          if (typeof previousHandler === "function") {
            previousHandler.apply(this, arguments);
          }
          return;
        }
        if (Number(resultCode) !== -1 || !data) {
          finish(null);
          return;
        }
        try {
          const uri = data.getData();
          finish(uri ? String(uri.toString()) : null);
        } catch (error) {
          finish(null, error);
        }
      };
      activity.startActivityForResult(intent, requestCode);
      return;
    } catch (error) {
      reject(toError(error, "打开文件保存选择器失败"));
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    reject(new Error("当前环境不支持文件保存选择器"));
  });
}

// 调起 Android 系统“打开文件”选择器，供导入备份使用。与 chooseSaveFile
// 使用同一套已验证的 Activity 回调机制，避免部分 App 基座的 uni.chooseFile
// 不响应问题。
function chooseOpenFile(mimeType) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try {
      if (!isApp() || !plus.android) {
        reject(new Error("当前环境不支持文件选择器"));
        return;
      }
      const activity = plus.android.runtimeMainActivity();
      const Intent = plus.android.importClass("android.content.Intent");
      // ACTION_GET_CONTENT 比 OPEN_DOCUMENT 在厂商文件管理器上的兼容性更好。
      // 导入会立即读取文件，无需持久 URI 权限。
      const intent = new Intent("android.intent.action.GET_CONTENT");
      intent.addCategory("android.intent.category.OPENABLE");
      intent.setType(mimeType || "application/json");
      intent.addFlags(1); // FLAG_GRANT_READ_URI_PERMISSION
      const requestCode = 29640 + Math.floor(Math.random() * 1000);
      const previousHandler = activity.onActivityResult;
      let settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        try {
          activity.onActivityResult = previousHandler;
        } catch (restoreError) {
          // 忽略恢复旧回调失败
        }
        if (error) reject(error);
        else resolve(value);
      };
      activity.onActivityResult = function (code, resultCode, data) {
        if (Number(code) !== requestCode) {
          if (typeof previousHandler === "function") {
            previousHandler.apply(this, arguments);
          }
          return;
        }
        if (Number(resultCode) !== -1 || !data) {
          finish(null);
          return;
        }
        try {
          const uri = data.getData();
          finish(uri ? String(uri.toString()) : null);
        } catch (error) {
          finish(null, error);
        }
      };
      activity.startActivityForResult(intent, requestCode);
      return;
    } catch (error) {
      reject(toError(error, "打开文件选择器失败"));
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    reject(new Error("当前环境不支持文件选择器"));
  });
}

function writeTextToContentUri(uri, text) {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try {
      if (!isApp() || !plus.android || !String(uri || "").startsWith("content://")) {
        reject(new Error("无效的系统文件 URI"));
        return;
      }
      const activity = plus.android.runtimeMainActivity();
      const Uri = plus.android.importClass("android.net.Uri");
      // 使用 plus.android.newObject / invoke 而非直接 new + 方法调用。
      // 部分基座对带重载的 Java 构造器与方法不能正确派发，表现为文件被
      // ACTION_CREATE_DOCUMENT 创建出来但始终是 0 B。
      const resolver = plus.android.invoke(activity, "getContentResolver");
      // Uri.parse 是已 importClass 的静态方法,当前基座对它支持直接调用；
      // openOutputStream 则必须走 invoke 并显式传入可写模式。
      const parsedUri = Uri.parse(String(uri));
      const stream = plus.android.invoke(resolver, "openOutputStream", parsedUri, "w");
      if (!stream) {
        reject(new Error("无法打开用户选择的文件"));
        return;
      }
      const writer = plus.android.newObject(
        "java.io.OutputStreamWriter",
        stream,
        "UTF-8"
      );
      plus.android.invoke(writer, "write", String(text));
      plus.android.invoke(writer, "flush");
      plus.android.invoke(writer, "close");
      // 返回 JS 文本长度仅用于非空校验,不依赖 Java byte[] 的 length 映射。
      resolve(String(text || "").length);
      return;
    } catch (error) {
      reject(toError(error, "写入用户选择的文件失败"));
      return;
    }
    // #endif
    // eslint-disable-next-line no-unreachable
    reject(new Error("当前环境不支持系统文件写入"));
  });
}

// 将 plus.io 路径(如 _downloads/xxx.json)转换为 file:// 绝对 URL,
// 供系统分享(plus.share.sendWithSystem)等需要绝对路径的场景使用。
// 非 App 端原样返回。
function toAbsoluteUrl(filePath) {
  if (isApp() && typeof plus.io.convertLocalFileSystemURL === "function") {
    try {
      return plus.io.convertLocalFileSystemURL(filePath);
    } catch (error) {
      return filePath;
    }
  }
  return filePath;
}

// ---------- App 端 plus.io 实现 ----------

function toError(value, fallback) {
  if (value instanceof Error) {
    return value;
  }
  const detail =
    (value && (value.errMsg || value.message || value.detail)) || String(value || "");
  return new Error(
    fallback ? `${fallback}${detail ? `：${detail}` : ""}` : detail || "文件操作失败"
  );
}

function plusWriteTextFile(filePath, text) {
  return new Promise((resolve, reject) => {
    try {
      const fail = (message) => reject(new Error(message));
      const createAndWrite = (entry) => {
        entry.createWriter(
          (writer) => {
            writer.onwrite = () => {
              // 不要在这里调用 truncate(writer.length)。部分 Android 基座在
              // onwrite 时尚未刷新 writer.length,此处会把刚写入的文件截成 0 B。
              // 导出文件名按秒生成,正常情况下是新文件,直接完成即可。
              resolve();
            };
            writer.onerror = () =>
              fail("写入文件失败: " + filePath);
            writer.write(text);
          },
          () => fail("创建写入器失败: " + filePath)
        );
      };
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (entry) => createAndWrite(entry),
        () => {
          // 文件不存在 → 创建后写入
          const idx = filePath.lastIndexOf("/");
          const parentPath = idx > 0 ? filePath.substring(0, idx) : "_doc";
          const name = idx >= 0 ? filePath.substring(idx + 1) : filePath;
          plus.io.resolveLocalFileSystemURL(
            parentPath,
            (dirEntry) => {
              dirEntry.getFile(
                name,
                { create: true },
                (newEntry) => createAndWrite(newEntry),
                () => fail("创建文件失败: " + filePath)
              );
            },
            () => fail("目录不可用: " + parentPath)
          );
        }
      );
    } catch (error) {
      reject(toError(error, "写入文件失败"));
    }
  });
}

function plusReadTextFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Android 系统文件选择器和 MediaStore 返回 content:// URI,它不能交给
      // plus.io.resolveLocalFileSystemURL 读取,需通过 ContentResolver 打开。
      if (String(filePath || "").startsWith("content://") && plus.android) {
        const activity = plus.android.runtimeMainActivity();
        const Uri = plus.android.importClass("android.net.Uri");
        const resolver = plus.android.invoke(activity, "getContentResolver");
        const parsedUri = Uri.parse(String(filePath));
        const stream = plus.android.invoke(resolver, "openInputStream", parsedUri);
        if (!stream) {
          reject(new Error("无法打开文件: " + filePath));
          return;
        }
        // 当前基座的原生对象不保证暴露可直接调用的方法；与导出一致，
        // 全部经 plus.android.invoke 调用，避免 Scanner.xxx is not a function。
        const scanner = plus.android.newObject("java.util.Scanner", stream, "UTF-8");
        plus.android.invoke(scanner, "useDelimiter", "\\A");
        const hasNext = plus.android.invoke(scanner, "hasNext");
        const text = hasNext ? String(plus.android.invoke(scanner, "next")) : "";
        plus.android.invoke(scanner, "close");
        resolve(text);
        return;
      }
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (entry) => {
          const reader = new plus.io.FileReader();
          reader.onloadend = (event) => {
            const result = event && event.target && event.target.result;
            resolve(result === undefined || result === null ? "" : String(result));
          };
          reader.onerror = () => reject(new Error("读取文件失败: " + filePath));
          reader.readAsText(entry, "utf-8");
        },
        () => reject(new Error("文件不存在: " + filePath))
      );
    } catch (error) {
      reject(toError(error, "读取文件失败"));
    }
  });
}

function plusReadBinaryFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (entry) => {
          const reader = new plus.io.FileReader();
          reader.onloadend = (event) => {
            const result = event && event.target && event.target.result;
            if (result === undefined || result === null) {
              reject(new Error("读取二进制文件失败: " + filePath));
            } else {
              resolve(result);
            }
          };
          reader.onerror = () => reject(new Error("读取二进制文件失败: " + filePath));
          // 部分 HTML5+ 基座会暴露 readAsArrayBuffer 但不触发 onloadend；
          // readAsDataURL 是其稳定实现，统一经 base64 转回 Uint8Array。
          if (typeof reader.readAsDataURL === "function") {
            reader.onloadend = (event) => {
              const value = String(event && event.target && event.target.result || "");
              const comma = value.indexOf(",");
              const encoded = comma >= 0 ? value.slice(comma + 1) : value;
              if (typeof atob !== "function") {
                reject(new Error("当前基座不支持二进制文件读取"));
                return;
              }
              const raw = atob(encoded);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
              resolve(bytes.buffer);
            };
            reader.readAsDataURL(entry);
            return;
          }
          reject(new Error("当前基座不支持二进制文件读取"));
        },
        () => reject(new Error("文件不存在: " + filePath))
      );
    } catch (error) {
      reject(toError(error, "读取二进制文件失败"));
    }
  });
}

function ensureDirectory(dirPath) {
  if (isApp()) {
    return new Promise((resolve, reject) => {
      try {
        const idx = String(dirPath).lastIndexOf("/");
        const parent = idx > 0 ? String(dirPath).substring(0, idx) : "_doc";
        const name = idx >= 0 ? String(dirPath).substring(idx + 1) : String(dirPath);
        plus.io.resolveLocalFileSystemURL(
          parent,
          (entry) => entry.getDirectory(name, { create: true }, resolve, () => reject(new Error("创建目录失败: " + dirPath))),
          () => reject(new Error("目录不可用: " + parent))
        );
      } catch (error) {
        reject(toError(error, "创建目录失败"));
      }
    });
  }
  const fsm = getMiniProgramFsm();
  if (fsm && typeof fsm.mkdir === "function") {
    return new Promise((resolve, reject) => fsm.mkdir({ dirPath, recursive: true, success: resolve, fail: reject }));
  }
  return Promise.reject(new Error("当前环境不支持创建目录"));
}

function readBinaryFile(filePath) {
  if (isApp()) return plusReadBinaryFile(filePath);
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => fsm.readFile({ filePath, success: (res) => resolve(res && res.data), fail: reject }));
  }
  return Promise.reject(new Error("当前环境不支持读取二进制文件"));
}

function plusListDir(dirPath) {
  return new Promise((resolve, reject) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        dirPath,
        (entry) => {
          const reader = entry.createReader();
          const names = [];
          const readBatch = () => {
            reader.readEntries(
              (entries) => {
                if (!entries || !entries.length) {
                  resolve(names);
                  return;
                }
                (entries || []).forEach((item) => names.push(item.name));
                // 部分平台分批返回,继续读取直到空
                readBatch();
              },
              () => reject(new Error("读取目录失败: " + dirPath))
            );
          };
          readBatch();
        },
        () => resolve([]) // 目录不存在视为空
      );
    } catch (error) {
      reject(toError(error, "读取目录失败"));
    }
  });
}

function plusStatFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (entry) => {
          entry.getMetadata(
            (meta) => {
              const time = meta && meta.modificationTime;
              resolve({
                size: (meta && meta.size) || 0,
                mtime: time
                  ? typeof time.getTime === "function"
                    ? time.getTime()
                    : Number(time) || 0
                  : 0,
              });
            },
            () => reject(new Error("读取文件信息失败: " + filePath))
          );
        },
        () => reject(new Error("文件不存在: " + filePath))
      );
    } catch (error) {
      reject(toError(error, "读取文件信息失败"));
    }
  });
}

function plusUnlinkFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        filePath,
        (entry) =>
          entry.remove(
            () => resolve(),
            () => reject(new Error("删除文件失败: " + filePath))
          ),
        () => resolve() // 文件不存在视为删除成功
      );
    } catch (error) {
      reject(toError(error, "删除文件失败"));
    }
  });
}

function plusCopyFile(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        srcPath,
        (srcEntry) => {
          const idx = destPath.lastIndexOf("/");
          const parentPath = idx > 0 ? destPath.substring(0, idx) : "_doc";
          const name = idx >= 0 ? destPath.substring(idx + 1) : destPath;
          plus.io.resolveLocalFileSystemURL(
            parentPath,
            (dirEntry) =>
              srcEntry.copyTo(
                dirEntry,
                name,
                () => resolve(),
                () => reject(new Error("复制文件失败: " + srcPath))
              ),
            () => reject(new Error("目录不可用: " + parentPath))
          );
        },
        () => reject(new Error("文件不存在: " + srcPath))
      );
    } catch (error) {
      reject(toError(error, "复制文件失败"));
    }
  });
}

function plusFileExists(filePath) {
  return new Promise((resolve) => {
    try {
      plus.io.resolveLocalFileSystemURL(
        filePath,
        () => resolve(true),
        () => resolve(false)
      );
    } catch (error) {
      resolve(false);
    }
  });
}

// ---------- 统一 Promise API(按平台分发) ----------

function writeTextFile(filePath, text) {
  if (isApp()) {
    return plusWriteTextFile(filePath, text);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.writeFile({
        filePath,
        data: text,
        encoding: "utf8",
        success: resolve,
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "写入文件失败")),
      });
    });
  }
  return Promise.reject(new Error("当前环境(H5)不支持本地文件写入"));
}

function readTextFile(filePath) {
  if (isApp()) {
    return plusReadTextFile(filePath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.readFile({
        filePath,
        encoding: "utf8",
        success: (res) => resolve(String((res && res.data) || "")),
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "读取文件失败")),
      });
    });
  }
  return Promise.reject(new Error("当前环境(H5)不支持本地文件读取"));
}

function listDir(dirPath) {
  if (isApp()) {
    return plusListDir(dirPath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.readdir({
        dirPath,
        success: (res) => resolve((res && res.files) || []),
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "读取目录失败")),
      });
    });
  }
  return Promise.resolve([]); // H5 无文件系统,视为空目录
}

function statFile(filePath) {
  if (isApp()) {
    return plusStatFile(filePath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.stat({
        path: filePath,
        success: (res) => {
          const stats = (res && (res.stats || res.stat)) || {};
          resolve({
            size: stats.size || 0,
            mtime: Number(stats.lastModifiedTime || stats.mtime || 0),
          });
        },
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "读取文件信息失败")),
      });
    });
  }
  return Promise.reject(new Error("当前环境(H5)不支持本地文件读取"));
}

function unlinkFile(filePath) {
  if (isApp()) {
    return plusUnlinkFile(filePath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.unlink({
        filePath,
        success: resolve,
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "删除文件失败")),
      });
    });
  }
  return Promise.resolve(); // H5 无文件系统,视为已删除
}

function fileExists(filePath) {
  if (isApp()) {
    return plusFileExists(filePath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve) => {
      fsm.access({
        path: filePath,
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    });
  }
  return Promise.resolve(false); // H5 无文件系统
}

function copyFile(srcPath, destPath) {
  if (isApp()) {
    return plusCopyFile(srcPath, destPath);
  }
  const fsm = getMiniProgramFsm();
  if (fsm) {
    return new Promise((resolve, reject) => {
      fsm.copyFile({
        srcPath,
        destPath,
        success: resolve,
        fail: (error) =>
          reject(new Error((error && error.errMsg) || "复制文件失败")),
      });
    });
  }
  return Promise.reject(new Error("当前环境(H5)不支持本地文件复制"));
}

// ---------- H5 浏览器下载 ----------

function downloadTextFile(fileName, text, mimeType) {
  const blob = new Blob([text], {
    type: mimeType || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
  return true;
}

// ---------- 统一 fsm 代理(兼容小程序 fsm 回调接口) ----------
// 供页面里沿用 wx.getFileSystemManager() 写法的代码使用:
// App → plus.io 实现;小程序 → 真实 fsm;H5 → no-op(fail 回调,不抛同步异常)

function createPlatformFsm() {
  const miniFsm = getMiniProgramFsm();
  if (miniFsm) {
    return miniFsm;
  }
  if (isApp()) {
    return {
      writeFile: (options) => {
        plusWriteTextFile(options.filePath, options.data)
          .then(() => options.success && options.success())
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "writeFile:fail" })
          );
      },
      readFile: (options) => {
        plusReadTextFile(options.filePath)
          .then((data) => options.success && options.success({ data }))
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "readFile:fail" })
          );
      },
      access: (options) => {
        plusFileExists(options.path).then((ok) => {
          if (ok) {
            options.success && options.success();
          } else {
            options.fail && options.fail({ errMsg: "access:fail" });
          }
        });
      },
      unlink: (options) => {
        plusUnlinkFile(options.filePath)
          .then(() => options.success && options.success())
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "unlink:fail" })
          );
      },
      unlinkSync: () => {
        throw new Error("App 端(plus.io)不支持同步删除");
      },
      readdir: (options) => {
        plusListDir(options.dirPath)
          .then((files) => options.success && options.success({ files }))
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "readdir:fail" })
          );
      },
      stat: (options) => {
        plusStatFile(options.path)
          .then((stats) => options.success && options.success({ stats }))
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "stat:fail" })
          );
      },
      copyFile: (options) => {
        plusCopyFile(options.srcPath, options.destPath)
          .then(() => options.success && options.success())
          .catch((error) =>
            options.fail && options.fail({ errMsg: error.message || "copyFile:fail" })
          );
      },
      writeFileSync: () => {
        throw new Error("App 端(plus.io)不支持同步写入");
      },
      mkdir: () => {},
    };
  }
  // H5 no-op
  const h5Fail = (options) => {
    options.fail &&
      options.fail({ errMsg: "当前环境(H5)不支持文件系统操作" });
  };
  return {
    writeFile: h5Fail,
    readFile: h5Fail,
    access: h5Fail,
    unlink: h5Fail,
    unlinkSync: () => {
      throw new Error("当前环境(H5)不支持文件系统操作");
    },
    readdir: h5Fail,
    stat: h5Fail,
    copyFile: h5Fail,
    writeFileSync: () => {
      throw new Error("当前环境(H5)不支持文件系统操作");
    },
    mkdir: () => {},
  };
}

export {
  getRuntime,
  isApp,
  isH5,
  hasMiniProgramFsm,
  getUserDataPath,
  getDownloadDirPath,
  saveTextToPublicDownloads,
  chooseSaveFile,
  chooseOpenFile,
  writeTextToContentUri,
  toAbsoluteUrl,
  writeTextFile,
  readTextFile,
  readBinaryFile,
  ensureDirectory,
  listDir,
  statFile,
  unlinkFile,
  fileExists,
  copyFile,
  downloadTextFile,
  createPlatformFsm,
};

export default {
  getRuntime,
  isApp,
  isH5,
  hasMiniProgramFsm,
  getUserDataPath,
  getDownloadDirPath,
  saveTextToPublicDownloads,
  chooseSaveFile,
  chooseOpenFile,
  writeTextToContentUri,
  toAbsoluteUrl,
  writeTextFile,
  readTextFile,
  readBinaryFile,
  ensureDirectory,
  listDir,
  statFile,
  unlinkFile,
  fileExists,
  copyFile,
  downloadTextFile,
  createPlatformFsm,
};
