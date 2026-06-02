import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/storage/database/supabase-client';

// POST /api/brands/seed - Batch import brands
export async function POST(request: NextRequest) {
  const client = getServerClient();
  const body = await request.json();

  const { brands } = body as { brands: Array<{
    name_en: string;
    name_cn?: string;
    url: string;
    region?: string;
    level?: number;
  }> };

  if (!Array.isArray(brands) || brands.length === 0) {
    return NextResponse.json({ error: 'brands array is required' }, { status: 400 });
  }

  const rows = brands.map((b) => ({
    name_en: b.name_en,
    name_cn: b.name_cn || '',
    url: b.url,
    region: b.region || '全球',
    level: b.level || 3,
    is_published: 1,
  }));

  // Batch insert in chunks of 50
  const batchSize = 50;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await client
      .from('brands')
      .insert(batch)
      .select();

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      inserted += (data || []).length;
    }
  }

  return NextResponse.json({
    inserted,
    total: rows.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
