const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const babel = require("@babel/core")

const root = path.resolve(__dirname, "../..")
const transformed = new Map()

function createRuntime(options = {}) {
  const routes = []
  const requests = []
  const cache = new Map()
  const router = {
    push(route) { routes.push({ action: "push", ...route }) },
    back() { routes.push({ action: "back" }) }
  }
  const file = options.file || {
    readText(request) {
      requests.push(request.uri)
      request.success({ text: fs.readFileSync(path.join(root, "src", request.uri), "utf8") })
    }
  }

  function load(filename) {
    if (filename === "@system.router") return router
    if (filename === "@system.file") return file
    if (!path.extname(filename)) filename += ".js"
    if (cache.has(filename)) return cache.get(filename).exports
    if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8"))

    if (!transformed.has(filename)) {
      let code = fs.readFileSync(filename, "utf8")
      if (filename.endsWith(".ux")) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
      transformed.set(filename, babel.transformSync(code, {
        babelrc: false,
        configFile: false,
        plugins: ["@babel/plugin-transform-modules-commonjs"]
      }).code)
    }

    const module = { exports: {} }
    cache.set(filename, module)
    const localRequire = specifier => load(
      specifier.startsWith("@system.")
        ? specifier
        : path.resolve(path.dirname(filename), specifier)
    )
    vm.compileFunction(transformed.get(filename), ["require", "module", "exports"], {
      filename
    })(localRequire, module, module.exports)
    return module.exports
  }

  function page(name, params = {}) {
    const definition = load(path.join(root, "src/pages", name, `${name}.ux`)).default
    const instance = JSON.parse(JSON.stringify({
      ...(definition.public || {}),
      ...(definition.private || {})
    }))
    for (const key of Object.keys(definition.public || {})) {
      if (Object.prototype.hasOwnProperty.call(params, key)) instance[key] = params[key]
    }
    for (const [key, value] of Object.entries(definition)) {
      if (typeof value === "function") instance[key] = value.bind(instance)
    }
    if (instance.onInit) instance.onInit()
    if (instance.onShow) instance.onShow()
    return instance
  }

  return {
    routes,
    requests,
    page,
    load(relativePath) { return load(path.join(root, relativePath)) }
  }
}

module.exports = { createRuntime, root }
