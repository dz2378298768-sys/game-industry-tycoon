# TapTap PC 包与登录

在 Windows 上执行 `npm ci`，再执行 `npm run package:pc`。输出为 `artifacts/pc-build/GameIndustryTycoon-Windows-x64-TapTap-compatible.zip`，启动项填写 `GameIndustryTycoon.exe`。压缩包根目录包含游戏程序和随包运行库，解压后可直接运行。使用 Windows ZIP 库打包，启动路径为压缩包根目录下的文件名。

登录采用中国区 TapTap 设备码扫码流程。Windows 包启动后在回环地址提供登录接口。开发环境和 Vite 本地预览使用同一套接口。单独部署静态网页时，需提供同源的登录服务。默认使用本游戏的 Client ID，可通过服务端环境变量 `TAPTAP_CLIENT_ID` 覆盖。

内存会话仅保存本应用账号标识与公开昵称，最长 24 小时。TapTap 凭证在校验后释放，游戏存档保存在本机。浏览器和 Windows 应用使用各自的本地存档空间。Windows 应用关闭后需要重新扫码。

已验证 Windows EXE 启动、真实设备码申请、真实二维码展示和取消。账号授权成功、退出和过期路径通过模拟服务响应验证。手机 TapTap 确认授权与 TapTap PC 内部测试需使用测试账号实测。

- [设备码扫码登录](https://developer.taptap.cn/docs/sdk/taptap-login/device-code/)
- [PC 包体规范](https://developer.taptap.cn/docs/pc-store/guide/pc-bundle/)
