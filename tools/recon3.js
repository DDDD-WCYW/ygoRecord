// 侦察脚本3:输出云函数顶层结构大纲(函数名/常量名及行号范围)
const fs = require("fs");
const src = fs.readFileSync("D:/迅雷下载/wx/miniprogram-1/cloudfunctions/ygoApi/index.js", "utf8");
const lines = src.split("\n");

const out = [];
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  let m;
  if ((m = line.match(/^(async function|function)\s+([A-Za-z0-9_]+)/))) {
    out.push({ line: i + 1, kind: "fn", name: m[2] });
  } else if ((m = line.match(/^const\s+([A-Za-z0-9_{,\s}]+?)\s*=/))) {
    out.push({ line: i + 1, kind: "const", name: m[1].trim() });
  } else if ((m = line.match(/^(exports\.[A-Za-z]+|module\.exports)/))) {
    out.push({ line: i + 1, kind: "export", name: m[1] });
  }
}
for (const item of out) {
  console.log(`${String(item.line).padStart(5)}  ${item.kind.padEnd(6)} ${item.name}`);
}
console.log("TOTAL_LINES", lines.length);
