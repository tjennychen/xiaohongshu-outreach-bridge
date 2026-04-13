# 小红书外联自动化 / Xiaohongshu Outreach Bridge

从千瓜数据到小红书触达，全链路自动化。

Bridges [Qian Gua](https://qian-gua.com) (千瓜), a Chinese influencer analytics platform, with [Xiaohongshu](https://xiaohongshu.com) (小红书 / Little Red Book) for influencer outreach campaigns. Automates the full pipeline from influencer discovery through profile screening to personalized comment outreach, while evading one of the most hostile anti-bot platforms in the world.

## 技术栈 / Tech Stack

- **Node.js + Playwright** CDP浏览器自动化 / CDP-based browser automation
- **Python + mitmproxy** 拦截并转换小红书分享链接 / intercepting and converting XHS share links
- **iPhone Mirroring + cliclick** 真机自动化（分享链接采集） / physical device automation for share link capture
- **SQLite** 外联状态追踪 / tracking outreach state (profiles, posts, comments)

## 架构 / Architecture

```
千瓜 (Qian Gua)                 数据桥接                  小红书 (Xiaohongshu)
 品牌搜索 brand search    -->   目标筛选 filtering    -->   主页浏览 profile nav
 达人列表 influencer list -->   等级分类 tier class   -->   简介提取 bio extraction
 互动数据 engagement data -->   SQLite 持久化         -->   评论发布 comment posting
                                                     -->   频率监控 rate limiting
```

### 1. 发现 / Discovery (千瓜)

通过CDP端口9222连接到运行中的Chrome浏览器。导航千瓜品牌分析页面，拉取达人列表及互动数据、等级分类（素人 / 初级达人 / 腰部达人 / 头部达人）和商业合作记录。

Connects to a running Chrome session via CDP port 9222. Navigates Qian Gua's brand analytics pages to pull influencer lists with engagement metrics, tier classifications, and sponsorship history.

### 2. 筛选 / Filtering & Screening

通过关键词匹配自动分类达人。过滤掉品牌号、店铺号、新闻号和粉丝群账号（商业关键词检测）。通过个人特征信号（MBTI类型、星座、生活方式标签）优先定位真实用户。

Automatically classifies influencers via keyword matching. Filters out brand accounts, store fronts, news outlets, and fan clubs. Prioritizes real users via personal keyword signals (MBTI, zodiac signs, lifestyle markers).

### 3. 链接转换 / Share Link Conversion

将千瓜发现的URL转换为可分享的 xhslink.com 链接，两种方式：

- **mitmproxy 拦截**: 运行 `mitmdump` 作为本地代理，从小红书API响应中捕获分享码
- **iPhone Mirroring 自动化**: 通过 cliclick 坐标点击驱动真机小红书App（Safari地址栏 → 打开App → 分享面板 → 复制链接）

### 4. 小红书触达 / XHS Outreach

通过CDP连接Chrome，导航到每位达人的小红书主页，打开最新笔记，留下个性化评论。使用 `keyboard.type()` 配合逐字延迟（80ms）模拟真人打字速度。

Connects to Chrome via CDP, navigates to each influencer's profile, opens their latest post, and leaves a personalized comment with human-speed typing simulation.

## 反检测策略 / Anti-Bot Evasion

**反自动化检测。** 小红书的反爬策略极其激进。系统实时监控验证码触发、频率限制警告和账号异常信号（验证、滑块、操作频繁、账号异常）。一旦出现红旗信号，立即停止并退避。

**打字模拟。** 小红书评论框使用 `contenteditable` div，非标准表单输入。直接注入会被检测。解决方案：用 `force: true` 点击占位符覆盖层激活评论框，再用 Playwright 的 `keyboard.type()` 配合真实的按键间隔。

**行为节奏控制。** 每个操作之间加入符合人类习惯的等待时间：页面加载、滚动停顿、分享面板动画。系统每次只操作一个标签页，跨会话分散外联节奏，保持在检测阈值之下。

**CDP会话复用。** 不启动无头浏览器（秒被检测），所有自动化连接到已登录千瓜和小红书的真实Chrome会话。

## 使用方法 / Usage

需要Chrome以 `--remote-debugging-port=9222` 运行，并已登录千瓜和小红书。

```bash
# 初始化外联数据库
python3 init_db.py

# 批量外联（搜索、筛选、评论）
node batch_comment_v2.mjs

# 通过 mitmproxy 捕获分享链接
mitmdump --listen-port 8080 -s capture_share_links.py

# 通过 iPhone Mirroring 自动化捕获分享链接
python3 xhs_auto.py urls.txt
```

---

Built by [Jenny Chen](https://linkedin.com/in/tjennychen)
