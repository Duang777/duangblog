# 选题本

每条先写现象，再写想搞清什么。够具体再开成 `src/content/posts/` 里的文章。

格式：

```text
## YYYY-MM-DD 短标题（可选）
现象：
想搞清：
归属：后端专栏 / 请求过境 | Agent 拆解 | 随笔
材料：（文档链接、仓库路径、日志关键词）
状态：念头 | 写作中 | 已发
```

---

## 例子（可删）

### 2026-07-25 第二次请求偶发断
现象：第一次 OK，keep-alive 复用后偶发断开
想搞清：IdleTimeout 和代理 idle 是否不一致
归属：后端专栏 / 请求过境
材料：net/http.Server IdleTimeout；Nginx keepalive_timeout
状态：念头
