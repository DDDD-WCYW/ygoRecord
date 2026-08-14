// build-local-api.js
// 从小程序云函数源码自动生成 App 端本地业务模块 services/local-api.gen.js
// 转换内容:
//   1. 头部 require + cloud.init 替换为 local-db shim 的 ESM 导入
//   2. crypto 替换为纯 JS md5 shim
//   3. process.env 引用移除(App 端无环境变量)
//   4. exports.main 替换为具名导出 main
// 业务逻辑本身零改动;云端专属路由(/sync/*、/message/* 等)由 local-api.js 包装层拦截,不会执行到云端代码。

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SOURCE = path.resolve(
  __dirname,
  "../../miniprogram-1/cloudfunctions/ygoApi/index.js"
);
const TARGET = path.resolve(__dirname, "../services/local-api.gen.js");

const HEADER_ORIGINAL = `const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const axios = require("axios");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;`;

const HEADER_REPLACEMENT = `// 本文件由 tools/build-local-api.js 自动生成,源文件: miniprogram-1/cloudfunctions/ygoApi/index.js
// 请勿手工编辑;重新生成: node tools/build-local-api.js
/* eslint-disable */
import { db, _, cloudShim as cloud } from "./local-db";
import { md5Hex } from "./md5";

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
const axios = null;`;

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) {
    throw new Error(`转换失败,未找到片段: ${label}`);
  }
  if (source.indexOf(from, first + 1) >= 0) {
    throw new Error(`转换失败,片段不唯一: ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function main() {
  let source = fs.readFileSync(SOURCE, "utf8");

  source = replaceOnce(source, HEADER_ORIGINAL, HEADER_REPLACEMENT, "header");
  source = replaceOnce(
    source,
    "normalizeOptionalString(process.env.ADMIN_OPENIDS)",
    "normalizeOptionalString(undefined)",
    "process.env"
  );
  source = replaceOnce(
    source,
    "exports.main = async (event) => {",
    "export const main = async (event) => {",
    "exports.main"
  );

  // 防御性检查:不应再残留 require/exports/process 引用
  ["require(", "exports.", "process.env"].forEach((token) => {
    if (source.includes(token)) {
      throw new Error(`转换结果仍包含不允许的标记: ${token}`);
    }
  });

  fs.writeFileSync(TARGET, source);

  // 语法校验(ESM 需要 .mjs 后缀)
  const tempFile = TARGET + ".check.mjs";
  const checked = source
    .replace('from "./local-db"', 'from "./local-db.js"')
    .replace('from "./md5"', 'from "./md5.js"');
  fs.writeFileSync(tempFile, checked);
  try {
    execFileSync(process.execPath, ["--check", tempFile], { stdio: "pipe" });
    console.log("生成成功:", TARGET);
  } finally {
    fs.unlinkSync(tempFile);
  }
}

main();
