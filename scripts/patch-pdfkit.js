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

  const inlinedBlock = `
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
`;

  // Pattern to replace existing registerStdFontLoaders call
  const regex = /registerStdFontLoaders\(\s*\{[\s\S]*?\}\s*\);?/;
  if (regex.test(content)) {
    content = content.replace(regex, inlinedBlock);
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log(`[patch-pdfkit] Successfully inlined standard fonts into ${path.basename(targetPath)}`);
  } else {
    console.log(`[patch-pdfkit] registerStdFontLoaders block not found in ${path.basename(targetPath)}`);
  }
}

const baseDir = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js');
patchFile(path.join(baseDir, 'pdfkit.node.mjs'));
patchFile(path.join(baseDir, 'pdfkit.js'));
