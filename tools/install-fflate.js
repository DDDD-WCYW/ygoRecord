// 用 Node 调 npm 安装 fflate(规避 PowerShell/cmd 中文路径与引号问题)
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const pkgFile = path.join(root, "package.json");
if (!fs.existsSync(pkgFile)) {
  fs.writeFileSync(
    pkgFile,
    JSON.stringify(
      {
        name: "ygo-app",
        version: "1.0.0",
        private: true,
        dependencies: {},
      },
      null,
      2
    )
  );
}

const out = execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "fflate", "--no-audit", "--no-fund"],
  { cwd: root, encoding: "utf8", shell: true }
);
console.log(out);
console.log(
  "fflate version:",
  require(path.join(root, "node_modules/fflate/package.json")).version
);
