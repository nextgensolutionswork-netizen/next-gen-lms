const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'node_modules/pdfkit/js/pdfkit.node.mjs');
if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  if (content.includes('#standard-fonts/')) {
    content = content.replace(/#standard-fonts\/(\w+)/g, './standard-fonts/$1.cjs');
    fs.writeFileSync(target, content, 'utf8');
    console.log('[patch-pdfkit] Patched pdfkit.node.mjs to use relative standard font paths.');
  } else {
    console.log('[patch-pdfkit] Already patched.');
  }
} else {
  console.log('[patch-pdfkit] pdfkit.node.mjs not found.');
}
