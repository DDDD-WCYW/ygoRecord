// 侦察 index.wxml 的指令/绑定特性分布,确定 build-index-vue 转换规则覆盖面
const fs = require("fs");
const s = fs.readFileSync(
  "D:/迅雷下载/wx/miniprogram-1/miniprogram/pages/index/index.wxml",
  "utf8"
);
const pats = {
  "wx:if": /wx:if=/g,
  "wx:elif": /wx:elif=/g,
  "wx:else": /wx:else/g,
  "wx:for": /wx:for=/g,
  "wx:for-item": /wx:for-item=/g,
  "wx:for-index": /wx:for-index=/g,
  "wx:key": /wx:key="([^"]+)"/g,
  block: /<block/g,
  bindtap: /bindtap=/g,
  catchtap: /catchtap=/g,
  "bind:tap": /bind:tap=/g,
  bindinput: /bindinput=/g,
  bindblur: /bindblur=/g,
  bindfocus: /bindfocus=/g,
  bindconfirm: /bindconfirm=/g,
  bindchange: /bindchange=/g,
  bindscroll: /bindscroll=/g,
  bindload: /bindload=/g,
  binderror: /binderror=/g,
  bindtouch: /bindtouch\w+=/g,
  bindlongpress: /bindlongpress=/g,
  catchtouchmove: /catchtouchmove=/g,
  hidden: /\shidden=/g,
  "混合class": /class="[^"{]*\{\{/g,
  "纯绑定class": /class="\{\{[^"]*\}\}"/g,
  "混合style": /style="[^"{]*\{\{/g,
  "纯绑定style": /style="\{\{[^"]*\}\}"/g,
  "model:value": /model:value=/g,
  scrollview: /<scroll-view/g,
  picker: /<picker/g,
  textarea: /<textarea/g,
  input: /<input/g,
  image: /<image/g,
  canvas: /<canvas/g,
  swiper: /<swiper/g,
  slider: /<slider/g,
  switch: /<switch/g,
  checkbox: /<checkbox/g,
  radio: /<radio/g,
  form: /<form/g,
  navigator: /<navigator/g,
  "rich-text": /<rich-text/g,
  template: /<template/g,
  wxs: /<wxs/g,
  include: /<include/g,
  import: /<import/g,
};
const lines = s.split(/\r?\n/);
console.log("总行数:", lines.length);
for (const key in pats) {
  const m = s.match(pats[key]) || [];
  console.log(key, m.length);
}
// wx:key 的值分布
const keyVals = new Set();
let m;
const keyRe = /wx:key="([^"]+)"/g;
while ((m = keyRe.exec(s))) keyVals.add(m[1]);
console.log("wx:key 值:", [...keyVals].join(", "));
// wx:for-item 的值分布
const itemVals = new Set();
const itemRe = /wx:for-item="([^"]+)"/g;
while ((m = itemRe.exec(s))) itemVals.add(m[1]);
console.log("wx:for-item 值:", [...itemVals].join(", "));
// 所有 bind/catch 事件名
const evVals = new Set();
const evRe = /(bind|catch):?(\w+)=/g;
while ((m = evRe.exec(s))) evVals.add(m[1] + ":" + m[2]);
console.log("事件:", [...evVals].join(", "));
// 混合 class 示例
const mixRe = /class="[^"{]*\{\{[^"]*"/g;
const mixed = s.match(mixRe) || [];
console.log("混合class示例(前5):");
mixed.slice(0, 5).forEach((item) => console.log(" ", item));
