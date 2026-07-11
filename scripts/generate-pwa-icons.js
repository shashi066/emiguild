// Generate PWA icons from the existing logo
// Usage: node scripts/generate-pwa-icons.js

const fs = require('fs');
const path = require('path');

const srcIcon = path.join(__dirname, '..', 'public', 'images', 'logoImage.png');
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const targets = [
  'icon-192.png',
  'icon-512.png',
  'maskable-icon-512.png',
  'apple-touch-icon.png',
];

targets.forEach(target => {
  const dest = path.join(iconsDir, target);
  fs.copyFileSync(srcIcon, dest);
  console.log(`Created: public/icons/${target}`);
});

console.log('\nDone! Icons created from logoImage.png.');
