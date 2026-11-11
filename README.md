# NEON 词境 · 四六级背单词

> 赛博朋克 × 二次元风格的四六级背单词网页 · **本页面由 小挽 制作 ♥ 给 CFOOOO**

一个纯前端、零依赖的背单词页面：双击 `index.html` 就能用，不需要装环境、不需要联网（词库已内置）。

![开门界面](preview/01-gate.jpg)

## 词库

| 词库 | 词数 | 说明 |
|---|---|---|
| 四级 | **4544** | CET-4 高频词 |
| 六级 | **2118** | 已剔除与四级重复的 1873 词 |

来源：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)。
原始词表里每个词重复出现多次（对应多套试卷），构建时已按词合并释义、清理超长重复、去掉四六级重叠词。
每个词包含：词性 + 中文释义（最多 4 条）+ 常用短语（最多 3 条）。

## 三种学习模式

点四级 / 六级卡片上的模式标签即可切换：

| 模式 | 玩法 |
|---|---|
| **四选一** | 显示单词（释义被遮住）+ 4 个释义选项，对错都有音效与红绿高亮 |
| **遮释义** | 显示单词，自己先回想，揭义后自评「想起来了 / 没想起来」 |
| **拼写** | 藏起英文，只给中文释义和首字母/长度提示（可点喇叭听发音），敲出正确拼写 |

## 功能

- **轻触开门**：赛博门 + 光环 + 漂浮字母 + 电流开门音效
- **合成音效**：Web Audio 实时合成（答对上升三连音 / 答错低沉锯齿 / 升级琶音 / 开门噪声），零音频文件、离线可响
- **发音朗读**：浏览器 TTS 念单词，可开关
- **掌握度 + 间隔复习**：答对 2 次升 1 级（共 5 级），答错降级；复习间隔 10 分钟 → 30 分钟 → 3 天 → 7 天 → 21 天
- **错题本**：答错自动收录并累加次数，答对自动移出，支持专项复习
- **每日目标**：默认 20 词（可改 5~200），首页进度环实时更新
- **打卡 + 连续天数**：每日打卡 +20 XP；首页 12 周热力图、「我的」页当月日历
- **XP / 等级**：答对 +12、答错 +1、打卡 +20，每 100 XP 升 1 级（带全屏升级特效）
- **会话总结**：每组结束给出题数 / 答对 / 正确率 / 获得 XP
- **键盘快捷键**：`空格` 揭示、`1-4` 选项、`Enter` 下一题、`S` 发音、`Esc` 返回
- **数据备份**：导出 / 导入 JSON、清空进度
- **响应式**：手机端底部导航自动只留图标

## 界面预览

| 首页 | 四选一 |
|---|---|
| ![首页](preview/02-home.jpg) | ![四选一](preview/03-learn-choice.jpg) |

| 答错反馈 | 遮释义自评 |
|---|---|
| ![反馈](preview/04-feedback.jpg) | ![遮释义](preview/06-reveal.jpg) |

| 拼写模式 | 错题本 |
|---|---|
| ![拼写](preview/05-spell.jpg) | ![错题本](preview/07-mistakes.jpg) |

| 会话总结 | 我的（日历 + 设置） |
|---|---|
| ![总结](preview/08-summary.jpg) | ![我的](preview/09-profile.jpg) |

## 本地使用

直接用浏览器打开 `index.html`。会先出现「轻触光环开门」的赛博门，点光环、按任意键或点门都能进。

> `words.js` 必须和 `index.html` 在同一目录，否则会提示「词库没有加载成功」。

## 部署到 GitHub Pages

1. 把本目录的文件推到 GitHub 仓库（默认分支 `main`）。
2. 仓库 `Settings → Pages`，**Source** 选 `Deploy from a branch`，Branch 选 `main` / `(root)`，保存。
3. 等一两分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

因为是纯静态页面，**不需要任何构建步骤**。

## 上传哪些文件

需要上传（共 4 个文件 + 2 个文件夹）：

```
index.html
styles.css
app.js
words.js
assets/          ← 6 张在用的图片（.webp）
preview/         ← README 里的 9 张预览图（.jpg）
README.md
CREDITS.md
.gitignore
```

**不要上传**（这些是本地开发用的，已在 `.gitignore` 里排除或在打包时剔除了）：

- `build_assets.py` —— 重新生成词库 / 压缩图片的脚本，依赖 `_data/`
- `_data/` —— 词库原始 TSV
- `编程入门手册.html`、`编程入门手册-说明.md`、`入门(1).md` —— 上一个项目的文件
- `tire.py`、`ArenaStudent-Windows/`、`围棋算法计分解析*` —— 无关文件

## 素材来源

立绘与背景取自本地二次元图片，已压缩为 WebP：

| 文件 | 用在哪 |
|---|---|
| `assets/hero-girl.webp` | 开门 / 首页背景（白毛蓝眼少女壁纸） |
| `assets/char-elysia.webp` | 首页「向导」立绘（**爱莉希雅**） |
| `assets/char-pink.webp` | 四级卡片背景（爱莉希雅） |
| `assets/char-yae.webp` | 六级卡片背景（八重神子） |
| `assets/bg-stars.webp` / `bg-stars2.webp` | 学习页 / 我的页背景（星空） |

想换图：把新图放进 `assets/`，改 `app.js` 里 `SCENES` 和 `LEVELS` 的图片路径即可。

## 数据存储

全部在浏览器 `localStorage`，键名 `neon-words-v1`。换浏览器 / 清缓存会丢，建议偶尔用「我的 → 导出」备份。

## 目录结构

```
index.html      入口（开门 + 全部界面）
styles.css      赛博霓虹 + 二次元样式
app.js          音效 / 出题 / 掌握度 / 打卡 / 错题本 / 快捷键
words.js        词库（4544 + 2118 词，约 1 MB）
assets/         图片资源
preview/        界面预览截图
README.md       本文件
CREDITS.md      第三方资源与版权说明
.gitignore
```

## 致谢

- 词库：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)
- 图片：个人收藏的二次元插画（原神 / 崩坏3 等），版权归原作者与发行方所有，仅作个人学习页面装饰使用
