// 校验 services 下所有 ESM 模块语法(node --check 需要 .mjs 后缀)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SERVICES = path.resolve(__dirname, "../services");
const files = fs
  .readdirSync(SERVICES)
  .filter((name) => name.endsWith(".js") && !name.endsWith(".check.mjs"));

let failed = 0;
for (const name of files) {
  const source = fs
    .readFileSync(path.join(SERVICES, name), "utf8")
    // 相对导入补 .js 后缀 + fflate 指到 node_modules 实际入口,保证 --check 可解析
    .replace(/from "\.\/([\w-]+)"/g, 'from "./$1.js"')
    .replace('from "fflate"', 'from "../node_modules/fflate/esm/browser.js"');
  const tempFile = path.join(SERVICES, name + ".check.mjs");
  fs.writeFileSync(tempFile, source);
  try {
    execFileSync(process.execPath, ["--check", tempFile], { stdio: "pipe" });
    console.log("OK  ", name);
  } catch (error) {
    failed += 1;
    console.log("FAIL", name);
    console.log(String(error.stderr || error.message));
  } finally {
    fs.unlinkSync(tempFile);
  }
}
process.exit(failed ? 1 : 0);
