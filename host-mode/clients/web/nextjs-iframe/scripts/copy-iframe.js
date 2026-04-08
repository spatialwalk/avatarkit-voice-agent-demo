/**
 * Copy iframe content build to Next.js public directory
 * Also copies public assets (audio, images) to Next.js public root
 * Cross-platform compatible script
 */

const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '../iframe-content/dist')
const destDir = path.join(__dirname, '../public/iframe')
const iframePublicDir = path.join(__dirname, '../iframe-content/public')
const nextPublicDir = path.join(__dirname, '../public')

// Create public directory if it doesn't exist
if (!fs.existsSync(nextPublicDir)) {
  fs.mkdirSync(nextPublicDir, { recursive: true })
}

// Remove existing iframe directory
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true })
}

// Copy built iframe content
if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, destDir, { recursive: true })
  console.log('iframe content copied to public/iframe')
} else {
  console.error('iframe content not found. Please build iframe-content first.')
  process.exit(1)
}

// Copy iframe-content public assets to Next.js public root
// so that /audio/... and /image.png paths work from within the iframe
if (fs.existsSync(iframePublicDir)) {
  fs.cpSync(iframePublicDir, nextPublicDir, { recursive: true })
  console.log('iframe public assets copied to Next.js public/')
}
