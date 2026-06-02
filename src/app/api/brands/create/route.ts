import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/storage/database/supabase-client';

// POST /api/brands - Create a new brand
export async function POST(request: NextRequest) {
  const client = getServerClient();
  const body = await request.json();

  const { name_en, name_cn, url, logo_key, region, level, is_published } = body;

  if (!name_en || !url) {
    return NextResponse.json({ error: 'name_en and url are required' }, { status: 400 });
  }

  const { data, error } = await client
    .from('brands')
    .insert({
      name_en,
      name_cn: name_cn || '',
      url,
      logo_key: logo_key || null,
      region: region || '全球',
      level: level || 3,
      is_published: is_published !== undefined ? is_published : 1,
    })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brand: data }, { status: 201 });
}
