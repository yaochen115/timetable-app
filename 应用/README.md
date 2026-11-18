# 林木应用源码

版本 Android 1.0.4 · 2026-11-16

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

输出为上级 `安装包/林木-Android-1.0.4.apk` 和 `构建校验.json`。构建日志为 `.build/build-log.json`。版本号从清单读取，发布新版本时修改清单的 versionName 和 versionCode。

构建校验通过后，`安装包/` 顶层只保留版本号最高的 APK 及其校验文件。旧 APK 移入 `安装包/历史版本/`。重建旧版本时，APK 也输出到历史目录。

1.0.0 的 Windows AAPT2 将嵌套资产路径打成 `assets/web\\index.html`，导致安卓请求 `web/index.html` 时读取失败，返回 HTTP 404。1.0.1 改为平铺资产，并与原生读取路径对齐。构建会直接读取最终 APK 的 ZIP 中央目录，禁止反斜杠路径，要求四份资源位于准确入口，并解压逐字节比对内容。校验失败时不输出发布 APK。

## 检查界面

```powershell
node .\应用\verify-app.mjs
```

使用本机现有 Chrome。沙箱环境可能需要批准无界面浏览器运行。输出在上级 `验收/安卓`，使用专用浏览器用户目录，不读取用户浏览器数据。

53 项检查覆盖正式界面与用户实际课表。精简格式检查包含无损还原、旧文字兼容、连续与单双周、特殊字符备注、空课表、损坏保护，以及正常入口新建、替换、恢复。测试依赖上级 `导入数据` 内用户课表的旧版与精简文字。原生桥接是浏览器模拟对象，设备上的 WebView、键盘、文件选择和剪贴板仍须验证。

## 数据与接口

共享数据保留 `linmu-schedules-v1` 存储结构。当前导出使用“林木2”文字，继续兼容旧 `LINMU1.` 编码与林木 JSON。顶层保存 `initialized`、`appearance`，每份课表保存 `weekOffset`。旧结构没有这些字段时，按已初始化、跟随系统和零偏移读取。

精简文字第一行为“林木2”，第二行为 `[课表名,起始日期,总周数,校准偏移]`，第三行为起止时间字符串数组。后续每行是一条课程数组 `[课程名,教师,地点,星期,起节,末节,周次串,颜色编号,备注]`，末尾默认颜色和空备注可以省略。JSON 原生处理引号和换行转义，中文无需 Base64。周次串支持 `1-16`、`1-4,6-16`、`1-15/2` 等，解码仍使用原有课程校验。

`encodeShareText` 和 `decodeShareText` 负责文字格式，`encodeWeeks` 和 `decodeWeeks` 转换短周次。原始用户课表精简文字位于上级 `导入数据/朱致远的课表-精简文字.txt`。实测4742字符变为1072字符，减少约77%，与旧格式解析结果完全一致。

- `LinmuNative.readState()` 同步读取应用私有目录中的 JSON。
- `LinmuNative.writeState(text)` 验证顶层格式并通过 `AtomicFile` 写入，成功返回 true。
- `LinmuNative.copyText(text)` 复制文字到系统剪贴板。
- `LinmuNative.setAppearance(value)` 更新状态栏、导航栏和背景颜色。
- `LinmuNative.hideKeyboard()` 在预览导入时请求安卓收起输入键盘。
- `window.linmuBack()` 处理返回键关闭面板。
- `linmu-resume` 事件刷新当前日期和自动周次，查看其他周时保留查看位置。

单份状态写入上限 4 MiB，单次导入文本上限 2 MiB。相同状态不会重复写入。写入失败会提示导出备份。主题和周数配置按已实现的数据结构保存，课表之间独立保存课程与作息。

导入先在副本中构造完整候选状态，原生保存成功后才更新当前内存和页面。保存失败保留原课表和预览，红字持续显示错误，可重试。导入按钮固定在预览底部，进入预览会释放文本焦点并请求收起键盘。普通提示在打开的 dialog 内显示，以进入对话框顶层。

## 当前设备验证状态

用户已确认安卓 1.0.1 可以预览，但点击导入无结果。1.0.2 调整导入过程，当前1.0.3进一步优化分享文字。模拟检查已通过，手机上的原始具体异常尚未取得，当前版本仍需覆盖安装回验。安装步骤见上级《安卓安装与验收.md》。
