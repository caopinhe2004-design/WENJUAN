# 两个人的一页

情侣问卷与双人实时小游戏 PWA。

## 目录

```text
.
├─ index.html              # 页面入口
├─ manifest.webmanifest    # PWA 配置
├─ sw.js                   # Service Worker
├─ js/
│  ├─ core/                # 基础应用、双人实时、PWA、设置
│  └─ features/            # 轮次、历史、界面和玩法增强
├─ css/                    # 全部样式
├─ banks/                  # 问卷题库
├─ icons/                  # 当前 PWA 图标
├─ tests/                  # Playwright E2E
├─ scripts/                # CI/题库检查脚本
└─ .github/workflows/      # GitHub Pages CI
```

`js/core/runtime.js` 是统一的交互与双人稳定性运行时。旧的导航、Presence、恢复、自定义选项等补丁文件已移除，不再通过多层覆盖维持功能。
