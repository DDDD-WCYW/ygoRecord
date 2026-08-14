// 侦察脚本:统计小程序源码中的 wx API、数据库 API、wxml 特性用量
const fs = require("fs");
const path = require("path");

const base = "D:/迅雷下载/wx/miniprogram-1";
const pageJs = fs.readFileSync(path.join(base, "miniprogram/pages/index/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(base, "miniprogram/app.js"), "utf8");
const cloudJs = fs.readFileSync(path.join(base, "cloudfunctions/ygoApi/index.js"), "utf8");
const wxml = fs.readFileSync(path.join(base, "miniprogram/pages/index/index.wxml"), "utf8");

function tally(text, regex) {
  const counts = {};
  let m;
  while ((m = regex.exec(text))) {
    counts[m[0]] = (counts[m[0]] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

console.log("=== index.js wx.* API ===");
for (const [k, v] of tally(pageJs + appJs, /wx\.[A-Za-z]+/g)) console.log(`${v}\t${k}`);

console.log("\n=== cloud index.js db API (.method() 链) ===");
for (const [k, v] of tally(cloudJs, /\.(collection|where|orderBy|skip|limit|get|count|add|update|remove|doc|field|aggregate)\(/g)) console.log(`${v}\t${k}`);

console.log("\n=== cloud index.js _.command 用法 ===");
for (const [k, v] of tally(cloudJs, /_\.[a-zA-Z]+\(/g)) console.log(`${v}\t${k}`);

console.log("\n=== cloud index.js cloud./axios/adm-zip 等外部依赖 ===");
for (const [k, v] of tally(cloudJs, /\b(cloud\.[A-Za-z]+|axios[.(]|AdmZip|getWXContext)/g)) console.log(`${v}\t${k}`);

console.log("\n=== wxml 标签 ===");
for (const [k, v] of tally(wxml, /<[a-z][a-z-]*/g)) console.log(`${v}\t${k}`);

console.log("\n=== wxml 指令/事件属性 ===");
for (const [k, v] of tally(wxml, /\b(wx:[a-z-]+|bind[a-z]+|catch[a-z]+|mut-bind:[a-z]+|model:[a-z]+)=/g)) console.log(`${v}\t${k}`);

console.log("\n=== wxml wxs/template/import/include ===");
for (const [k, v] of tally(wxml, /<(wxs|template|import|include)[\s>]/g)) console.log(`${v}\t${k}`);

console.log("\n=== index.js 中 getApp/Page/Component/getCurrentPages ===");
for (const [k, v] of tally(pageJs, /\b(getApp|getCurrentPages|Component|Behavior)\(/g)) console.log(`${v}\t${k}`);

console.log("\n=== index.js selectQuery/canvas 相关 ===");
for (const [k, v] of tally(pageJs, /\b(createSelectorQuery|createCanvasContext|canvasToTempFilePath|getContext|node\.getContext)\b/g)) console.log(`${v}\t${k}`);

console.log("\n=== 云函数 COLLECTIONS 定义 ===");
const collMatch = cloudJs.match(/const COLLECTIONS = \{[\s\S]*?\};/);
console.log(collMatch ? collMatch[0] : "not found");

console.log("\n=== 云函数路由表 ===");
const routeMatches = cloudJs.match(/["']\/[a-z\-\/]+["']\s*:/g) || [];
console.log(routeMatches.join("\n"));
