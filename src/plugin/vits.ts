import { GroupMessageEvent, segment } from "@icqqjs/icqq";
import { Random } from "random-js";
import * as aiModel from "../model/ai";
import { getMasterBot, sendGroupMsg } from "../util/bot";
import { createChat } from "../util/chat";
import { say } from "../util/say";

const info = {
  name: "vits",
  type: "plugin",
  defaultActive: true,
  passive: true,
  comment: [`说明：vits`],
  plugin: plugin,
};

async function plugin(event: GroupMessageEvent) {
  if (event.atme) {
    await sendVitsMsg(event);
    return;
  }
  const random = new Random();
  if (random.bool(7)) {
    await sendVitsMsg(event);
    return;
  }
}

async function sendVitsMsg(event: GroupMessageEvent) {
  const aiFindOne = await aiModel.findOne("阿梓");
  if (aiFindOne === null) {
    return;
  }
  const text = await createChat(event.raw_message, aiFindOne.prompt);
  if (text === undefined) {
    return;
  }
  const audio = await say(text);
  if (audio === undefined) {
    return;
  }
  await sendGroupMsg(getMasterBot(), event.group_id, [segment.record(audio)]);
}

export { info };
