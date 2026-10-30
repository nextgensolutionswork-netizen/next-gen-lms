const fs = require('fs');

// 1. Update data/institute_store.json
{
  const file = 'E:/my erp hub/next gen lms/data/institute_store.json';
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/"usr-counsellor"/g, '"44444444-4444-4444-4444-444444444444"');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated data/institute_store.json');
  }
}

// 2. Update data-store.ts hydrateFromDisk
{
  const file = 'E:/my erp hub/next gen lms/lib/services/data-store.ts';
  let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  const oldHydrate = `        if (snapshot.users?.length) {
          const existingEmails = new Set(snapshot.users.map((u: any) => u.email?.toLowerCase()));
          const existingIds = new Set(snapshot.users.map((u: any) => u.id));
          const missingSeedUsers = this.users
            .filter((u) => !existingEmails.has(u.email.toLowerCase()))
            .map((u) => (existingIds.has(u.id) ? { ...u, id: \`\${u.id}-seed\` } : u));
          this.users = [...snapshot.users, ...missingSeedUsers];
        }`;

  const newHydrate = `        if (snapshot.users?.length) {
          snapshot.users = snapshot.users.map((u: any) =>
            u.id === 'usr-counsellor' || (u.role === 'counsellor' && u.email?.toLowerCase() === 'counsellor@next-generpsolutions.com')
              ? { ...u, id: '44444444-4444-4444-4444-444444444444' }
              : u
          );
          const existingEmails = new Set(snapshot.users.map((u: any) => u.email?.toLowerCase()));
          const existingIds = new Set(snapshot.users.map((u: any) => u.id));
          const missingSeedUsers = this.users
            .filter((u) => !existingEmails.has(u.email.toLowerCase()))
            .map((u) => (existingIds.has(u.id) ? { ...u, id: \`\${u.id}-seed\` } : u));
          this.users = [...snapshot.users, ...missingSeedUsers];
        }`;

  if (content.includes(oldHydrate)) {
    content = content.replace(oldHydrate, newHydrate);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated data-store.ts hydrateFromDisk');
  } else {
    console.log('data-store.ts hydrateFromDisk block not matched');
  }
}
