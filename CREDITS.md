# CREDITS · 第三方资源说明

## 词库

- **来源**：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)
- **使用范围**：`full_line_tsv/simple/正序/四级.txt`、`六级.txt`
- **处理方式**：按词合并（原始文件每词重复多次）、去重、清理超长释义、剔除四六级重叠词
- **结果**：四级 4544 词、六级 2118 词，输出到 `words.js`

该词库为公开分享的学习资源，版权归原作者。本页面仅将其转为前端可读格式用于个人学习。

## 图片资源

`assets/` 下的立绘与背景来自个人收藏的二次元插画（原神、崩坏3 等作品角色），
压缩为 WebP 后用于页面装饰。**角色形象与插画版权归原作者、画师及发行方所有**，
本项目仅作个人学习用途，不作商业使用。如有侵权请联系删除。

角色对应：

| 文件 | 角色 |
|---|---|
| `char-elysia.webp` | 爱莉希雅（Honkai Impact 3rd） |
| `char-pink.webp` | 爱莉希雅（Honkai Impact 3rd） |
| `char-yae.webp` | 八重神子（Genshin Impact） |
| `hero-girl.webp` | 二次元少女壁纸 |
| `bg-stars.webp` / `bg-stars2.webp` | 星空背景 |

## 代码

页面代码（`index.html` / `styles.css` / `app.js`）由 **小挽** 编写，可自由修改使用。

## 音效

全部由浏览器 Web Audio API 实时合成，**没有使用任何外部音频文件**，因此不涉及音频版权。

## 字体

不加载任何网络字体，使用系统自带字体（PingFang SC / 微软雅黑 / Bahnschrift 等），
`Bahnschrift` 只用于英文与数字装饰。
