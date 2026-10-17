const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { createRuntime, root } = require("./helpers/runtime.cjs")
const catalog = require("../src/data/catalog.json")
const manifest = require("../src/manifest.json")

test("the app uses the requested standalone package identity", () => {
  assert.equal(manifest.package, "com.gaozhong.chinese.poetry")
  assert.match(manifest.package, /^(?:[a-z][a-z0-9_]*\.){3,}[a-z][a-z0-9_]*$/)
})

test("the native app declares every page and uses only local file and router APIs", () => {
  assert.equal(manifest.config.designWidth, 480)
  assert.deepEqual(Object.keys(manifest.router.pages), [
    "pages/index", "pages/book", "pages/detail", "pages/reader"
  ])
  assert.deepEqual(manifest.features.map(feature => feature.name), ["system.router", "system.file"])
  const design = fs.readFileSync(path.join(root, "src/common/design.css"), "utf8")
  for (const page of ["index", "book", "detail", "reader"]) {
    const ux = fs.readFileSync(path.join(root, "src/pages", page, `${page}.ux`), "utf8")
    assert.match(ux, /class="container" onswipe="onSwipe"/)
    assert.match(ux, /ontouchstart="onTouchStart"/)
    assert.match(ux, /ontouchmove="onTouchMove"/)
    assert.match(ux, /ontouchend="onTouchEnd"/)
    assert.match(ux, /<scroll class="scroll-content" scroll-y="true" bounces="true">/)
    const styles = [...ux.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    assert.equal(styles.length, 1)
    assert.equal(styles[0][1], "\n" + design.replace(/\n*$/, "\n\n"), `${page}: keep the complete original CSS in the page`)
    assert.ok(!ux.includes('style="'), "The supplied stylesheet must not be overridden inline.")
  }
})

test("all 5 books, 68 articles and 204 section choices open the corresponding content", () => {
  const runtime = createRuntime()
  const home = runtime.page("index")
  assert.deepEqual(home.books.map(book => book.title), catalog.map(book => book.title.replace(/册$/, "")))
  assert.equal(home.books.length, 5)

  for (const book of catalog) {
    home.onShow()
    home.openBook(book.id)
    assert.deepEqual(runtime.routes.pop(), {
      action: "push", uri: "/pages/book", params: { bookId: book.id }
    })
    const list = runtime.page("book", { bookId: book.id })
    assert.equal(list.title, book.title)
    assert.equal(list.entries.length, book.count)

    for (const entry of book.entries) {
      list.onShow()
      list.openEntry(entry.id)
      assert.deepEqual(runtime.routes.pop(), {
        action: "push", uri: "/pages/detail",
        params: { bookId: book.id, entryId: entry.id }
      })
      const detail = runtime.page("detail", { bookId: book.id, entryId: entry.id })
      assert.equal(detail.title, entry.title)
      assert.equal(detail.author, entry.author)
      assert.deepEqual(detail.options.map(option => option.title), ["原文", "翻译", "注释"])

      for (const option of detail.options) {
        detail.onShow()
        detail.openSection(option.id)
        const expectedParams = { bookId: book.id, entryId: entry.id, sectionId: option.id }
        assert.deepEqual(runtime.routes.pop(), {
          action: "push", uri: "/pages/reader", params: expectedParams
        })
        const reader = runtime.page("reader", expectedParams)
        assert.equal(reader.title, entry.title)
        assert.equal(reader.sectionTitle, option.title)
        assert.equal(reader.loading, false)
        assert.equal(reader.error, "")
        assert.ok(reader.blocks.length)
        reader.onDestroy()
        assert.deepEqual(reader.blocks, [])
      }
    }
  }
  assert.equal(runtime.requests.length, 204)
  assert.equal(new Set(runtime.requests).size, 204)
})

test("right swipe returns exactly one level; vertical and left swipes never navigate", () => {
  const runtime = createRuntime()
  const params = { bookId: "bx1", entryId: "bx1-01", sectionId: "original" }
  for (const name of ["book", "detail", "reader"]) {
    const page = runtime.page(name, params)
    for (const direction of ["up", "down", "left", undefined]) {
      page.onSwipe({ direction })
    }
    page.onSwipe()
    assert.equal(runtime.routes.length, 0)
    page.onSwipe({ direction: "right" })
    page.onSwipe({ direction: "right" })
    assert.deepEqual(runtime.routes.splice(0), [{ action: "back" }])
    page.onShow()
    page.onSwipe({ direction: "right" })
    assert.deepEqual(runtime.routes.splice(0), [{ action: "back" }])
  }
})

test("rapid repeated taps cannot push duplicate pages", () => {
  const runtime = createRuntime()
  const home = runtime.page("index")
  home.openBook("bx1")
  home.openBook("bx1")
  assert.equal(runtime.routes.length, 1)
  home.onShow()
  home.openBook("bx2")
  assert.equal(runtime.routes.length, 2)
})

test("bubbled touch gestures return from cards and text without double navigation", () => {
  const runtime = createRuntime()
  const params = { bookId: "bx1", entryId: "bx1-01", sectionId: "original" }
  for (const name of ["book", "detail", "reader"]) {
    const page = runtime.page(name, params)
    page.onTouchStart({ touches: [{ identifier: 0, clientX: 30, clientY: 200 }] })
    page.onTouchMove({ touches: [{ identifier: 0, clientX: 100, clientY: 210 }] })
    page.onTouchEnd({ touches: [], changedTouches: [{ identifier: 0, clientX: 160, clientY: 215 }] })
    page.onSwipe({ direction: "right" })
    assert.deepEqual(runtime.routes.splice(0), [{ action: "back" }])
  }
})

test("right swiping the book-selection home returns to the launcher exactly once", () => {
  const runtime = createRuntime()
  const home = runtime.page("index")
  home.onSwipe({ direction: "right" })
  home.onTouchStart({ touches: [{ identifier: 0, clientX: 30, clientY: 200 }] })
  home.onTouchEnd({ changedTouches: [{ identifier: 0, clientX: 200, clientY: 200 }] })
  assert.deepEqual(runtime.routes.splice(0), [{ action: "back" }])
  assert.equal(home.navigating, true)
  home.openBook("bx1")
  assert.equal(runtime.routes.length, 0)
  home.ignoreTapUntil = 0
  home.openBook("bx1")
  assert.equal(runtime.routes.length, 0)
})

test("scrolling, taps, left drags, multiple touches and a changed finger never go back", () => {
  const runtime = createRuntime()
  const page = runtime.page("book", { bookId: "bx1" })
  const point = (x, y, identifier = 0) => ({ clientX: x, clientY: y, identifier })
  for (const end of [point(38, 205), point(-100, 200), point(50, 320), point(150, 205, 1)]) {
    page.onTouchStart({ touches: [point(30, 200)] })
    page.onTouchMove({ touches: [end] })
    page.onTouchEnd({ touches: [], changedTouches: [end] })
  }
  page.onTouchStart({ touches: [point(30, 200)] })
  page.onTouchMove({ touches: [point(35, 240)] })
  page.onTouchEnd({ changedTouches: [point(200, 240)] })
  page.onTouchStart({ touches: [point(30, 200), point(40, 210, 1)] })
  page.onTouchEnd({ changedTouches: [point(200, 200)] })
  page.onTouchStart({ touches: [point(30, 200)] })
  page.onTouchMove({ touches: [point(60, 200), point(65, 210, 1)] })
  page.onTouchEnd({ changedTouches: [point(200, 200)] })
  assert.equal(runtime.routes.length, 0)
})

test("invalid routes fail safely without reading any files", () => {
  const runtime = createRuntime()
  assert.ok(runtime.page("book", { bookId: "../unknown" }).error)
  const detail = runtime.page("detail", { bookId: "bx2", entryId: "bx1-01" })
  assert.ok(detail.error)
  assert.deepEqual(detail.options, [])
  detail.openSection("original")
  assert.equal(runtime.routes.length, 0)

  for (const params of [
    {},
    { bookId: "bx1", entryId: "bx2-01", sectionId: "original" },
    { bookId: "bx1", entryId: "bx1-01", sectionId: "../../manifest" }
  ]) {
    const reader = runtime.page("reader", params)
    assert.ok(reader.error)
    assert.equal(reader.canRetry, false)
    reader.read()
  }
  assert.equal(runtime.requests.length, 0)
})

test("read failures and invalid JSON can be retried without duplicate requests", () => {
  const pending = []
  const runtime = createRuntime({ file: { readText(request) { pending.push(request) } } })
  const reader = runtime.page("reader", {
    bookId: "bx1", entryId: "bx1-01", sectionId: "translation"
  })
  assert.equal(reader.loading, true)
  reader.read()
  assert.equal(pending.length, 1)
  pending.shift().fail({}, 301)
  assert.equal(reader.loading, false)
  assert.ok(reader.error)
  reader.read()
  pending.shift().success({ text: "{" })
  assert.ok(reader.error)
  reader.read()
  pending.shift().success({ text: JSON.stringify(["正确的翻译。"]) })
  assert.equal(reader.error, "")
  assert.equal(reader.loading, false)
  assert.equal(reader.blocks[0].text, "正确的翻译。")
})

test("leaving a reader cancels late file callbacks", () => {
  const pending = []
  const runtime = createRuntime({ file: { readText(request) { pending.push(request) } } })
  const reader = runtime.page("reader", {
    bookId: "xx3", entryId: "xx3-03", sectionId: "notes"
  })
  reader.onDestroy()
  pending[0].success({ text: JSON.stringify(["迟到的结果"]) })
  pending[0].fail({}, 300)
  assert.deepEqual(reader.blocks, [])
  assert.equal(reader.error, "")
})
