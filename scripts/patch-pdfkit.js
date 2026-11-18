const fs = require('fs');
const path = require('path');

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

  const inlinedBlock = `/* BEGIN_INLINED_STANDARD_FONTS */
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
/* END_INLINED_STANDARD_FONTS */`;

  const markerRegex = /\/\* BEGIN_INLINED_STANDARD_FONTS \*\/[\s\S]*?\/\* END_INLINED_STANDARD_FONTS \*\//;
  const legacyInlinedRegex = /(?:const _INLINED_STANDARD_FONTS = [\s\S]*?;\s*)+registerStdFontLoaders\(\s*\{[\s\S]*?\}\s*\);?/;
  const freshRegex = /registerStdFontLoaders\(\s*\{[\s\S]*?\}\s*\);?/;

  let replaced = false;

  if (markerRegex.test(content)) {
    content = content.replace(markerRegex, inlinedBlock);
    replaced = true;
  } else if (legacyInlinedRegex.test(content)) {
    content = content.replace(legacyInlinedRegex, inlinedBlock);
    replaced = true;
  } else if (freshRegex.test(content)) {
    content = content.replace(freshRegex, inlinedBlock);
    replaced = true;
  }

  // Safety cleanup: Ensure no duplicate _INLINED_STANDARD_FONTS declarations exist outside the block
  const firstIndex = content.indexOf('/* BEGIN_INLINED_STANDARD_FONTS */');
  const lastIndex = content.indexOf('/* END_INLINED_STANDARD_FONTS */');
  if (firstIndex !== -1 && lastIndex !== -1) {
    const beforeBlock = content.slice(0, firstIndex).replace(/const _INLINED_STANDARD_FONTS\s*=[\s\S]*?;\s*/g, '');
    const middleBlock = content.slice(firstIndex, lastIndex + '/* END_INLINED_STANDARD_FONTS */'.length);
    const afterBlock = content.slice(lastIndex + '/* END_INLINED_STANDARD_FONTS */'.length).replace(/const _INLINED_STANDARD_FONTS\s*=[\s\S]*?;\s*/g, '');
    content = beforeBlock + middleBlock + afterBlock;
  }

  if (replaced) {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(`[patch-pdfkit] Successfully inlined standard fonts into ${path.basename(targetPath)}`);
  } else {
    console.log(`[patch-pdfkit] registerStdFontLoaders block not found in ${path.basename(targetPath)}`);
  }
}

const baseDir = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js');
patchFile(path.join(baseDir, 'pdfkit.node.mjs'));
patchFile(path.join(baseDir, 'pdfkit.js'));
