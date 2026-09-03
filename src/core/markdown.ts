export function extractMarkdownSection(text: string, fragment: string): string {
  const lines = text.split(/\r?\n/);
  const matches: Array<{ index: number; level: number }> = [];

  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!heading) continue;
    const title = heading[2].trim();
    if (title === fragment || title.split(/\s+/)[0] === fragment) {
      matches.push({ index, level: heading[1].length });
    }
  }

  if (matches.length === 0) throw new Error(`找不到 Markdown 标题: ${fragment}`);
  if (matches.length > 1) throw new Error(`Markdown 标题重复: ${fragment}`);

  const start = matches[0];
  let end = lines.length;
  for (let index = start.index + 1; index < lines.length; index++) {
    const heading = lines[index].match(/^(#{1,6})\s+/);
    if (heading && heading[1].length <= start.level) {
      end = index;
      break;
    }
  }
  while (end > start.index + 1 && lines[end - 1] === "") end--;
  return lines.slice(start.index, end).join("\n") + "\n";
}

