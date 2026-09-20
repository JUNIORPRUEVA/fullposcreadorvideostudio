import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const file = process.argv[2] ?? "storage/renders/demo-fullpos-premium-vertical/final.mp4";

if (!existsSync(file)) {
  console.error(`Video not found: ${file}`);
  process.exit(1);
}

const size = statSync(file).size;
if (size <= 0) {
  console.error(`Video is empty: ${file}`);
  process.exit(1);
}

const output = execFileSync("ffprobe", [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_entries",
  "stream=codec_name,width,height,r_frame_rate,duration",
  "-of",
  "json",
  file
], { encoding: "utf8" });

const data = JSON.parse(output);
const stream = data.streams?.[0];
console.log(JSON.stringify({ file, size, stream }, null, 2));

if (!stream || stream.width !== 1080 || stream.height !== 1920) {
  process.exit(1);
}
