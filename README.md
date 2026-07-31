# Desmos Graphing Calculator for VS Code

在 VS Code 编辑器区域中离线使用 Desmos 图形计算器的扩展。

> 本扩展将本地 Desmos 图形计算器嵌入 VS Code Webview，不需要连接 Desmos 网站即可绘制和保存函数图形。

## 功能

- 在编辑器区域打开独立的 Desmos 计算器标签页
- 绘制函数、参数方程、数据表和表达式
- 打开、保存及另存为 `.des` 图形状态文件
- 将当前图形导出为 PNG 图片
- 使用自定义编辑器直接打开 `*.des` 文件
- 完全离线运行

## 使用方式

### 打开计算器

使用以下任一方式打开计算器：

1. 按 `Ctrl+Shift+P`，运行 **Desmos：打开计算器**。
2. 点击任意代码编辑器右上角的 Desmos 小图标；如果图标被折叠，点击 `...` 后选择 **Desmos：打开计算器**。

计算器会作为独立标签页显示在代码编辑器区域，不会占用左侧侧边栏。

### 打开 `.des` 文件

在 VS Code 中直接打开扩展名为 `.des` 的文件，扩展会自动使用 Desmos 图形编辑器加载它。

`.des` 文件是 Desmos 图形状态的 JSON 文件，可以包含表达式、表格、视口和图形配置。

### 文件操作

计算器顶部工具栏包含：

| 操作 | 说明 |
| --- | --- |
| 新建 | 清空当前图形 |
| 打开 | 选择已有 `.des` 文件并加载 |
| 保存 | 保存当前图形状态 |
| 另存为 | 保存为新的 `.des` 文件 |
| 导出 PNG | 导出当前图形截图 |

## 开发

### 环境要求

- VS Code `^1.70.0`
- Node.js（用于语法校验和调试扩展）

### 本地调试

1. 在 VS Code 中打开本项目目录。
2. 按 `F5` 启动扩展开发宿主。
3. 在新打开的 VS Code 窗口中运行 **Desmos：打开计算器**。

如果使用软链接方式安装开发版本，修改文件后执行 **开发人员：重新加载窗口** 即可加载最新代码。

### 项目结构

```text
.
├── extension.js                 # 扩展入口与 VS Code API 注册
├── calculator.js                # 本地 Desmos 图形计算器运行库
├── webview.css                  # Webview 页面样式
├── resources/                   # 产品与命令图标
└── src/
    ├── host/                    # 扩展宿主逻辑
    │   ├── desmosDocument.js    # 文档状态模型
    │   ├── desmosEditorProvider.js # Webview 与自定义编辑器生命周期
    │   ├── fileService.js       # 文件读写与文件选择对话框
    │   ├── messageRouter.js     # Webview 消息路由
    │   └── webviewHtml.js       # Webview HTML 与 CSP 构建
    └── webview/
        └── app.js               # 计算器页面交互逻辑
```

## 设计说明

- Webview 只负责 Desmos UI 和用户交互，不直接访问本地文件系统。
- 文件选择、读写和导出均由 VS Code Extension Host 处理。
- Webview 与扩展宿主通过消息机制通信。
- `calculator.js` 是第三方打包运行库；业务代码位于 `src/`，不建议直接修改该库。

## 许可

本项目采用仓库中 [`LICENSE`](LICENSE) 文件所述的许可协议。Desmos 名称、商标及其图形计算器相关权利归各自权利人所有。
