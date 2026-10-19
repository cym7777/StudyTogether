# 免费部署与维护

核实日期：2026-10-11；本次在控制台实际看到 Workers Free 下的“Current plan”和 $0。未购买域名、服务器、数据库订阅或其他服务。

已发布地址：https://study-together-d4ab8e13f7a3.study-together.workers.dev

固定已有资源（以后只更新，不能重复创建）：

- Worker：`study-together-d4ab8e13f7a3`
- D1：`study-together-d4ab8e13f7a3`，ID `4bb34246-8e02-4030-8a68-5304533a5955`；平台创建时返回 WNAM，不是大陆机房。
- 账号 ID 与 DB ID 在 `wrangler.jsonc`，不是管理员密钥。网页无这些授权凭据。
- OAuth 登录保存在本机系统钥匙串，不进源码/压缩包。授权仅请求账号读取、Workers 脚本写入和 D1 写入；控制台可撤销。

## 风险和免费额度

Workers Free 每天 100,000 请求、每次 10ms CPU；D1 每天读 500 万行、写 10 万行，单库 500MB，账号合计 5GB，免费 Time Travel 7 天。超限拒绝查询，不要升级套餐。平台免费政策可能改变，不承诺任何商业服务永久不变。

依据：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。没有查到七天低活跃删除/暂停 D1 的同类政策，但这不是永久数据保留保证；始终另存 JSON/SQL 备份。

大陆访问无法保证。本机 Node 直连 workers.dev 超时，使用已存在的 127.0.0.1:7897 系统代理可返回 HTTP 200。这是有条件的访问验证，不是大陆直连验收。没有为解决访问问题购买网络服务或域名。若三人的直连都失败，此方案不适合实际使用，应保留源码/数据，重新讨论免费平台或已拥有的免费资源，不擅自启用收费方案。

## 更新部署（开发者操作）

本地软件运行只需 Node 24+，没有运行时 npm 依赖。仅部署工具是锁定版本 `wrangler 4.149.0` 的开发依赖，锁文件与 pnpm 构建白名单一并保存。

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login --scopes account:read user:read workers_scripts:write d1:write --use-keyring
node --test tests/*.test.mjs
pnpm exec wrangler deploy --dry-run
# 仅有新增迁移时执行；先导出数据，确认当前账号仍是 Workers Free
pnpm exec wrangler d1 migrations apply study-together-d4ab8e13f7a3 --remote
pnpm exec wrangler deploy
```

不要在网页里填写密钥。不要运行 `d1 create` 新建第二个正式数据库；不要删除已应用迁移或删库重建。固定 ID 不变，姓名修改不影响历史。

本机当前环境可用 Codex 自带 Node 和 pnpm 路径（参见 `TEST_RESULTS.md`）；普通电脑安装官方免费 Node 24+ 和 pnpm 后使用上面命令。首次授权缺失 workers_scripts 权限的问题已通过重新授权处理，不需要扩大到支付、R2、AI 等权限。

## 额外离线 SQL 备份 / 大文件迁移

界面 JSON 最易用。大 JSON 恢复超过 16MB、批处理超过 40 条，或触碰免费 CPU 上限时，保留文件，在本地恢复后迁移；不能自动切换收费计算。

开发者可绕过 Worker 导出逻辑，直接使用平台免费 D1 导出：

```sh
pnpm exec wrangler d1 export study-together-d4ab8e13f7a3 --remote --output=StudyTogether-full-backup.sql
```

SQL 文件含私人学习记录，不上传公共仓库。恢复 SQL 有覆盖风险，必须先保存当前 JSON/SQL、明确目标并审核 SQL，不能直接对在用库重复导入。Time Travel 仅是七天内的辅助恢复，不能替代长期独立备份。

页面删除是软删除，会自动维护统计。不要直接用 SQL 硬删除业务行：当前日计数触发器只服务正常新增/更新/软删除，人工硬删除后需从实际任务/总结重建对应 day_activity 并推进 sync_state，再对照原记录验证首页和统计。开发者测试清理已按此处理；日常使用不要执行全库清空或手改派生表。

`tests/cloud.mjs` 会写测试数据，**只允许显式对全新空库运行**。正式库已有记录后不要再运行。一般维护用本地隔离测试和公网只读检查即可。
