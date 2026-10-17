const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const babel = require("@babel/core")
const AdmZip = require("adm-zip")
const { digest } = require("./lib/corpus.cjs")

const root = path.resolve(__dirname, "..")
const manifest = require("../src/manifest.json")
assert.match(manifest.package, /^(?:[a-z][a-z0-9_]*\.){3,}[a-z][a-z0-9_]*$/)
const sourceIndex = require("../tests/fixtures/source-index.json")
const defaultFilename = path.join(
  root, "dist", `${manifest.package}.debug.${manifest.versionName}.rpk`
)
const filename = process.argv[2] ? path.resolve(process.argv[2]) : defaultFilename

const archive = new AdmZip(filename)

function readText(name) {
  const entry = archive.getEntry(name)
  assert.ok(entry, `Missing packaged resource: ${name}`)
  return entry.getData().toString("utf8")
}

function compiledPage(source) {
  const code = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"]
  }).code
  const exports = {}
  const requireApp = () => ({})
  vm.compileFunction(code, ["exports", "$app_require$"])(exports, requireApp)
  const global = { setTimeout, setInterval, clearTimeout, clearInterval, $app_require$: requireApp }
  const entry = {}
  exports.default(global, global, global, entry, () => {})
  const definition = {}
  entry.entry(definition)
  return definition.default
}

function baseStyle(styles, selector) {
  const rule = styles.find(item =>
    Array.isArray(item[0]) && item[0].some(part => part[1] === selector)
  )
  assert.ok(rule, `Missing compiled style: ${selector}`)
  return rule[rule.length - 1]
}

const packagedManifest = JSON.parse(readText("manifest.json"))
assert.equal(packagedManifest.package, manifest.package)
assert.equal(packagedManifest.name, manifest.name)
assert.equal(JSON.parse(readText("manifest-watch.json")).package, manifest.package)
assert.match(readText("app.js"), new RegExp(`"package":"${manifest.package.replace(/\./g, "\\.")}"`))
assert.equal(
  path.basename(filename),
  `${manifest.package}.debug.${manifest.versionName}.rpk`,
  "The RPK filename must use the manifest package name."
)
if (filename === defaultFilename) {
  const distRpkFiles = fs.readdirSync(path.dirname(filename))
    .filter(name => name.endsWith(".rpk"))
    .sort()
  assert.deepEqual(
    distRpkFiles,
    [path.basename(filename)],
    "The dist directory must not retain RPK files from an older package identity."
  )
}
assert.ok(archive.getEntry(manifest.icon.replace(/^\//, "")), "Missing app icon")
for (const [route, config] of Object.entries(manifest.router.pages)) {
  const definition = compiledPage(readText(`${route}/${config.component}.js`))
  assert.equal(typeof definition.template, "function", `${route}: missing template`)
  const styles = definition.style
  assert.ok(styles.length, `${route}: stylesheet was not compiled`)
  assert.equal(baseStyle(styles, "container").backgroundColor, "#000000")
  assert.equal(baseStyle(styles, "card-item").borderRadius, "36px")
  assert.equal(baseStyle(styles, "text-container").paddingBottom, "112px")
  for (const shape of ["circle", "rect", "pill-shaped"]) {
    assert.ok(styles.some(rule => rule[0].condition &&
      rule[0].condition.includes(`shape:${shape}`)), `${route}: missing ${shape} styles`)
  }
  assert.equal(typeof definition.onTouchEnd, "function", `${route}: missing back gesture`)
}

const packagedTexts = archive.getEntries()
  .filter(entry => !entry.isDirectory && entry.entryName.startsWith("common/texts/"))
  .map(entry => entry.entryName)
  .sort()
assert.deepEqual(
  packagedTexts,
  sourceIndex.sections.map(section => `common/texts/${section.filename}`).sort(),
  "The package must contain exactly the 204 current content resources."
)

for (const section of sourceIndex.sections) {
  const content = JSON.parse(readText(`common/texts/${section.filename}`))
  assert.equal(digest(JSON.stringify(content)), section.sha256, section.filename)
}

console.log(`RPK verified: ${path.basename(filename)}`)
console.log(`4 native pages, compiled design styles, 204 exact offline content sections.`)
console.log(`Package size: ${(fs.statSync(filename).size / 1024).toFixed(1)} KiB.`)
