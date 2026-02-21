## 构建

```bash
pnpm -F @moltbot-china/dingtalk build
```

## 发布

- 不带版本号递增的发布：
```bash
pnpm -F @moltbot-china/dingtalk release
```

- 带版本号递增的发布：
```bash
pnpm -F @moltbot-china/dingtalk release:patch
pnpm -F @moltbot-china/dingtalk release:minor
pnpm -F @moltbot-china/dingtalk release:major
```
