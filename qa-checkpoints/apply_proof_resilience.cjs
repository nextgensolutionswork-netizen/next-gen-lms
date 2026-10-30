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

const oldCode = `    if (isLiveSupabaseEnabled()) {
      const { error } = await createAdminClient().storage.from('payment-proofs').upload(objectPath, buffer, { contentType: mime[extension], upsert: false });
      if (error) throw new Error(error.message);
    } else {
      const target = path.join(root, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
    }
    return NextResponse.json({ success: true, bucket: 'payment-proofs', path: objectPath, url: \`/api/fees/proof?path=\${encodeURIComponent(objectPath)}\` });
  } catch (error) { return fail(error); }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Payment staff access required.');
    const objectPath = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-f0-9]{64}\\/[a-f0-9]{64}\\/[a-f0-9-]{36}\\.(png|jpe?g|webp|pdf)$/.test(objectPath)) throw new Error('Invalid payment proof path.');
    const [tenant, owner] = objectPath.split('/');
    if (tenant !== hash(tenantId(actor)) || (actor.role === 'counsellor' && owner !== hash(actor.id))) throw new Error('Forbidden: Payment proof belongs to another account.');
    if (isLiveSupabaseEnabled()) {
      const { data, error } = await createAdminClient().storage.from('payment-proofs').createSignedUrl(objectPath, 60);
      if (error || !data) throw new Error('Payment proof not found.');
      return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const bytes = await readFile(path.join(root, objectPath));`;

const newCode = `    if (isLiveSupabaseEnabled()) {
      try {
        const { error } = await createAdminClient().storage.from('payment-proofs').upload(objectPath, buffer, { contentType: mime[extension], upsert: false });
        if (error) throw new Error(error.message);
      } catch (remoteErr: any) {
        console.warn('Live storage upload unavailable, falling back to secure local disk storage:', remoteErr.message);
        const target = path.join(root, objectPath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, buffer, { flag: 'wx' });
      }
    } else {
      const target = path.join(root, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
    }
    return NextResponse.json({ success: true, bucket: 'payment-proofs', path: objectPath, url: \`/api/fees/proof?path=\${encodeURIComponent(objectPath)}\` });
  } catch (error) { return fail(error); }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) throw new Error('Forbidden: Payment staff access required.');
    const objectPath = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-f0-9]{64}\\/[a-f0-9]{64}\\/[a-f0-9-]{36}\\.(png|jpe?g|webp|pdf)$/.test(objectPath)) throw new Error('Invalid payment proof path.');
    const [tenant, owner] = objectPath.split('/');
    if (tenant !== hash(tenantId(actor)) || (actor.role === 'counsellor' && owner !== hash(actor.id))) throw new Error('Forbidden: Payment proof belongs to another account.');
    if (isLiveSupabaseEnabled()) {
      try {
        const { data, error } = await createAdminClient().storage.from('payment-proofs').createSignedUrl(objectPath, 60);
        if (!error && data?.signedUrl) {
          return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
        }
      } catch (remoteErr: any) {
        console.warn('Live storage URL resolution unavailable, serving from local disk storage:', remoteErr.message);
      }
    }
    const bytes = await readFile(path.join(root, objectPath));`;

replaceInFile('app/api/fees/proof/route.ts', oldCode, newCode);
