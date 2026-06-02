'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Search, Plus, Pencil, Trash2, Upload, X, Check, LogOut,
  Globe, ExternalLink, Eye, EyeOff
} from 'lucide-react';
import Link from 'next/link';

interface Brand {
  id: number;
  name_en: string;
  name_cn: string;
  url: string;
  logo_key: string | null;
  region: string;
  level: number;
  is_published: number;
  created_at: string;
}

const REGIONS = ['全球', '美国', '英国', '俄罗斯', '加拿大'];
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'funan';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({
    name_en: '',
    name_cn: '',
    url: '',
    region: '全球',
    level: 3,
    is_published: 1,
  });
  const [uploading, setUploading] = useState(false);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  // Check session
  useEffect(() => {
    const auth = sessionStorage.getItem('vape_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('vape_admin_auth', 'true');
      setLoginError('');
    } else {
      setLoginError('账号或密码错误');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('vape_admin_auth');
  };

  // Fetch brands
  const fetchBrands = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('pageSize', '1000');
      // For admin, we need to see all brands including unpublished
      params.set('all', '1');

      // We need a special endpoint for admin that returns all brands
      const res = await fetch(`/api/brands?${params.toString()}`);
      const data = await res.json();
      if (data.brands) {
        setBrands(data.brands);
        setTotalCount(data.total || data.brands.length);
      }
    } catch (err) {
      console.error('Failed to fetch brands:', err);
    }
  }, [search]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBrands();
    }
  }, [isAuthenticated, fetchBrands]);

  // Debounced search
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(fetchBrands, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch logo URLs
  useEffect(() => {
    const fetchLogoUrls = async () => {
      const brandsWithLogos = brands.filter((b) => b.logo_key && !logoUrls[b.logo_key!]);
      if (brandsWithLogos.length === 0) return;

      const newUrls: Record<string, string> = {};
      await Promise.all(
        brandsWithLogos.slice(0, 10).map(async (brand) => {
          if (brand.logo_key) {
            try {
              const res = await fetch(`/api/logo?key=${encodeURIComponent(brand.logo_key)}`);
              const data = await res.json();
              if (data.url) newUrls[brand.logo_key] = data.url;
            } catch { /* ignore */ }
          }
        })
      );
      if (Object.keys(newUrls).length > 0) {
        setLogoUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };
    fetchLogoUrls();
  }, [brands]);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formDataFile = new FormData();
      formDataFile.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formDataFile });
      const data = await res.json();
      if (data.key) {
        setLogoKey(data.key);
        setLogoPreview(data.url);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({ name_en: '', name_cn: '', url: '', region: '全球', level: 3, is_published: 1 });
    setEditingBrand(null);
    setLogoKey(null);
    setLogoPreview(null);
    setShowForm(false);
  };

  // Edit brand
  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({
      name_en: brand.name_en,
      name_cn: brand.name_cn,
      url: brand.url,
      region: brand.region,
      level: brand.level,
      is_published: brand.is_published,
    });
    setLogoKey(brand.logo_key);
    if (brand.logo_key && logoUrls[brand.logo_key]) {
      setLogoPreview(logoUrls[brand.logo_key]);
    } else {
      setLogoPreview(null);
    }
    setShowForm(true);
  };

  // Save brand (create or update)
  const handleSave = async () => {
    if (!formData.name_en || !formData.url) return;
    setSaving(true);
    try {
      if (editingBrand) {
        const res = await fetch(`/api/brands/${editingBrand.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, logo_key: logoKey }),
        });
        const data = await res.json();
        if (data.error) {
          alert('保存失败: ' + data.error);
          return;
        }
      } else {
        const res = await fetch('/api/brands/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, logo_key: logoKey }),
        });
        const data = await res.json();
        if (data.error) {
          alert('创建失败: ' + data.error);
          return;
        }
      }
      resetForm();
      fetchBrands();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete brand
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此品牌吗？')) return;
    try {
      await fetch(`/api/brands/${id}`, { method: 'DELETE' });
      fetchBrands();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Toggle publish
  const handleTogglePublish = async (brand: Brand) => {
    try {
      await fetch(`/api/brands/${brand.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: brand.is_published ? 0 : 1 }),
      });
      fetchBrands();
    } catch (err) {
      console.error('Toggle publish failed:', err);
    }
  };

  // Login page
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16213e]">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-md">
          <div className="mb-6 text-center">
            <Globe className="mx-auto mb-3 h-12 w-12 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Vape品牌管理后台</h2>
            <p className="mt-1 text-sm text-white/50">请输入管理员账号密码</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-white/60">账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
                placeholder="请输入账号"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-white/60">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {loginError && (
              <p className="text-sm text-red-400">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-500 py-2.5 font-medium text-white transition-colors hover:bg-blue-600"
            >
              登录
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16213e]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0f0f1a]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Globe className="h-6 w-6 text-blue-400" />
            <h1 className="text-lg font-bold text-white">Vape品牌管理后台</h1>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
              共 {totalCount} 个品牌
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-white/50 transition-colors hover:text-white"
            >
              前往前台
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="搜索品牌..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            添加品牌
          </button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a2e] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  {editingBrand ? '编辑品牌' : '添加品牌'}
                </h3>
                <button onClick={resetForm} className="text-white/40 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Logo Upload */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">品牌 Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                      {logoPreview ? (
                        <Image
                          src={logoPreview}
                          alt="Logo preview"
                          width={64}
                          height={64}
                          className="h-full w-full object-contain"
                          unoptimized
                        />
                      ) : (
                        <Upload className="h-6 w-6 text-white/20" />
                      )}
                    </div>
                    <label className="cursor-pointer rounded-lg bg-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/15">
                      {uploading ? '上传中...' : '上传 Logo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                    {logoKey && (
                      <button
                        onClick={() => { setLogoKey(null); setLogoPreview(null); }}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>

                {/* English Name */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">
                    英文名 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name_en}
                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
                    placeholder="如: RELX"
                  />
                </div>

                {/* Chinese Name */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">中文名</label>
                  <input
                    type="text"
                    value={formData.name_cn}
                    onChange={(e) => setFormData({ ...formData, name_cn: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
                    placeholder="如: 悦刻"
                  />
                </div>

                {/* URL */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">
                    官网地址 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
                    placeholder="https://www.example.com"
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">主打地区</label>
                  <div className="flex flex-wrap gap-2">
                    {REGIONS.map((region) => (
                      <button
                        key={region}
                        onClick={() => setFormData({ ...formData, region })}
                        className={`rounded-full px-4 py-1.5 text-sm transition-all ${
                          formData.region === region
                            ? 'bg-blue-500 text-white'
                            : 'bg-white/8 text-white/50 hover:bg-white/15'
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Level */}
                <div>
                  <label className="mb-1.5 block text-sm text-white/60">优先级 (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 3 })}
                    className="w-24 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                  />
                </div>

                {/* Published */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-white/60">发布状态</label>
                  <button
                    onClick={() => setFormData({ ...formData, is_published: formData.is_published ? 0 : 1 })}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-all ${
                      formData.is_published
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-white/8 text-white/40'
                    }`}
                  >
                    {formData.is_published ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {formData.is_published ? '已发布' : '未发布'}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={resetForm}
                    className="rounded-lg bg-white/10 px-6 py-2 text-sm text-white/60 transition-colors hover:bg-white/15"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formData.name_en || !formData.url}
                    className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : editingBrand ? '更新' : '创建并发布'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Brands Table */}
        <div className="overflow-hidden rounded-xl border border-white/5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">Logo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">英文名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">中文名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">官网</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">地区</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-white/40">操作</th>
              </tr>
            </thead>
            <tbody>
              {brands.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((brand) => (
                <tr key={brand.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                      {brand.logo_key && logoUrls[brand.logo_key] ? (
                        <Image
                          src={logoUrls[brand.logo_key]}
                          alt={brand.name_en}
                          width={40}
                          height={40}
                          className="h-full w-full object-contain p-0.5"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xs font-bold text-white/30">
                          {brand.name_en.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/80">{brand.name_en}</td>
                  <td className="px-4 py-3 text-sm text-white/50">{brand.name_cn || '-'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={brand.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {brand.url.length > 30 ? brand.url.substring(0, 30) + '...' : brand.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/50">{brand.region}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleTogglePublish(brand)}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        brand.is_published
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/5 text-white/30'
                      }`}
                    >
                      {brand.is_published ? '已发布' : '未发布'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(brand)}
                        className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(brand.id)}
                        className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {brands.length > pageSize && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/50 disabled:opacity-30 hover:bg-white/10"
            >
              上一页
            </button>
            <span className="text-sm text-white/40">
              {currentPage} / {Math.ceil(brands.length / pageSize)}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(Math.ceil(brands.length / pageSize), currentPage + 1))}
              disabled={currentPage >= Math.ceil(brands.length / pageSize)}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white/50 disabled:opacity-30 hover:bg-white/10"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
