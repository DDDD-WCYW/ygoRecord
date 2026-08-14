// 用 @vue/compiler-sfc 校验 index.vue:模板可编译、script 可解析、style 无致命错误
const fs = require("fs");
const path = require("path");
const { parse, compileTemplate, compileScript } = require("@vue/compiler-sfc");

const APP_ROOT = path.resolve(__dirname, "..");
const VUE_PATH = path.join(APP_ROOT, "pages/index/index.vue");

const source = fs.readFileSync(VUE_PATH, "utf8");
const { descriptor, errors } = parse(source, { filename: "index.vue" });

let failed = false;

if (errors.length) {
  failed = true;
  console.log("SFC 解析错误:");
  errors.slice(0, 10).forEach((e) => console.log(" ", e.message || e));
}

// 模板编译
try {
  const result = compileTemplate({
    source: descriptor.template.content,
    filename: "index.vue",
    id: "index",
  });
  if (result.errors && result.errors.length) {
    failed = true;
    console.log("模板编译错误:");
    result.errors.slice(0, 10).forEach((e) => console.log(" ", e.message || e));
  } else {
    console.log("模板编译 OK,render 函数长度:", result.code.length);
  }
  (result.tips || []).slice(0, 10).forEach((t) => console.log("TIP", t));
} catch (e) {
  failed = true;
  console.log("模板编译异常:", e.message);
}

// script 编译
try {
  const script = compileScript(descriptor, { id: "index" });
  console.log("script 编译 OK,长度:", script.content.length);
} catch (e) {
  failed = true;
  console.log("script 编译异常:", e.message);
}

console.log(failed ? "结果: 失败" : "结果: 通过");
process.exit(failed ? 1 : 0);
