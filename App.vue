<script>
import { initLocalDb } from "./services/local-db";

export default {
  onLaunch: function () {
    // 应用启动时初始化本地数据库(加载各集合到内存)
    initLocalDb();
  },
};
</script>

<style>
/* 对应原 app.wxss 全局样式 */
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}

button {
  background: initial;
}

button:focus {
  outline: 0;
}

button::after {
  border: none;
}

page {
  background: #f6f6f6;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
</style>
