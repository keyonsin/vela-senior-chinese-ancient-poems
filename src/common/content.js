import file from "@system.file"
import { getEntry, getSection } from "./catalog"

export function loadContent(bookId, entryId, sectionId, success, fail) {
  let active = true
  const cancel = () => { active = false }
  if (!getEntry(bookId, entryId) || !getSection(sectionId)) {
    fail("未找到这篇古诗文")
    return cancel
  }

  file.readText({
    uri: `/common/texts/${entryId}-${sectionId}.txt`,
    success(result) {
      if (!active) return
      let paragraphs
      try {
        paragraphs = JSON.parse(result.text)
        if (
          !Array.isArray(paragraphs) ||
          !paragraphs.length ||
          paragraphs.some(text => typeof text !== "string") ||
          !paragraphs.join("").trim()
        ) {
          throw new Error("Invalid content")
        }
      } catch (error) {
        fail("内容读取失败，请重试")
        return
      }
      success(paragraphs)
    },
    fail() {
      if (active) fail("内容读取失败，请重试")
    }
  })

  return cancel
}
