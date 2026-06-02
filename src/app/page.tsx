'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Search, ExternalLink, X, ChevronUp } from 'lucide-react';

interface Brand {
  id: number;
  name_en: string;
  name_cn: string;
  url: string;
  logo_key: string | null;
  region: string;
  level: number;
  is_published: number;
}

const REGIONS = ['全部', '全球', '美国', '英国', '俄罗斯', '加拿大'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function Home() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [activeLetter, setActiveLetter] = useState('');
  const [activeRegion, setActiveRegion] = useState('全部');
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [showBackTop, setShowBackTop] = useState(false);

  // Fetch brands
  const fetchBrands = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeLetter) params.set('letter', activeLetter);
      if (activeRegion !== '全部') params.set('region', activeRegion);
      params.set('pageSize', '2000');

      const res = await fetch(`/api/brands?${params.toString()}`);
      const data = await res.json();
      if (data.brands) {
        setBrands(data.brands);
      }
    } catch (err) {
      console.error('Failed to fetch brands:', err);
    }
  }, [search, activeLetter, activeRegion]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBrands();
    }, search ? 1000 : 0);
    return () => clearTimeout(timer);
  }, [search, activeLetter, activeRegion, fetchBrands]);

  // Initial fetch
  useEffect(() => {
    fetchBrands();
  }, []);

  // Scroll listener for back-to-top
  useEffect(() => {
    const handleScroll = () => {
      setShowBackTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch logo URLs for brands that have logo_key
  useEffect(() => {
    const fetchLogoUrls = async () => {
      const brandsWithLogos = brands.filter((b) => b.logo_key && !logoUrls[b.logo_key]);
      if (brandsWithLogos.length === 0) return;

      const newUrls: Record<string, string> = {};
      await Promise.all(
        brandsWithLogos.map(async (brand) => {
          if (brand.logo_key && !logoUrls[brand.logo_key]) {
            try {
              const res = await fetch(`/api/logo?key=${encodeURIComponent(brand.logo_key)}`);
              const data = await res.json();
              if (data.url) {
                newUrls[brand.logo_key] = data.url;
              }
            } catch {
              // ignore
            }
          }
        })
      );

      if (Object.keys(newUrls).length > 0) {
        setLogoUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };

    fetchLogoUrls();
  }, [brands]);

  // Group brands by first letter
  const groupedBrands = useMemo(() => {
    const groups: Record<string, Brand[]> = {};
    brands.forEach((brand) => {
      const firstLetter = brand.name_en.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(brand);
    });
    return groups;
  }, [brands]);

  const sortedLetters = Object.keys(groupedBrands).sort();

  // Count brands per letter
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    brands.forEach((brand) => {
      const firstLetter = brand.name_en.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
      counts[letter] = (counts[letter] || 0) + 1;
    });
    return counts;
  }, [brands]);

  const scrollToLetter = (letter: string) => {
    const element = document.getElementById(`letter-${letter}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16213e]">
      {/* Header */}
      <header className="relative overflow-hidden pb-8 pt-12">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 text-center">
          <h1 className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Vape品牌商官网查找系统
          </h1>
          <p className="mt-2 text-sm text-white/60 md:text-base">
            快速查找全球 Vape 品牌官方网站
          </p>

          {/* Search Box */}
          <div className="relative mx-auto mt-6 max-w-lg">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索品牌名称、中文或网址..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border-0 bg-white/90 py-3.5 pl-12 pr-10 text-base text-gray-800 shadow-lg backdrop-blur-md transition-all placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 text-sm text-white/50">
            共收录 <span className="font-semibold text-white/80">{brands.length}</span> 个品牌
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {/* A-Z Letter Navigation */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5">
          <button
            onClick={() => {
              setActiveLetter('');
              setActiveRegion('全部');
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              activeLetter === '' && activeRegion === '全部'
                ? 'bg-white text-gray-900 shadow-md'
                : 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'
            }`}
          >
            全部
          </button>
          {LETTERS.map((letter) => (
            <button
              key={letter}
              onClick={() => {
                setActiveLetter(activeLetter === letter ? '' : letter);
                scrollToLetter(letter);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all ${
                activeLetter === letter
                  ? 'bg-white text-gray-900 shadow-md'
                  : letterCounts[letter]
                  ? 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'
                  : 'bg-white/3 text-white/20 cursor-not-allowed'
              }`}
              disabled={!letterCounts[letter]}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Region Filter */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-white/40 mr-1">主打地区:</span>
          {REGIONS.map((region) => (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                activeRegion === region
                  ? 'bg-blue-500/80 text-white shadow-md'
                  : 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'
              }`}
            >
              {region}
            </button>
          ))}
        </div>

        {/* Brand Cards by Letter Group */}
        {sortedLetters.length === 0 ? (
          <div className="py-20 text-center text-white/40">
            <Search className="mx-auto mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg">未找到匹配的品牌</p>
            <p className="mt-1 text-sm">请尝试其他搜索词或筛选条件</p>
          </div>
        ) : (
          sortedLetters.map((letter) => (
            <div key={letter} id={`letter-${letter}`} className="mb-8 scroll-mt-4">
              {/* Letter Header */}
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">
                  {letter}
                </span>
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/30">
                  {groupedBrands[letter].length} 个品牌
                </span>
              </div>

              {/* Brand Cards Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groupedBrands[letter].map((brand) => (
                  <div
                    key={brand.id}
                    className="group relative rounded-xl border border-white/6 bg-white/[0.04] p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-black/20"
                  >
                    {/* Top section: Logo + Names */}
                    <div className="flex items-start gap-3">
                      {/* Logo */}
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                        {brand.logo_key && logoUrls[brand.logo_key] ? (
                          <Image
                            src={logoUrls[brand.logo_key]}
                            alt={brand.name_en}
                            width={48}
                            height={48}
                            className="h-full w-full object-contain p-0.5"
                            unoptimized
                          />
                        ) : (
                          <span className="text-lg font-bold text-white/30">
                            {brand.name_en.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Name + Region */}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-white/90">
                          {brand.name_en}
                        </h3>
                        {brand.name_cn && (
                          <p className="truncate text-xs text-white/50">
                            {brand.name_cn}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-white/30">
                          主打地区：{brand.region}
                        </p>
                      </div>
                    </div>

                    {/* Website Link */}
                    <a
                      href={brand.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
                    >
                      <ExternalLink className="h-3 w-3" />
                      访问官网
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Right Side Quick Nav */}
      <div className="fixed right-2 top-1/2 z-50 -translate-y-1/2 hidden md:flex flex-col gap-0.5 rounded-2xl bg-white/5 p-1.5 backdrop-blur-md">
        {LETTERS.filter((l) => letterCounts[l]).map((letter) => (
          <button
            key={letter}
            onClick={() => {
              setActiveLetter(letter);
              scrollToLetter(letter);
            }}
            className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium transition-all ${
              activeLetter === letter
                ? 'bg-white text-gray-900'
                : 'text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Back to Top */}
      {showBackTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/60 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
