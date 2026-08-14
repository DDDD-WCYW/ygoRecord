// 安装开发期校验依赖 @vue/compiler-sfc(仅 devDependency,不参与打包)
const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = execFileSync(
  "npm.cmd",
  ["install", "--save-dev", "@vue/compiler-sfc@^3.4.0", "--no-audit", "--no-fund"],
  { cwd: root, shell: true, encoding: "utf8" }
);
console.log(output);
console.log("version:", require("@vue/compiler-sfc/package.json").version);
