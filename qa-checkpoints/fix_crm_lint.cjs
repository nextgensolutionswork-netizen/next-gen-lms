const fs = require('fs');
const path = require('path');

const filePath = path.resolve('app/(dashboard)/crm/leads/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /return \(\) => \{\s*isMounted = false;\s*\};\s*\}, \[user\?\.id\]\);/,
  "return () => { isMounted = false; };\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [user?.id]);"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Applied regex replacement for eslint-disable');
