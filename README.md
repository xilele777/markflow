# 灵枢工作区

灵枢数据标注平台：React 前端 + Node.js / TypeScript 后端。

**当前状态：M0–M5 核心流程已通过本地验收，仍有规划差异待收口，M6 部署准备完成；生产部署、历史数据迁移和业务切换尚未完成。服务器就绪前不部署，CD 保持关闭。**

- [文档总入口](docs/README.md)：规划、验收证据、遗留事项与目录约定。
- [后端](lingshu-server/README.md)：本地开发、接口、配置和部署手册。
- [前端](lingshu-web/README.md)：开发规范、构建、浏览器验收和样例位置。

## 目录

```text
label/
  docs/             跨仓库规划、验收、交接和参考资料
  lingshu-server/    当前后端，独立 Git 仓库
  lingshu-web/       当前前端，独立 Git 仓库
  LabelHub/         旧系统，保留供核对和后续切换回退
  submission/       原始交付资料，保留作为接口与业务规格来源
```

工作区根目录本身不是 Git 仓库，根 README 与根 docs 目前只保存在本机，需随工作区备份。前后端各自的 docs 跟随对应仓库版本管理；运行命令在各仓库根目录执行。
