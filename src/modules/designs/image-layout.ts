/** Shared, bounded line wrapping for the single-image export. Never omit entered wording. */
export function wrapCardText(text: string, measure: (text: string) => number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = ""; }
      if (measure(word) > width) {
        for (const char of word) { if (line && measure(line + char) > width) { lines.push(line); line = ""; } line += char; }
      } else line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines;
}
