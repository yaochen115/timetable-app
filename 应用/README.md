# 林木应用源码

版本 Android 1.0.1 · 2026-11-07

## 实现

`web` 保存共享 HTML、CSS、JavaScript，Android 容器用 Java 和系统 WebView 接入。用户确认的视觉稿与后续多平台界面共用同一种前端技术。当前已经构建 Android，iOS 在用户确认安卓后推进。

Android 通过 `WebViewClient.shouldInterceptRequest` 将 `https://linmu.local/` 的固定资源映射到 APK 的资产根目录。例如 `/index.html` 对应 `assets/index.html`，由 `getAssets().open("index.html")` 读取。应用没有 HTTP 服务，也未申请网络权限。入口仅加载内置页面，资源白名单为 HTML、CSS、JavaScript 和 SVG。[Android 本地内容文档](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)

## 目录

- `web` 为正式应用界面与课表逻辑，首次为空课表。
- `android` 为清单、启动图标和原生容器。
- `build-android.mjs` 为构建入口，使用现有 SDK 与 JDK 工具。
- `verify-app.mjs` 为共享界面和桥接契约检查，使用已有 Chrome。
- `.signing` 保存本项目 APK 签名密钥和密码文件。
- `.runtime` 保存平台 JAR 副本、浏览器数据和工具临时配置。
- `.build` 保存编译中间产物、资源包与构建日志。

签名目录应随项目保留，后续覆盖更新依赖同一把密钥。公开分发材料使用上级 `安装包` 里的 APK。

## 重新构建

在「课表」目录运行。

```powershell
node .\应用\build-android.mjs
```

默认读取已有的 `D:\WORK\java26` 与 `D:\WORK\丢给ai玩\android-sdk`。使用 JDK 26、Build Tools 36.0.0、Android 36 平台 JAR，应用目标 SDK 为 35，最低 SDK 为 26。没有新下载依赖。

路径改变时，可设置以下两个环境变量后重新构建。

```powershell
$env:LINMU_JAVA_HOME = 'D:\WORK\java26'
$env:LINMU_ANDROID_SDK = 'D:\WORK\丢给ai玩\android-sdk'
node .\应用\build-android.mjs
```

构建依次执行脚本语法检查、AAPT2 资源编译链接、javac、D8、ZIP 对齐和 APK 签名。输出之前验证签名、对齐、应用清单和权限。SDK 部分原生命令不支持中文绝对参数，构建脚本为它们使用项目内 ASCII 相对路径。平台 JAR 读取后复制到项目内使用。[Android 签名工具文档](https://developer.android.com/tools/apksigner)

输出为上级 `安装包/林木-Android-1.0.1.apk` 和 `构建校验.json`。构建日志为 `.build/build-log.json`。版本号从清单读取，发布新版本时修改清单的 versionName 和 versionCode。

1.0.0 的 Windows AAPT2 将嵌套资产路径打成 `assets/web\\index.html`，导致安卓请求 `web/index.html` 时读取失败，返回 HTTP 404。1.0.1 改为平铺资产，并与原生读取路径对齐。构建会直接读取最终 APK 的 ZIP 中央目录，禁止反斜杠路径，要求四份资源位于准确入口，并解压逐字节比对内容。校验失败时不输出发布 APK。

## 检查界面

```powershell
node .\应用\verify-app.mjs
```

使用本机现有 Chrome。沙箱环境可能需要批准无界面浏览器运行。输出在上级 `验收/安卓`，使用专用浏览器用户目录，不读取用户浏览器数据。

36 项检查覆盖正式界面的首次配置、真实日期、自动周次、校准、原生存储契约、编辑、复制、删除、课表隔离、导入导出、坏数据保护、时间约束、手机、平板、横屏和真实触摸事件模拟。原生桥接在该检查中是浏览器模拟对象，设备安装、WebView 行为、系统文件选择和剪贴板仍须在安卓设备验证。

## 数据与接口

共享数据保留 `linmu-schedules-v1` 结构和 `LINMU1.` 文字编码兼容。新增顶层 `initialized`、`appearance`，每份课表新增 `weekOffset`。旧结构没有这些字段时，按已初始化、跟随系统和零偏移读取。

- `LinmuNative.readState()` 同步读取应用私有目录中的 JSON。
- `LinmuNative.writeState(text)` 验证顶层格式并通过 `AtomicFile` 写入，成功返回 true。
- `LinmuNative.copyText(text)` 复制文字到系统剪贴板。
- `LinmuNative.setAppearance(value)` 更新状态栏、导航栏和背景颜色。
- `window.linmuBack()` 处理返回键关闭面板。
- `linmu-resume` 事件刷新当前日期和自动周次，查看其他周时保留查看位置。

单份状态写入上限 4 MiB，单次导入文本上限 2 MiB。相同状态不会重复写入。写入失败会提示导出备份。主题和周数配置按已实现的数据结构保存，课表之间独立保存课程与作息。

## 当前设备验证状态

用户已经在手机上反馈 1.0.0 启动出现 HTTP 响应错误，包内路径问题已定位并修复。1.0.1 已生成并通过包内资源检查，等待用户覆盖安装回验。安装步骤和验收清单见上级《安卓安装与验收.md》。后续先基于安卓反馈修复，再做 iOS 容器和平台接入。
