# 安装与首次使用

这份说明适合第一次安装浏览器扩展的用户。整个过程不需要编程，也不需要运行命令。

## 推荐：直接下载仓库

1. 打开[项目首页](https://github.com/ZZDDD/mokahr-autofill-extension)。
2. 点击绿色的 `Code` 按钮。
3. 点击 `Download ZIP`。也可以[直接点击这里下载](https://github.com/ZZDDD/mokahr-autofill-extension/archive/refs/heads/main.zip)。
4. 解压下载的 ZIP，得到 `mokahr-autofill-extension-main` 文件夹。

## 在浏览器中加载

把解压后的文件夹放在固定位置，例如“文档”目录。安装后不要移动或删除它。

### Chrome

1. 地址栏输入 `chrome://extensions` 并按回车。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `mokahr-autofill-extension-main` 文件夹。

### Edge

1. 地址栏输入 `edge://extensions` 并按回车。
2. 打开“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择 `mokahr-autofill-extension-main` 文件夹。

看到 `Mokahr Resume Autofill` 就安装成功了。Chrome 和 Edge 选择一个安装即可。

## 备选：下载 Release 精简包

如果只想下载扩展运行所需文件：

1. 打开 [Releases 页面](https://github.com/ZZDDD/mokahr-autofill-extension/releases/latest)。
2. 向下滚动到页面底部，在 `Assets` 区域下载 `mokahr-autofill-chrome-edge-v0.7.0.zip`。
3. 解压后，按照上面的 Chrome 或 Edge 步骤加载解压文件夹。

Release ZIP 同时支持 Chrome 和 Edge。不要直接选择 ZIP 安装，必须先解压。

## 准备简历资料

1. 点击浏览器工具栏右侧的扩展图标。若看不到，先点击拼图图标，再把 `Mokahr Resume Autofill` 固定到工具栏。
2. 点击“管理资料与附件”。
3. 在管理页填写基本信息、教育、实习、项目等内容。
4. 可选：选择一份附件简历。
5. 点击右上角“保存简历”，看到“保存完成”再关闭页面。

已有本扩展兼容的 JSON 时，也可以点击“导入 JSON”。导入后请检查页面显示的姓名、经历条数和日期是否正确。

## 自动填写

1. 打开 Mokahr 或飞书招聘的职位申请页面。
2. 等申请表单加载出来。
3. 点击扩展图标，再点击“填充当前页面”。
4. 等待完成提示，检查所有已填字段和“未匹配”项目。
5. 确认内容无误后，由你自己点击招聘页面的提交按钮。

扩展不会自动提交申请。证件、联系方式、日期、学校、公司和经历顺序必须人工复核。

## 升级新版本

1. 建议先在管理页“导出 JSON”备份资料。
2. 重新下载仓库 ZIP 或新的 Release 精简包并解压，覆盖原扩展文件夹，或解压到新的固定文件夹。
3. 打开 `chrome://extensions` 或 `edge://extensions`。
4. 在扩展卡片上点击“重新加载”。如果换了文件夹，先移除旧扩展，再用新文件夹“加载已解压的扩展程序”。
5. 刷新已经打开的招聘申请页。

## 常见问题

### 浏览器提示“清单文件缺失”

选错了文件夹。请选择打开后能直接看到 `manifest.json` 的那一层，不要选择 ZIP，也不要选择它的上级文件夹。

### 扩展按钮一直是灰色

确认当前页面是 `jobs.feishu.cn` 或 `mokahr.com` 的申请页，然后刷新申请页再打开扩展。刚升级扩展时，旧标签页必须刷新。

### 填写后有“未匹配”

不同公司的自定义字段和选项可能不同。已匹配内容仍会保留，请手动补充未匹配项并在提交前逐项检查。

### 我的资料会上传吗

扩展没有服务端、遥测或第三方上传代码。资料保存在当前浏览器配置文件的扩展本地存储中，但该存储不是密码加密保险箱，请勿在公用电脑保存简历。
