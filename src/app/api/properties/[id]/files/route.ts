import { randomUUID } from 'node:crypto';
import { propertyContext, editableProperty } from '@/lib/properties/server';

const maxSize = 10 * 1024 * 1024;
function detectedMime(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return 'image/png';
  const text = new TextDecoder('ascii');
  if (text.decode(bytes.slice(0,4)) === 'RIFF' && text.decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  if (text.decode(bytes.slice(0,5)) === '%PDF-') return 'application/pdf';
  return null;
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await propertyContext(request); if (c.error) return c.error;
  const { id } = await params; const target = await editableProperty(c, id); if (target.error) return target.error;
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return Response.json({ error: '파일 크기를 확인할 수 없습니다.' }, { status: 411 });
  if (length > maxSize + 65536) return Response.json({ error: '파일은 10MB 이하로 올려주세요.' }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file'); const kind = form?.get('file_kind');
  if (!(file instanceof File) || !['photo', 'floorplan'].includes(String(kind)) || !file.size || file.size > maxSize) return Response.json({ error: '사진 또는 도면 파일(최대 10MB)을 선택하세요.' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer()); const mime = detectedMime(bytes);
  if (!mime || mime !== file.type || (kind === 'photo' && mime === 'application/pdf')) return Response.json({ error: '사진은 JPEG·PNG·WebP, 도면은 이미지·PDF만 지원합니다. 파일 내용과 형식이 일치해야 합니다.' }, { status: 400 });
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime];
  const path = `${c.staff.office_id}/${id}/${randomUUID()}.${extension}`;
  const upload = await c.db.storage.from('property-images').upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) return Response.json({ error: '파일을 올리지 못했습니다. 담당자 권한과 파일 크기를 확인하세요.' }, { status: 409 });
  const { data, error } = await c.db.from('property_images').insert({ property_id: id, office_id: c.staff.office_id, assigned_staff_id: target.property.assigned_staff_id, storage_path: path, file_kind: kind, mime_type: mime, original_name: file.name.slice(0,255) }).select('id').single();
  if (error) {
    const cleanup = await c.db.storage.from('property-images').remove([path]);
    if (cleanup.error) console.error('Property upload cleanup requires office manager review:', path);
    return Response.json({ error: '파일 정보를 저장하지 못했습니다. 담당자가 변경되었는지 확인하세요.' }, { status: 409 });
  }
  return Response.json(data, { status: 201 });
}
