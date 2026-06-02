import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  const search = searchParams.get('search') || '';
  const letter = searchParams.get('letter') || '';
  const region = searchParams.get('region') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '1000');
  const all = searchParams.get('all') === '1';

  let query = client
    .from('brands')
    .select('id, name_en, name_cn, url, logo_key, region, level, is_published, created_at', { count: 'exact' })
    .order('name_en', { ascending: true });

  if (!all) {
    query = query.eq('is_published', 1);
  }

  if (search) {
    query = query.or(`name_en.ilike.%${search}%,name_cn.ilike.%${search}%,url.ilike.%${search}%`);
  }

  if (letter && letter.length === 1 && /[A-Z]/i.test(letter)) {
    query = query.ilike('name_en', `${letter}%`);
  }

  if (region && region !== '全部') {
    query = query.eq('region', region);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    brands: data || [],
    total: count || 0,
    page,
    pageSize,
  });
}
