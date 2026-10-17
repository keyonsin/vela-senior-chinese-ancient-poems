const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { BOOKS, digest } = require("../scripts/lib/corpus.cjs")
const { createRuntime, root } = require("./helpers/runtime.cjs")
const catalog = require("../src/data/catalog.json")
const sourceIndex = require("./fixtures/source-index.json")

test("five books and all 68 titles retain the supplied table-of-contents order", () => {
  assert.deepEqual(catalog.map(({ id, title, count }) => ({ id, title, count })), BOOKS)
  const ids = new Set()
  for (const book of catalog) {
    assert.equal(book.entries.length, book.count)
    book.entries.forEach((entry, index) => {
      assert.equal(entry.id, `${book.id}-${String(index + 1).padStart(2, "0")}`)
      assert.ok(entry.title && entry.author)
      ids.add(entry.id)
    })
  }
  assert.equal(ids.size, 68)
})

test("all 204 offline sections exactly match their source paragraph hashes", () => {
  const folder = path.join(root, "src/common/texts")
  const files = fs.readdirSync(folder).sort()
  assert.equal(sourceIndex.documentParagraphs, 6009)
  assert.equal(sourceIndex.sections.length, 204)
  assert.deepEqual(files, sourceIndex.sections.map(section => section.filename).sort())
  let characters = 0
  for (const section of sourceIndex.sections) {
    const paragraphs = JSON.parse(fs.readFileSync(path.join(folder, section.filename), "utf8"))
    assert.ok(paragraphs.every(text => typeof text === "string"))
    assert.equal(paragraphs.length, section.paragraphs, section.filename)
    assert.equal(paragraphs.join("\n").length, section.characters, section.filename)
    assert.equal(digest(JSON.stringify(paragraphs)), section.sha256, section.filename)
    assert.ok(!paragraphs.some(text => /^【(原文|译文|注释)】$/.test(text)))
    characters += section.characters
  }
  assert.equal(characters, 133602)
})

test("bounded reading blocks reconstruct every original paragraph without loss", () => {
  const { makeBlocks } = createRuntime().load("src/common/reading.js")
  for (const section of sourceIndex.sections) {
    const paragraphs = JSON.parse(fs.readFileSync(
      path.join(root, "src/common/texts", section.filename), "utf8"
    ))
    const blocks = makeBlocks(paragraphs, section.section)
    const reconstructed = paragraphs.map(() => "")
    for (const block of blocks) {
      assert.ok(block.text.length <= 180, section.filename)
      reconstructed[block.paragraph] += block.text
      assert.equal(block.blank, paragraphs[block.paragraph] === "")
      if (section.section === "original") assert.equal(block.gap, 0)
    }
    assert.deepEqual(reconstructed, paragraphs, section.filename)
  }
})

test("long blocks preserve surrogate pairs, punctuation, whitespace and blank stanzas", () => {
  const { splitParagraph, makeBlocks } = createRuntime().load("src/common/reading.js")
  const text = "甲".repeat(179) + "\u{20000}" + "乙".repeat(180) + "。\n  丙  "
  const chunks = splitParagraph(text)
  assert.equal(chunks.join(""), text)
  for (const chunk of chunks) {
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk))
    assert.ok(!/^[\uDC00-\uDFFF]/.test(chunk))
  }
  assert.deepEqual(splitParagraph(""), [""])
  assert.equal(makeBlocks(["上阕", "", "下阕"], "original")[1].blank, true)
})

test("catalog lookups do not accept mismatched books, unknown IDs or prototype keys", () => {
  const api = createRuntime().load("src/common/catalog.js")
  assert.equal(api.getBook("bx1").title, "必修上册")
  assert.equal(api.getEntry("bx1", "bx1-01").title, "沁园春·长沙")
  assert.equal(api.getEntry("bx2", "bx1-01"), null)
  for (const id of ["", "../bx1", "__proto__", "constructor", undefined, null]) {
    assert.equal(api.getBook(id), null)
    assert.equal(api.getSection(id), null)
  }
  assert.deepEqual(api.sections.map(item => item.title), ["原文", "翻译", "注释"])
})
