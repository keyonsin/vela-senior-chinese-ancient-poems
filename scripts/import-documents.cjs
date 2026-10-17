const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const { execFileSync } = require("node:child_process")
const { digest, parseCorpus, extractDesign } = require("./lib/corpus.cjs")

const root = path.resolve(__dirname, "..")
const args = process.argv.slice(2)
const checkOnly = args.includes("--check")

function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`Missing value for ${name}`)
  }
  return path.resolve(args[index + 1])
}

const poetryPath = option(
  "--poetry",
  path.join(os.homedir(), "Downloads", "高中统编版语文古诗文大全 (1).docx")
)
const designPath = option(
  "--design",
  path.join(os.homedir(), "Desktop", "设计语言规范.docx")
)

function readDocument(filename) {
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "docx-paragraphs.ps1"), "-InputPath", filename],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true }
  )
  const result = JSON.parse(output.replace(/^\uFEFF/, ""))
  if (result.footnoteReferences || result.drawings) {
    throw new Error("The document contains footnotes/images requiring a manual content review.")
  }
  return result.paragraphs
}

function emit(relativePath, content) {
  const destination = path.join(root, relativePath)
  if (checkOnly) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== content) {
      throw new Error(`Source mismatch: ${relativePath}`)
    }
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, content, "utf8")
  }
}

const source = readDocument(poetryPath)
const { books, texts, sourceIndex } = parseCorpus(source)
emit("src/data/catalog.json", JSON.stringify(books, null, 2) + "\n")
for (const text of texts) {
  emit(`src/common/texts/${text.filename}`, JSON.stringify(text.paragraphs) + "\n")
}
const design = extractDesign(readDocument(designPath))
emit("src/common/design.css", design)
for (const page of ["index", "book", "detail", "reader"]) {
  const filename = `src/pages/${page}/${page}.ux`
  const source = fs.readFileSync(path.join(root, filename), "utf8")
  const styles = source.match(/<style>[\s\S]*?<\/style>/g) || []
  if (styles.length !== 1) throw new Error(`Expected one style block: ${filename}`)
  emit(filename, source.replace(styles[0], `<style>\n${design}</style>`))
}
emit("tests/fixtures/source-index.json", JSON.stringify({
  source: path.basename(poetryPath),
  documentSha256: digest(fs.readFileSync(poetryPath)),
  documentParagraphs: source.length,
  books: books.map(({ id, title, count }) => ({ id, title, count })),
  sections: sourceIndex
}, null, 2) + "\n")

console.log(checkOnly ? "Source fidelity check passed." : "Documents imported.")
for (const book of books) console.log(`${book.title}: ${book.entries.length}`)
console.log(`Total: 68 articles, ${texts.length} sections.`)
console.log(`Content: ${sourceIndex.reduce((sum, item) => sum + item.characters, 0)} characters.`)
console.log("Design CSS: copied from the supplied document; only non-breaking indentation spaces normalized.")
