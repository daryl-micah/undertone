// Upload a local file to the `media` bucket.
// Usage: node --env-file=.env.local scripts/upload-media.mjs <local-file> <storage-path> <mime>
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [file, path, mime] = process.argv.slice(2);
if (!file || !path || !mime) {
  console.error("usage: upload-media.mjs <local-file> <storage-path> <mime>");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { error } = await supabase.storage
  .from("media")
  .upload(path, await readFile(file), { contentType: mime, upsert: true });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
