const fs = require('fs');
const path = require('path');

const BEGIN_MARKER = '/* BEGIN_INLINED_STANDARD_FONTS */';
const END_MARKER = '/* END_INLINED_STANDARD_FONTS */';

function patchFile(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.log(`[patch-pdfkit] Target not found: ${targetPath}`);
    return;
  }

  const fontFiles = [
    'Courier', 'CourierBold', 'CourierBoldOblique', 'CourierOblique',
    'Helvetica', 'HelveticaBold', 'HelveticaBoldOblique', 'HelveticaOblique',
    'Symbol', 'TimesBold', 'TimesBoldItalic', 'TimesItalic', 'TimesRoman', 'ZapfDingbats'
  ];

  const fontData = {};
  for (const f of fontFiles) {
    try {
      const fontMod = require(path.join(__dirname, '..', 'node_modules', 'pdfkit', 'js', 'standard-fonts', f + '.cjs'));
      if (fontMod && fontMod.name) {
        fontData[fontMod.name] = fontMod;
      }
    } catch (e) {
      console.warn(`[patch-pdfkit] Warning loading font ${f}:`, e.message);
    }
  }

  let content = fs.readFileSync(targetPath, 'utf8');

  const inlinedBlock = `${BEGIN_MARKER}
const _INLINED_STANDARD_FONTS = ${JSON.stringify(fontData)};
registerStdFontLoaders({
  Courier: () => _INLINED_STANDARD_FONTS['Courier'],
  'Courier-Bold': () => _INLINED_STANDARD_FONTS['Courier-Bold'],
  'Courier-BoldOblique': () => _INLINED_STANDARD_FONTS['Courier-BoldOblique'],
  'Courier-Oblique': () => _INLINED_STANDARD_FONTS['Courier-Oblique'],
  Helvetica: () => _INLINED_STANDARD_FONTS['Helvetica'],
  'Helvetica-Bold': () => _INLINED_STANDARD_FONTS['Helvetica-Bold'],
  'Helvetica-BoldOblique': () => _INLINED_STANDARD_FONTS['Helvetica-BoldOblique'],
  'Helvetica-Oblique': () => _INLINED_STANDARD_FONTS['Helvetica-Oblique'],
  Symbol: () => _INLINED_STANDARD_FONTS['Symbol'],
  'Times-Bold': () => _INLINED_STANDARD_FONTS['Times-Bold'],
  'Times-BoldItalic': () => _INLINED_STANDARD_FONTS['Times-BoldItalic'],
  'Times-Italic': () => _INLINED_STANDARD_FONTS['Times-Italic'],
  'Times-Roman': () => _INLINED_STANDARD_FONTS['Times-Roman'],
  ZapfDingbats: () => _INLINED_STANDARD_FONTS['ZapfDingbats']
});
${END_MARKER}`;

  const markedRegex = /\/\* BEGIN_INLINED_STANDARD_FONTS \*\/[\s\S]*?\/\* END_INLINED_STANDARD_FONTS \*\//;
  const legacyLoaderRegex = /registerStdFontLoaders\(\s*\{[\s\S]*?\}\s*\);?/;

  // Check if already cleanly patched with exact inlinedBlock
  if (content.includes(BEGIN_MARKER) && content.includes(END_MARKER)) {
    const declMatches = content.match(/const _INLINED_STANDARD_FONTS/g) || [];
    const loaderMatches = content.match(/registerStdFontLoaders\(/g) || [];
    if (declMatches.length === 1 && loaderMatches.length >= 1 && content.includes("Helvetica: () => _INLINED_STANDARD_FONTS['Helvetica']")) {
      console.log(`[patch-pdfkit] Already cleanly patched: ${path.basename(targetPath)}`);
      return;
    }
    content = content.replace(markedRegex, inlinedBlock);
  } else if (legacyLoaderRegex.test(content)) {
    content = content.replace(legacyLoaderRegex, inlinedBlock);
  } else {
    console.warn(`[patch-pdfkit] Warning: neither marked block nor registerStdFontLoaders found in ${path.basename(targetPath)}`);
    return;
  }

  // Clean up any extraneous duplicate declarations that might have existed outside the marked block
  const declCount = (content.match(/const _INLINED_STANDARD_FONTS/g) || []).length;
  if (declCount > 1) {
    const parts = content.split(BEGIN_MARKER);
    const before = parts[0].replace(/const _INLINED_STANDARD_FONTS\s*=\s*\{[\s\S]*?\};?\s*/g, '');
    const rest = parts.slice(1).join(BEGIN_MARKER);
    content = before + BEGIN_MARKER + rest;
  }

  fs.writeFileSync(targetPath, content, 'utf8');
  console.log(`[patch-pdfkit] Successfully inlined standard fonts into ${path.basename(targetPath)}`);
}

const baseDir = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js');
patchFile(path.join(baseDir, 'pdfkit.node.mjs'));
patchFile(path.join(baseDir, 'pdfkit.js'));
