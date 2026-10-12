import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceFile = path.join(projectRoot, 'public', 'market-emotion-dashboard-promo.html')
const tempDir = path.join(projectRoot, '.tmp-promo-slides')
const outputDir = path.join(projectRoot, 'public', 'promo-screenshots')

function extractHead(html) {
  const match = html.match(/<head>[\s\S]*?<\/head>/i)
  if (!match) {
    throw new Error('未找到 <head> 内容')
  }
  return match[0]
}

function extractSlides(html) {
  const matches = [...html.matchAll(/<section class="slide">[\s\S]*?<\/section>/g)]
  if (!matches.length) {
    throw new Error('未找到 .slide 页面片段')
  }
  return matches.map((item) => item[0])
}

function buildSingleSlideDocument(head, slideMarkup) {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    head,
    '<body>',
    '  <main class="deck">',
    `    ${slideMarkup}`,
    '  </main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function main() {
  const html = await fs.readFile(sourceFile, 'utf8')
  const head = extractHead(html)
  const slides = extractSlides(html)

  await fs.rm(tempDir, { recursive: true, force: true })
  await ensureDir(tempDir)
  await ensureDir(outputDir)

  await Promise.all(
    slides.map((slide, index) => {
      const slideNumber = `${index + 1}`.padStart(2, '0')
      const filePath = path.join(tempDir, `slide-${slideNumber}.html`)
      const content = buildSingleSlideDocument(head, slide)
      return fs.writeFile(filePath, content, 'utf8')
    }),
  )

  console.log(`Prepared ${slides.length} slide documents in ${tempDir}`)
  console.log(`Output images should be written to ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
