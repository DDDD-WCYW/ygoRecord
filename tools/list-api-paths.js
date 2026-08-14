// 列出前端 index.js 中 callApi 的所有路径(用于 wrapper 路由拦截设计)
const fs = require("fs");
const s = fs.readFileSync(
  "D:/迅雷下载/wx/miniprogram-1/miniprogram/pages/index/index.js",
  "utf8"
);
const re = /callApi\(\s*["']([^"']+)["']/g;
const set = new Set();
let m;
while ((m = re.exec(s))) set.add(m[1]);
console.log([...set].sort().join("\n"));
