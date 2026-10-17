const BLOCK_SIZE = 180
const SENTENCE_END = /[。！？；，、\n]/

// Keep each native text node small without dropping punctuation or whitespace.
export function splitParagraph(text, limit) {
  const size = limit || BLOCK_SIZE
  const chunks = []
  let start = 0
  if (!text.length) return [""]
  while (start < text.length) {
    let end = Math.min(start + size, text.length)
    if (end < text.length) {
      for (let position = end - 1; position > start + size / 2; position--) {
        if (SENTENCE_END.test(text[position])) {
          end = position + 1
          break
        }
      }
      const last = text.charCodeAt(end - 1)
      if (last >= 0xd800 && last <= 0xdbff) end--
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

export function makeBlocks(paragraphs, sectionId) {
  const blocks = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const chunks = splitParagraph(paragraph)
    chunks.forEach((text, chunkIndex) => {
      blocks.push({
        id: `${paragraphIndex}-${chunkIndex}`,
        paragraph: paragraphIndex,
        text,
        blank: paragraph.length === 0,
        gap: sectionId !== "original" && chunkIndex === chunks.length - 1 ? 20 : 0
      })
    })
  })
  return blocks
}
