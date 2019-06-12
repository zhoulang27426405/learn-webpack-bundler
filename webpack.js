/**
 * 1、parse file and extract its dependencies
 * 2、build dependency graph recursively
 * 3、pack everything into one file
 */

const traverse = require('@babel/traverse').default
const babel = require('@babel/core')
const path = require('path')
const fs = require('fs')

let id = 0

function createAsset(file) {
  const content = fs.readFileSync(file, 'utf-8')
  const ast = babel.parseSync(content, { sourceType: 'module' })
  const deps = []

  traverse(ast, {
    ImportDeclaration({ node }) {
      deps.push(node.source.value)
    }
  })

  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ['@babel/preset-env']
  })

  return {
    id: id++,
    file,
    deps,
    code,
    map: {}
  }
}

function createGraph(entry) {
  const main = createAsset(entry)

  const queque = [main]

  for (const asset of queque) {
    asset.deps.forEach(val => {
      const dirname = path.dirname(asset.file)
      const absPath = path.join(dirname, val)
      const child = createAsset(absPath)
      asset.map[val] = child.id
      queque.push(child)
    })

    replacePath(asset)
  }

  return queque
}

function replacePath(asset) {
  asset.deps.forEach(path => {
    asset.code = asset.code.replace(
      `require("${path}")`,
      `require(${asset.map[path]})`
    )
  })
}

const graph = createGraph('./src/index.js')

const createBundle = function(graph) {
  return `
    (function (modules) {
      const installedModule = {}

      const require = function (moduleId) {
        if (installedModule[moduleId]) return installedModule[moduleId].exports
        const module = installedModule[moduleId] = {
          exports: {}
        }

        modules[moduleId](module.exports, module, require)

        return module.exports
      }

      require(0)
    })([${graph
      .map(({ code }) => {
        return `function (exports, module, require) {
          ${code}
        }`
      })
      .join(',')}])
  `
}

const bundle = createBundle(graph)

fs.writeFileSync('bundle.js', bundle)
