import { propertyContext, editableProperty, validId } from '@/lib/properties/server';
type Context = { params: Promise<{ id: string; fileId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const c = await propertyContext(); if (c.error) return c.error;
  const { id, fileId } = await params;
  if (!validId(id) || !validId(fileId)) return new Response(null, { status: 404 });
  const { data } = await c.db.from('property_images').select('storage_path,mime_type,original_name').eq('id', fileId).eq('property_id', id).maybeSingle();
  if (!data) return new Response(null, { status: 404 });
  const { data: blob, error } = await c.db.storage.from('property-images').download(data.storage_path);
  if (error || !blob) return new Response(null, { status: 404 });
  return new Response(await blob.arrayBuffer(), { headers: {
    'Content-Type': data.mime_type ?? 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(data.original_name || 'property-file')}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'self'",
  }});
}
export async function DELETE(request: Request, { params }: Context) {
  const c = await propertyContext(request); if (c.error) return c.error;
  const { id, fileId } = await params; const target = await editableProperty(c, id); if (target.error) return target.error;
  if (!validId(fileId)) return new Response(null, { status: 404 });
  const { data } = await c.db.from('property_images').select('storage_path').eq('id', fileId).eq('property_id', id).maybeSingle();
  if (!data) return new Response(null, { status: 404 });
  const removed = await c.db.storage.from('property-images').remove([data.storage_path]);
  if (removed.error || !removed.data?.length) return Response.json({ error: '파일을 삭제하지 못했습니다. 담당자와 파일 상태를 확인하세요.' }, { status: 409 });
  const result = await c.db.from('property_images').delete().eq('id', fileId).select('id');
  if (result.error || !result.data?.length) return Response.json({ error: '파일 정보 정리가 필요합니다. 새로고침 후 다시 확인하세요.' }, { status: 409 });
  return new Response(null, { status: 204 });
}
