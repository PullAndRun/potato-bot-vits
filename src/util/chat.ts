import aiConf from "@potato/config/openai.json";
import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { logger } from "./logger";

const openai = new OpenAI({
  apiKey: aiConf.account.sb.apiKey,
  baseURL: aiConf.account.sb.baseURL,
});

async function createChat(msg: string, prompt: string) {
  const gptMessages: ChatCompletionMessageParam[] = [
    { role: "user", content: msg },
  ];
  gptMessages.unshift({ role: "system", content: prompt });
  return chat(gptMessages);
}

async function chat(msg: ChatCompletionMessageParam[]) {
  const response = await openai.chat.completions
    .create({
      model: "gpt-3.5-turbo-1106",
      messages: msg,
      temperature: aiConf.temperature,
      max_tokens: aiConf.max_tokens,
      top_p: aiConf.top_p,
      frequency_penalty: aiConf.frequency_penalty,
      presence_penalty: aiConf.presence_penalty,
      n: aiConf.n,
    })
    .then((chatCompletion) => chatCompletion.choices[0]?.message.content)
    .catch((e) => {
      logger.error(`\n错误：ai聊天错误\n错误信息：${e}\n聊天内容：`, msg);
      return undefined;
    });
  if (!response) {
    return undefined;
  }
  return response.replace(/^(\n+)/g, "").replace(/\n+/g, "\n");
}

export { createChat };
