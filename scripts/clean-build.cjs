const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const generatedDirectories = ["build", "dist"]

for (const directory of generatedDirectories) {
  const target = path.resolve(root, directory)
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`Refusing to clean outside the project: ${target}`)
  }
  fs.rmSync(target, { recursive: true, force: true })
}

fs.mkdirSync(path.join(root, "dist"), { recursive: true })
