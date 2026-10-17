const assert = require("node:assert/strict")
const crypto = require("node:crypto")

const BOOKS = [
  { id: "bx1", title: "必修上册", count: 19 },
  { id: "bx2", title: "必修下册", count: 14 },
  { id: "xx1", title: "选择性必修上册", count: 10 },
  { id: "xx2", title: "选择性必修中册", count: 8 },
  { id: "xx3", title: "选择性必修下册", count: 17 }
]

const SECTIONS = [
  { id: "original", label: "原文", marker: "【原文】" },
  { id: "translation", label: "翻译", marker: "【译文】" },
  { id: "notes", label: "注释", marker: "【注释】" }
]

function digest(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex")
}

function trimEmptyParagraphs(paragraphs) {
  const result = paragraphs.slice()
  while (result.length && !result[0].trim()) result.shift()
  while (result.length && !result[result.length - 1].trim()) result.pop()
  return result
}

function parseCorpus(paragraphs) {
  const books = BOOKS.map(book => ({ ...book, entries: [] }))
  const firstBook = paragraphs.indexOf(books[0].title)
  assert.ok(firstBook > 0, "The first book heading is missing.")

  let book
  for (const text of paragraphs.slice(0, firstBook)) {
    const heading = books.find(item => text === `【${item.title}】`)
    if (heading) {
      book = heading
      continue
    }
    const match = text.match(/^(\d+)\.\s+(.+?)\s+\u2014\u2014\s+(.+)$/u)
    if (!match) continue
    assert.ok(book, `An entry has no book: ${text}`)
    assert.equal(Number(match[1]), book.entries.length + 1)
    book.entries.push({
      id: `${book.id}-${String(match[1]).padStart(2, "0")}`,
      title: match[2],
      author: match[3]
    })
  }

  for (const item of books) {
    assert.equal(item.entries.length, item.count, `${item.title}: TOC count`)
  }

  const texts = []
  const sourceIndex = []
  const seen = new Set()
  let ordinal = 0
  for (let index = firstBook; index < paragraphs.length; index++) {
    const heading = books.find(item => paragraphs[index] === item.title)
    if (heading) {
      book = heading
      ordinal = 0
      continue
    }
    if (paragraphs[index] !== SECTIONS[0].marker) continue

    const entry = book.entries[ordinal++]
    assert.ok(entry, `Unexpected article at paragraph ${index + 1}`)
    assert.equal(paragraphs[index - 2], entry.title, `${entry.id}: title`)
    const authorLine = paragraphs[index - 1]
    const author = authorLine.match(/^【(.+?)】(?:\s+〔(.+)〕)?$/u)
    assert.ok(author, `${entry.id}: author heading`)
    assert.equal(author[1], entry.author, `${entry.id}: author`)
    if (author[2]) entry.category = author[2]
    assert.ok(!seen.has(entry.id), `Duplicate article: ${entry.id}`)
    seen.add(entry.id)

    let end = index + 1
    while (end < paragraphs.length && !/^(?:\u2014\s*){3,}$/u.test(paragraphs[end])) {
      end++
    }
    assert.ok(end < paragraphs.length, `${entry.id}: article boundary`)
    const positions = SECTIONS.map(section =>
      paragraphs.indexOf(section.marker, index)
    )
    assert.ok(
      positions[0] === index &&
      positions[0] < positions[1] &&
      positions[1] < positions[2] &&
      positions[2] < end,
      `${entry.id}: the three sections must appear once and in order`
    )

    for (let sectionIndex = 0; sectionIndex < SECTIONS.length; sectionIndex++) {
      const section = SECTIONS[sectionIndex]
      const start = positions[sectionIndex] + 1
      const stop = positions[sectionIndex + 1] || end
      const content = trimEmptyParagraphs(paragraphs.slice(start, stop))
      assert.ok(content.join("").trim().length, `${entry.id}: empty ${section.id}`)
      assert.ok(
        !content.some(text => SECTIONS.some(item => text === item.marker)),
        `${entry.id}: duplicate section marker`
      )
      const filename = `${entry.id}-${section.id}.txt`
      texts.push({ filename, paragraphs: content })
      sourceIndex.push({
        entryId: entry.id,
        section: section.id,
        filename,
        firstParagraph: start + 1,
        lastParagraph: stop,
        paragraphs: content.length,
        characters: content.join("\n").length,
        sha256: digest(JSON.stringify(content))
      })
    }
    index = end
  }

  assert.equal(seen.size, 68, "All 68 articles must be imported.")
  assert.equal(texts.length, 204, "All 204 sections must be imported.")
  return { books, texts, sourceIndex }
}

function extractDesign(paragraphs) {
  const start = paragraphs.indexOf("<style>")
  const end = paragraphs.indexOf("</style>", start)
  assert.ok(start >= 0 && end > start, "The design stylesheet is missing.")
  return paragraphs.slice(start + 1, end).join("\n").replace(/\u00a0/g, " ") + "\n"
}

module.exports = { BOOKS, SECTIONS, digest, parseCorpus, extractDesign }
