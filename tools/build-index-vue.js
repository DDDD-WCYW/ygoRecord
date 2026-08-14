// build-index-vue.js
// 将小程序 pages/index 的 wxml/wxss/js 机械转换为 uni-app 的 pages/index/index.vue
// 转换规则见计划:wx:if→v-if、wx:for+wx:key→v-for+:key、bindtap→@tap、catchtap→@tap.stop、block→template
// 脚本部分:Page({...}) → pageConfig,callApi 改走 callLocalApi,云文件下载改本地拷贝
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const APP_ROOT = path.resolve(__dirname, "..");
const MP_PAGE = "D:/迅雷下载/wx/miniprogram-1/miniprogram/pages/index";
const OUT_VUE = path.join(APP_ROOT, "pages/index/index.vue");

const warnings = [];
const stats = { directives: 0, events: 0, bindings: 0, mixed: 0, blocks: 0 };

// ---------- 表达式工具 ----------
function escapeStatic(text) {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// "pre{{expr}}post" → Vue 绑定表达式;纯静态返回 null
function toBindingExpression(value) {
  if (value.indexOf("{{") === -1) {
    return null;
  }
  const parts = [];
  let rest = value;
  while (rest.length) {
    const start = rest.indexOf("{{");
    if (start === -1) {
      parts.push(`'${escapeStatic(rest)}'`);
      break;
    }
    if (start > 0) {
      parts.push(`'${escapeStatic(rest.slice(0, start))}'`);
    }
    const end = rest.indexOf("}}", start);
    if (end === -1) {
      throw new Error(`插值未闭合: ${value}`);
    }
    const expr = rest.slice(start + 2, end).trim();
    parts.push(parts.length || rest.slice(end + 2).length ? `(${expr})` : expr);
    rest = rest.slice(end + 2);
  }
  if (parts.length === 1) {
    // 纯插值:去掉多余括号
    const single = parts[0];
    return single.startsWith("(") && single.endsWith(")")
      ? single.slice(1, -1)
      : single;
  }
  stats.mixed += 1;
  return parts.join(" + ");
}

function unwrapMustache(value, context) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^\{\{([\s\S]*)\}\}$/);
  if (!match) {
    throw new Error(`${context} 期望 {{...}} 形式,实际: ${value}`);
  }
  return match[1].trim();
}

// ---------- 属性解析 ----------
function parseAttrs(raw) {
  const attrs = [];
  const pattern = /([^\s=]+)(?:="([^"]*)")?/g;
  let match;
  while ((match = pattern.exec(raw))) {
    attrs.push({ name: match[1], value: match[2] });
  }
  return attrs;
}

function convertTag(tagName, attrRaw, selfClose) {
  const attrs = parseAttrs(attrRaw);
  const out = [];
  let vFor = null;
  let forItem = "item";
  let forIndex = "index";
  let vKeyRaw = null;
  let hasIf = false;

  // 先扫 for-item/for-index,wx:key 依赖它们
  attrs.forEach((attr) => {
    if (attr.name === "wx:for-item") forItem = attr.value;
    if (attr.name === "wx:for-index") forIndex = attr.value;
  });

  attrs.forEach((attr) => {
    const { name, value } = attr;
    if (name === "wx:for-item" || name === "wx:for-index") {
      return;
    }
    if (name === "wx:for") {
      vFor = unwrapMustache(value, "wx:for");
      stats.directives += 1;
      return;
    }
    if (name === "wx:key") {
      vKeyRaw = value;
      return;
    }
    if (name === "wx:if") {
      hasIf = true;
      out.push(`v-if="${unwrapMustache(value, "wx:if")}"`);
      stats.directives += 1;
      return;
    }
    if (name === "wx:elif") {
      out.push(`v-else-if="${unwrapMustache(value, "wx:elif")}"`);
      stats.directives += 1;
      return;
    }
    if (name === "wx:else") {
      out.push("v-else");
      stats.directives += 1;
      return;
    }
    const eventMatch = name.match(/^(bind|catch):?([a-z]\w*)$/);
    if (eventMatch) {
      const modifier = eventMatch[1] === "catch" ? ".stop" : "";
      out.push(`@${eventMatch[2]}${modifier}="${value}"`);
      stats.events += 1;
      return;
    }
    if (name.startsWith("wx:")) {
      warnings.push(`未识别指令 ${name} on <${tagName}>`);
      return;
    }
    if (value === undefined) {
      out.push(name);
      return;
    }
    const binding = toBindingExpression(value);
    if (binding !== null) {
      out.push(`:${name}="${binding}"`);
      stats.bindings += 1;
      return;
    }
    out.push(`${name}="${value}"`);
  });

  if (vFor) {
    let keyExpr = null;
    if (vKeyRaw !== undefined && vKeyRaw !== null) {
      if (vKeyRaw === "*this") keyExpr = forItem;
      else if (vKeyRaw === forIndex || vKeyRaw === "index") keyExpr = forIndex;
      else keyExpr = `${forItem}.${vKeyRaw}`;
    }
    // Vue3 中 v-if 优先级高于 v-for,与 wxml 语义相反,同元素共存需人工确认
    if (hasIf) {
      warnings.push(`<${tagName}> 同时存在 wx:for 与 wx:if,需人工确认优先级`);
    }
    out.unshift(
      `v-for="(${forItem}, ${forIndex}) in ${vFor}"` +
        (keyExpr ? ` :key="${keyExpr}"` : "")
    );
  }

  const finalTag = tagName === "block" ? "template" : tagName;
  if (tagName === "block") stats.blocks += 1;
  const attrText = out.length ? " " + out.join(" ") : "";
  return `<${finalTag}${attrText}${selfClose ? " /" : ""}>`;
}

function convertWxml(source) {
  return source.replace(
    /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g,
    (whole, close, tag, attrRaw, selfClose) => {
      if (close) {
        return `</${tag === "block" ? "template" : tag}>`;
      }
      return convertTag(tag, attrRaw || "", Boolean(selfClose));
    }
  );
}

// ---------- 脚本转换 ----------
function replaceOnce(source, target, replacement, label) {
  const index = source.indexOf(target);
  if (index === -1) {
    throw new Error(`脚本替换失败(${label}):未找到目标片段`);
  }
  if (source.indexOf(target, index + 1) !== -1) {
    throw new Error(`脚本替换失败(${label}):目标片段不唯一`);
  }
  return source.slice(0, index) + replacement + source.slice(index + target.length);
}

function convertScript(source) {
  let out = source;

  // 1. Page({...}) → const pageConfig = {...}
  out = replaceOnce(out, "\nPage({", "\nconst pageConfig = {", "Page 开头");
  const tailIndex = out.lastIndexOf("\n});");
  if (tailIndex === -1) {
    throw new Error("脚本替换失败(Page 结尾):未找到 \\n});");
  }
  out = out.slice(0, tailIndex) + "\n};" + out.slice(tailIndex + 4);

  // 2. callApi:云函数调用 → 本地分发器
  out = replaceOnce(
    out,
    `    const response = await wx.cloud.callFunction({
      name: "ygoApi",
      data: {
        path,
        body,
      },
    });`,
    `    const response = { result: await callLocalApi({ path, body }) };`,
    "callApi"
  );

  // 3. 云文件下载 → 本地文件拷贝到临时路径(fileID 即 card-store 返回的本地路径)
  out = replaceOnce(
    out,
    `function wxCloudDownloadFilePromise(options) {
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}`,
    `function wxCloudDownloadFilePromise(options) {
  // 本地模式:card-store 返回的 fileID 即本地文件路径,复制到临时文件返回
  // (调用方会先 unlink 目标路径再 copy,复制一份可避免误删源文件)
  const fileID = String((options && options.fileID) || "").trim();
  if (!fileID || fileID.indexOf("cloud://") === 0) {
    return Promise.reject(new Error("本地模式不支持云文件下载"));
  }
  const tempFilePath =
    wx.env.USER_DATA_PATH +
    "/ygo_tmp_cloud_" + Date.now() + "_" + Math.floor(Math.random() * 1e6) + ".jpg";
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({
      srcPath: fileID,
      destPath: tempFilePath,
      success: () => resolve({ tempFilePath }),
      fail: reject,
    });
  });
}`,
    "wxCloudDownloadFilePromise"
  );

  if (out.includes("wx.cloud.callFunction")) {
    throw new Error("脚本中仍残留 wx.cloud.callFunction");
  }
  return out;
}

const VUE_ADAPTER = `
// ===== 以下为 uni-app 适配层(build-index-vue.js 生成) =====
const PAGE_LIFECYCLE_KEYS = [
  "onLoad", "onShow", "onReady", "onHide", "onUnload",
  "onPullDownRefresh", "onReachBottom", "onPageScroll", "onResize", "onBackPress",
];

const pageData = pageConfig.data || {};
const pageMethods = {};
const pageLifecycle = {};
const pagePlainProps = {};
Object.keys(pageConfig).forEach((key) => {
  if (key === "data") {
    return;
  }
  const value = pageConfig[key];
  if (typeof value === "function") {
    if (PAGE_LIFECYCLE_KEYS.indexOf(key) !== -1) {
      pageLifecycle[key] = value;
    } else {
      pageMethods[key] = value;
    }
  } else {
    pagePlainProps[key] = value;
  }
});

export default {
  mixins: [pageMixin],
  data() {
    return pageData;
  },
  created() {
    // Page 配置里的非函数、非 data 顶层属性(如内部缓存对象)挂到实例
    Object.keys(pagePlainProps).forEach((key) => {
      this[key] = pagePlainProps[key];
    });
  },
  methods: pageMethods,
  ...pageLifecycle,
};
`;

function main() {
  const wxml = fs.readFileSync(path.join(MP_PAGE, "index.wxml"), "utf8");
  const wxss = fs.readFileSync(path.join(MP_PAGE, "index.wxss"), "utf8");
  const js = fs.readFileSync(path.join(MP_PAGE, "index.js"), "utf8");

  const template = convertWxml(wxml);

  // 属性内不允许再残留 {{ / wx: 指令
  const leftoverDirectives = template.match(/wx:[a-z]+/g) || [];
  if (leftoverDirectives.length) {
    throw new Error(`模板残留 wx: 指令 ${leftoverDirectives.length} 处`);
  }
  const attrMustache = template.match(/(?:^|\s)[:\w-]+="[^"]*\{\{/g) || [];
  if (attrMustache.length) {
    console.log(attrMustache.slice(0, 5));
    throw new Error(`模板属性内残留 {{ 共 ${attrMustache.length} 处`);
  }

  const script = convertScript(js);
  const scriptFull =
    `import { wx, pageMixin } from "../../services/wx-compat.js";\n` +
    `import { callLocalApi } from "../../services/local-api.js";\n\n` +
    script.trimEnd() +
    "\n" +
    VUE_ADAPTER;

  // 语法校验:script 落地临时 mjs 后 node --check
  const checkPath = path.join(__dirname, ".index-vue-script.check.mjs");
  fs.writeFileSync(checkPath, scriptFull, "utf8");
  execFileSync(process.execPath, ["--check", checkPath], { stdio: "inherit" });
  fs.unlinkSync(checkPath);

  const vue =
    "<template>\n" +
    template.trimEnd() +
    "\n</template>\n\n" +
    "<script>\n" +
    scriptFull.trimEnd() +
    "\n</script>\n\n" +
    "<style>\n" +
    wxss.trimEnd() +
    "\n</style>\n";

  fs.mkdirSync(path.dirname(OUT_VUE), { recursive: true });
  fs.writeFileSync(OUT_VUE, vue, "utf8");

  console.log("生成:", OUT_VUE);
  console.log("统计:", JSON.stringify(stats));
  console.log("警告数:", warnings.length);
  warnings.slice(0, 20).forEach((w) => console.log("WARN", w));
}

main();
