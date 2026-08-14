// 侦察:项目骨架现状 / wxml 图片引用 / wxss 特性
const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const MP_ROOT = "D:/迅雷下载/wx/miniprogram-1/miniprogram";

function listDirSafe(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
}

console.log("ygo-app 根:", (listDirSafe(APP_ROOT) || []).join(", "));
console.log("pages:", JSON.stringify(listDirSafe(path.join(APP_ROOT, "pages"))));
console.log("pages/index:", JSON.stringify(listDirSafe(path.join(APP_ROOT, "pages/index"))));
console.log("static:", JSON.stringify(listDirSafe(path.join(APP_ROOT, "static"))));
console.log("static/icons:", JSON.stringify(listDirSafe(path.join(APP_ROOT, "static/icons"))));

const pagesJsonPath = path.join(APP_ROOT, "pages.json");
if (fs.existsSync(pagesJsonPath)) {
  console.log("pages.json:", fs.readFileSync(pagesJsonPath, "utf8"));
}

const wxml = fs.readFileSync(path.join(MP_ROOT, "pages/index/index.wxml"), "utf8");
const srcs = [...wxml.matchAll(/src="([^"]*)"/g)].map((m) => m[1]);
console.log("wxml image src:", JSON.stringify(srcs, null, 0));

// 小程序侧 images 目录
console.log("mp images dir:", JSON.stringify(listDirSafe(path.join(MP_ROOT, "images"))));

const wxss = fs.readFileSync(path.join(MP_ROOT, "pages/index/index.wxss"), "utf8");
console.log(
  "wxss 行数:", wxss.split(/\r?\n/).length,
  "@import:", (wxss.match(/@import/g) || []).length,
  "page选择器:", (wxss.match(/^page\s*\{/m) || []).length,
  "url():", (wxss.match(/url\(/g) || []).length
);

const appWxssPath = path.join(MP_ROOT, "app.wxss");
if (fs.existsSync(appWxssPath)) {
  const appWxss = fs.readFileSync(appWxssPath, "utf8");
  console.log("app.wxss 行数:", appWxss.split(/\r?\n/).length);
  console.log("---- app.wxss 内容 ----");
  console.log(appWxss.slice(0, 1500));
}
