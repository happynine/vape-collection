import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/storage/database/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getServerClient();

  const { data, error } = await client
    .from('brands')
    .select('id, name_en, name_cn, url, logo_key, region, level, is_published, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  return NextResponse.json({ brand: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getServerClient();
  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name_en !== undefined) updateData.name_en = body.name_en;
  if (body.name_cn !== undefined) updateData.name_cn = body.name_cn;
  if (body.url !== undefined) updateData.url = body.url;
  if (body.logo_key !== undefined) updateData.logo_key = body.logo_key;
  if (body.region !== undefined) updateData.region = body.region;
  if (body.level !== undefined) updateData.level = body.level;
  if (body.is_published !== undefined) updateData.is_published = body.is_published;

  const { data, error } = await client
    .from('brands')
    .update(updateData)
    .eq('id', parseInt(id))
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Brand not found or update failed' }, { status: 404 });
  }

  return NextResponse.json({ brand: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getServerClient();

  const { error } = await client
    .from('brands')
    .delete()
    .eq('id', parseInt(id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
