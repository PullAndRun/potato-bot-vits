import sayConf from "@potato/config/say.json";
import { z } from "zod";
import { createFetch } from "../util/http";

async function say(text: string) {
  const audioUrl = await createFetch(sayConf.api.info, 20000, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: [
        "1",
        "Azusa",
        0.5,
        0.5,
        0.9,
        1,
        "ZH",
        false,
        1,
        0.2,
        null,
        "Happy",
        "",
        0.7,
      ],
      event_data: null,
      fn_index: 1,
    }),
  })
    .then((resp) => resp?.json())
    .catch((_) => undefined);
  const audioUrlSchema = z.object({
    data: z.tuple([
      z.string(),
      z.object({
        name: z.string(),
      }),
    ]),
  });
  const safeAudioUrl = audioUrlSchema.safeParse(audioUrl);
  if (!safeAudioUrl.success || safeAudioUrl.data.data[0] !== "Success") {
    return undefined;
  }
  return `${sayConf.api.file}${safeAudioUrl.data.data[1].name}`;
}

export { say };
