/**
 * 初始化模块，依赖于Electron和OpenAI库。
 * 该模块负责管理插件的配置，创建OpenAI实例，并处理与渲染进程的通信。
 */

const fs = require("fs");
const path = require("path");
const { BrowserWindow, ipcMain, shell } = require("electron");

// 定义插件数据路径和设置文件路径
const pluginDataPath = LiteLoader.plugins["gpt_reply"].path.data;
const settingsPath = path.join(pluginDataPath, "settings.json");

// 定义默认设置
const defaultSettings = {
    api_key: "sk-9ab59e3267b54af0a4a4fa6d0f7bf94e",
    base_url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    model: "qwen-turbo",
    reply_mode: "reply-mode-copy",
    system_message:
        "你在回复群聊消息，请使用以下说话风格\n- 你说话言简意赅\n- 你喜欢用颜文字卖萌",
};

// 确保插件数据目录存在
if (!fs.existsSync(pluginDataPath)) {
    fs.mkdirSync(pluginDataPath, { recursive: true });
}

// 初始化或更新设置文件
if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 4));
} else {
    const currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (updateSettingsWithDefaults(currentSettings, defaultSettings)) {
        fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4));
    }
}

// 加载当前设置
const currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const apiKey = currentSettings.api_key || process.env.API_KEY;
const baseURL = currentSettings.base_url || process.env.BASE_URL || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

try {
    openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
    });
} catch (error) {
    openai = null;
}

/**
 * 使用默认值更新现有设置对象中的缺失键。
 * @param {Object} existingSettings - 需要检查和更新的当前设置对象。
 * @param {Object} defaultSettings - 包含所需键及其默认值的默认设置对象。
 * @returns {boolean} - 如果向现有设置中添加了任何键，则返回 true，否则返回 false。
 */
function updateSettingsWithDefaults(existingSettings, defaultSettings) {
    let updated = false;
    for (const key in defaultSettings) {
        if (!existingSettings.hasOwnProperty(key)) {
            existingSettings[key] = defaultSettings[key];
            updated = true;
        }
    }
    return updated;
}

/**
 * 打印日志信息
 * @param {...any} args - 需要打印的日志内容
 */
function log(...args) {
    console.log(`[GPT-Reply]`, ...args);
}

/**
 * 打开指定的网页
 * @param {string} url - 要打开的网页URL
 */
function openWeb(url) {
    shell.openExternal(url);
}

/**
 * 监控设置文件的更改
 * @param {Electron.WebContents} webContents - Electron的WebContents对象
 * @param {string} settingsPath - 设置文件的路径
 */
function watchSettingsChange(webContents, settingsPath) {
    fs.watch(
        settingsPath,
        "utf-8",
        debounce(() => {
            updateStyle(webContents, settingsPath);
        }, 100)
    );
}

// 处理设置更改的IPC消息
ipcMain.on(
    "LiteLoader.gpt_reply.watchSettingsChange",
    (event, settingsPath) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        watchSettingsChange(window.webContents, settingsPath);
    }
);

/**
 * 获取插件的配置信息
 * @returns {Object} 配置信息对象
 */
ipcMain.handle("LiteLoader.gpt_reply.getSettings", (event, message) => {
    try {
        const data = fs.readFileSync(settingsPath, "utf-8");
        const config = JSON.parse(data);
        return config;
    } catch (error) {
        log(error);
        return {};
    }
});

/**
 * 设置插件的配置信息
 * @param {Object} content - 新的配置信息
 */
ipcMain.handle("LiteLoader.gpt_reply.setSettings", (event, content) => {
    try {
        const new_config = JSON.stringify(content, null, 4);
        fs.writeFileSync(settingsPath, new_config, "utf-8");
    } catch (error) {
        log(error);
    }
});

/**
 * 打开指定的网页
 * @param {...string} message - 要打开的网页URL
 */
ipcMain.on("LiteLoader.gpt_reply.openWeb", (event, ...message) =>
    openWeb(...message)
);

/**
 * 将日志记录到主进程
 * @param {...any} args - 需要记录的日志内容
 */
ipcMain.handle("LiteLoader.gpt_reply.logToMain", (event, ...args) => {
    log(...args);
});

/**
 * 获取GPT回复
 * @param {Object} params - 包含system_message, prompt, model的参数对象
 * @returns {string} GPT回复内容
 */
ipcMain.handle("LiteLoader.gpt_reply.getGPTReply", async (event, params) => {
    try {
        const { system_message, prompt, model } = params;

        const data = {
            model: model,
            input: {
                messages: [
                    {
                        role: 'system',
                        content: system_message,
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            },
            parameters: {},
        };

        console.log("大王叫我来寻山");
        const response = await fetch(baseURL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        console.log(responseData);
        console.log(responseData.output.text);
        return responseData.output.text;
    } catch (error) {
        log(error);
        return {};
    }
});

/**
 * 流式获取GPT回复
 * @param {Object} params - 包含system_message, prompt, model的参数对象
 */
// ipcMain.handle("LiteLoader.gpt_reply.streamGPTReply", async (event, params) => {
//     try {
//         const { system_message, prompt, model } = params;
//         const completion = await openai.chat.completions.create({
//             messages: [
//                 { role: "system", content: system_message },
//                 { role: "user", content: prompt },
//             ],
//             model: model,
//             stream: true,
//         });

//         let chunkIdx = 0;
//         for await (const chunk of completion) {
//             const chunkContent = chunk.choices[0].delta?.content || "";
//             event.sender.send(
//                 "LiteLoader.gpt_reply.streamData",
//                 chunkContent,
//                 chunkIdx
//             );
//             chunkIdx++;
//         }
//     } catch (error) {
//         log(error);
//         event.sender.send("LiteLoader.gpt_reply.streamError", error.message);
//     }
// });

/**
 * 创建窗口时的触发事件
 * @param {Electron.BrowserWindow} window - Electron的BrowserWindow实例
 */
module.exports.onBrowserWindowCreated = (window) => {
    // window 为 Electron 的 BrowserWindow 实例
};