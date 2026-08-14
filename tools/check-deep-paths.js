// 检查模板中的深层属性路径(a.b.c),Vue 对中间层 undefined 会抛错,需确认 data 初始结构完整
const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const vue = fs.readFileSync(path.join(APP_ROOT, "pages/index/index.vue"), "utf8");
// 模板内部也有 </template> 闭合标签(block 转换产物),按 <script> 截取才是完整模板
const tpl = vue.slice(0, vue.indexOf("<script>"));

const deep = new Set();
for (const m of tpl.matchAll(/([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)/g)) {
  deep.add(`${m[1]}.${m[2]}`);
}
console.log("模板中的二级前缀(出现 a.b.c 形式):");
console.log([...deep].sort().join("\n"));

// 对照 data 初始值:从 script 中提取 pageConfig.data 的顶层键
const script = vue.slice(vue.indexOf("<script>"), vue.indexOf("</script>"));
const dataStart = script.indexOf("const pageConfig = {");
const dataBlock = script.slice(dataStart, dataStart + 6000);
console.log("\n---- pageConfig.data 片段(前 80 行) ----");
console.log(dataBlock.split("\n").slice(0, 80).join("\n"));
