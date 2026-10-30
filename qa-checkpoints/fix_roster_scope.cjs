const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, oldStr, newStr) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const hasCrlf = content.includes('\r\n');
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldStr.replace(/\r\n/g, '\n');
  const normNew = newStr.replace(/\r\n/g, '\n');

  if (!normContent.includes(normOld)) {
    throw new Error(`Target string not found in ${filePath}`);
  }

  let updated = normContent.replace(normOld, normNew);
  if (hasCrlf) {
    updated = updated.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(fullPath, updated, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

const pwtOld = `      const profileIds = new Set((roster.data || []).map((u) => u.id));
      store.users = [
        ...store.users.filter((u) => tenantId(u) !== tenant || (u.role === 'student' && !profileIds.has(u.id))),
        ...(roster.data || []) as UserProfile[],
      ];
    }
    if (db) {
      const currentActorProfile = (roster.data || []).find((u) => u.id === actor.id);
      if (!currentActorProfile || currentActorProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      actor.role = currentActorProfile.role;
      actor.is_active = currentActorProfile.is_active;
    }`;

const pwtNew = `      const profileIds = new Set((roster.data || []).map((u) => u.id));
      store.users = [
        ...store.users.filter((u) => tenantId(u) !== tenant || (u.role === 'student' && !profileIds.has(u.id))),
        ...(roster.data || []) as UserProfile[],
      ];
      const currentActorProfile = (roster.data || []).find((u) => u.id === actor.id);
      if (!currentActorProfile || currentActorProfile.is_active === false) {
        throw new Error('Unauthorized: Actor is inactive or no longer in staff roster.');
      }
      actor.role = currentActorProfile.role;
      actor.is_active = currentActorProfile.is_active;
    }`;

replaceInFile('lib/services/payment-workflow-transaction.ts', pwtOld, pwtNew);
