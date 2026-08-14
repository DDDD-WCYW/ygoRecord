// 侦察脚本2:云函数数据库高级特性使用情况
const fs = require("fs");
const s = fs.readFileSync("D:/迅雷下载/wx/miniprogram-1/cloudfunctions/ygoApi/index.js", "utf8");
const pats = {
  serverDate: /serverDate/g,
  RegExp: /RegExp/g,
  field: /\.field\(/g,
  set: /\.set\(/g,
  createCollection: /createCollection/g,
  orderByArgs: /\.orderBy\([^)]*\)/g,
  aggregate: /aggregate/g,
  transaction: /runTransaction|startTransaction/g,
  dotPathKey: /["'][a-zA-Z]+\.[a-zA-Z]+["']\s*:/g,
  push_pull: /_\.(push|pull|unset|remove)\b/g,
  admZipUse: /AdmZip[^\n]*/g,
  axiosUse: /axios[.(][^\n]*/g,
  cloudUse: /cloud\.[a-zA-Z]+\([^\n]*/g,
};
for (const k in pats) {
  const m = s.match(pats[k]) || [];
  console.log(k, m.length, JSON.stringify(m.slice(0, 6)));
}
// where().update / where().remove(批量) 检查
const chunks = s.split(".collection(");
let whereUpdate = 0, whereRemove = 0;
for (const c of chunks) {
  const head = c.slice(0, 400);
  if (/\.where\([\s\S]*?\.update\(/.test(head)) whereUpdate++;
  if (/\.where\([\s\S]*?\.remove\(/.test(head)) whereRemove++;
}
console.log("whereUpdate(approx)", whereUpdate, "whereRemove(approx)", whereRemove);
