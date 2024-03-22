import {
  Client,
  GroupMessageEvent,
  MessageElem,
  Sendable,
  createClient,
} from "@icqqjs/icqq";
import * as pluginUtil from "@potato/bot/util/plugin.ts";
import botConf from "@potato/config/bot.json";
import consola from "consola";
import schedule from "node-schedule";
import path from "path";
import * as groupModel from "../model/group.ts";
import { findActiveAccount } from "../model/qq.ts";
import { logger } from "./logger.ts";
import { sleep } from "./util.ts";

const bots: Array<Client | undefined> = [];
let masterBotUin: number | undefined = undefined;

//启动30秒后每5分钟检测一次bot是否在线
schedule.scheduleJob(`0 */5 * * * *`, async () => {
  await sleep(30000);
  bots.forEach(async (bot, index) => {
    if (!bot) {
      return;
    }
    //如果bot掉线
    for (let i = 0; i < 5; i++) {
      await sleep(5000);
      if (bot.isOnline()) {
        return;
      }
    }
    //移除bot
    bots[index] = undefined;
    //如果移除的bot是主bot，重新注册主bot
    if (bot.uin === masterBotUin) {
      masterBotListener();
    }
  });
  //如果没有可用bot，程序退出
  if (bots.filter((client) => client !== undefined).length === 0) {
    throw new Error("没有可用机器人");
  }
});

//登陆一个QQ账户
async function loginOneAccount(uin: number, password: string, order: number) {
  const ffmpegPath = path.resolve("data/resource/ffmpeg");
  const client = createClient({
    sign_api_addr: botConf.sign_api_addr,
    data_dir: botConf.data_dir,
    ffmpeg_path: `${ffmpegPath}/ffmpeg`,
    ffprobe_path: `${ffmpegPath}/ffprobe`,
    log_level: "info",
  });
  client
    .on("system.login.slider", async (v) => {
      const ticket = await consola.prompt(
        `\nQQ登陆 -> 输入Ticket\nbot -> ${uin}\nurl -> ${v.url}`,
        { type: "text" }
      );
      await client.submitSlider(ticket);
    })
    .on("system.login.device", async (_) => {
      await client.sendSmsCode();
      const smsCode = await consola.prompt(
        `\nQQ登陆 -> 输入短信验证码\nbot -> ${uin}`,
        {
          type: "text",
        }
      );
      await client.submitSmsCode(smsCode);
    });
  await client.login(uin, password);
  bots[order] = client;
}

//登陆所有QQ账户
async function loginAllAccount(
  accounts: { uin: number; password: string; order: number }[]
) {
  for (const account of accounts) {
    //跳过已登录过的QQ账户
    if (bots.find((bot) => bot !== undefined && bot.uin === account.uin)) {
      continue;
    }
    //登陆QQ账户
    await loginOneAccount(account.uin, account.password, account.order);
  }
}

//获取账户并登陆所有bot
async function login() {
  const activeAccount = await findActiveAccount();
  await loginAllAccount(activeAccount);
}

//获取在线bot
function getBots() {
  return bots.filter((client): client is Client => client !== undefined);
}

//发送群消息
async function sendGroupMsg(
  client: Client | undefined,
  gid: number,
  message: Sendable
) {
  if (client === undefined || client.getGroupList().get(gid) === undefined) {
    logger.error(
      `\n错误：群消息发送失败\n消息内容：${JSON.stringify(
        message
      )}\n群号：${gid}\n原因： client.getGroupList().get(gid)：${client
        ?.getGroupList()
        .get(gid)}`
    );
    return undefined;
  }
  return client.sendGroupMsg(gid, message).catch((e) => {
    logger.error(
      `\n错误：群消息发送失败\n消息内容：${JSON.stringify(
        message
      )}\n群号：${gid}\n原因：${JSON.stringify(e)}`
    );
  });
}

//回复群消息
async function replyGroupMsg(
  event: GroupMessageEvent,
  message: (string | MessageElem)[],
  quote: boolean = true
) {
  return event.reply([`\n`, ...message], quote).catch((e) => {
    logger.error(
      `\n错误：群消息回复失败\n消息内容：${message}\n原因：${JSON.stringify(e)}`
    );
  });
}

//主bot监听器
function masterBotListener() {
  masterBotUin = getMasterBot().uin;
  getMasterBot().on("message.group", async (event) => {
    //群消息去空格
    const raw_message = event.raw_message.replaceAll(" ", "");
    //过滤表情等特殊符号
    if (cleanupMsg(raw_message) === "") {
      return;
    }
    const vitsPlugin = pluginUtil.pickByName("vits");
    vitsPlugin.plugin(event);
  });
}

//初始化群Model
async function initGroupModel(client: Client) {
  const uins = client.getGroupList();
  for (const [uin] of uins) {
    await groupModel.findOrAddOne(uin);
  }
}

//监听器
function listener() {
  getBots().forEach(async (client) => {
    //自动接受邀请入群
    client.on("request.group.invite", async (event) => {
      await event.approve(true);
      await sleep(5000);
      await client.reloadGroupList();
      await groupModel.findOrAddOne(event.group_id);
      await groupModel.updateActiveGroup(event.group_id);
      logger.warn(
        `\n机器人账号 ${client.uin} 加入了群 ${event.group_id} ${event.group_name}`
      );
    });
    //管理员退群，机器人退群
    client.on("notice.group.decrease", async (event) => {
      if (
        botConf.admin.includes(event.user_id) ||
        bots.map((bot) => bot?.uin).includes(event.user_id)
      ) {
        await client.setGroupLeave(event.group_id);
        await sleep(5000);
        await client.reloadGroupList();
        await groupModel.updateDisableGroup(event.group_id);
        logger.warn(
          `\n机器人账号 ${client.uin} 退出了群 ${event.group_id} ${event.group.name}`
        );
      }
    });
  });
}

//去掉消息开头的某些字符
function msgNoCmd(msg: string, cmd: string[]) {
  return cmd.reduce(
    (acc, cur) =>
      cleanupMsg(acc.replace(new RegExp(`(^\\s*${cur}\\s*)`, "g"), "")),
    msg
  );
}

function cleanupMsg(msg: string) {
  return msg
    .trim()
    .replace(new RegExp(`(\\[\\])|(\\[(.+?)\\])`, "g"), "")
    .replace(/(\r+)/g, "\r")
    .replace(/\s+/g, " ");
}

function getMasterBot() {
  const bot = getBots()[0];
  if (bot === undefined) {
    throw new Error("没有在线机器人");
  }
  return bot;
}

function getBotByUin(uin: number) {
  return getBots().filter((client) => client.uin === uin)[0];
}

function groupInfo(gid: number) {
  return getMasterBot().getGroupList().get(gid);
}

//初始化bot，登陆所有QQ账户
async function init() {
  await login();
  await sleep(10000);
  masterBotListener();
  listener();
  await initGroupModel(getMasterBot());
}

async function secondCmd(
  trigger: string,
  msg: string,
  cmdList: Array<{
    name: string;
    auth: boolean;
    comment: string;
    plugin: (
      message: string,
      event: GroupMessageEvent,
      pluginName: string
    ) => Promise<void>;
  }>,
  event: GroupMessageEvent
) {
  for (const cmd of cmdList) {
    if (!msg.startsWith(cmd.name)) {
      continue;
    }
    if (
      cmd.auth &&
      event.sender.role === "member" &&
      !botConf.admin.includes(event.sender.user_id)
    ) {
      await replyGroupMsg(event, [
        "您使用的命令需要群管理员权限，请联系群管理员。",
      ]);
      return;
    }
    cmd.plugin(msg, event, cmd.name);
    return;
  }
  const intro = cmdList
    .map(
      (cmd) =>
        `指令：${trigger} ${cmd.name}\n说明：${cmd.comment}\n需要管理员权限:${
          cmd.auth ? "是" : "否"
        }`
    )
    .join("\n\n");
  await replyGroupMsg(event, [intro]);
}

export {
  cleanupMsg,
  getBotByUin,
  getBots,
  getMasterBot,
  groupInfo,
  init,
  msgNoCmd,
  replyGroupMsg,
  secondCmd,
  sendGroupMsg,
};
