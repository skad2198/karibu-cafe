'use client';

import React, { useState } from 'react';
import { Coffee, Search, Clock, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MenuCategory, MenuItem } from '@/types';

function formatCurrency(amount: number, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

const t = {
  en: {
    search: 'Search menu…',
    all: 'All',
    noItems: 'No items found',
    close: 'Close',
    prepTime: 'min prep',
    poweredBy: 'Powered by Karibu Café',
    table: 'Table',
    lang: 'FR',
  },
  fr: {
    search: 'Rechercher…',
    all: 'Tout',
    noItems: 'Aucun article trouvé',
    close: 'Fermer',
    prepTime: 'min de préparation',
    poweredBy: 'Propulsé par Karibu Café',
    table: 'Table',
    lang: 'EN',
  },
} as const;

type Lang = keyof typeof t;

interface Props {
  branch: { id: string; name: string; currency: string };
  table: { id: string; table_number: string };
  categories: MenuCategory[];
  items: MenuItem[];
}

function ItemPhoto({ url, name }: { url: string | null; name: string }) {
  const [error, setError] = useState(false);
  if (url && !error) {
    return (
      <img
        src={url}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setError(true)}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-amber-50 dark:bg-stone-700">
      <Coffee className="h-10 w-10 text-amber-300 dark:text-amber-600" />
    </div>
  );
}

export function QRMenuClient({ branch, table, categories, items }: Props) {
  const [lang, setLang] = useState<Lang>('en');
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const tx = t[lang];

  const filtered = items.filter(i => {
    const matchesCat = selectedCat === 'all' || i.category_id === selectedCat;
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const grouped = categories
    .filter(cat => filtered.some(i => i.category_id === cat.id))
    .map(cat => ({
      ...cat,
      items: filtered.filter(i => i.category_id === cat.id),
    }));

  const uncategorised = filtered.filter(i => !categories.find(c => c.id === i.category_id));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
            <Coffee className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">{branch.name}</h1>
            <p className="text-xs text-stone-400">{tx.table} {table.table_number}</p>
          </div>
          <button
            onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            {tx.lang}
          </button>
        </div>

        {/* Search */}
        <div className="max-w-xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder={tx.search}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 px-4 no-scrollbar max-w-xl mx-auto">
          <button
            onClick={() => setSelectedCat('all')}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
              selectedCat === 'all'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            )}
          >
            {tx.all}
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                selectedCat === cat.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Menu */}
      <div className="max-w-xl mx-auto px-4 py-4 space-y-8 pb-16">
        {filtered.length === 0 && (
          <div className="text-center py-20">
            <Coffee className="h-12 w-12 text-stone-200 dark:text-stone-700 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">{tx.noItems}</p>
          </div>
        )}

        {/* Grouped by category */}
        {selectedCat === 'all' ? (
          <>
            {grouped.map(cat => (
              <section key={cat.id}>
                <h2 className="text-base font-bold text-stone-800 dark:text-stone-200 mb-3 pb-2 border-b border-stone-200 dark:border-stone-800">
                  {cat.name}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {cat.items.map(item => (
                    <ItemCard key={item.id} item={item} currency={branch.currency} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              </section>
            ))}
            {uncategorised.length > 0 && (
              <section>
                <div className="grid grid-cols-2 gap-3">
                  {uncategorised.map(item => (
                    <ItemCard key={item.id} item={item} currency={branch.currency} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(item => (
              <ItemCard key={item.id} item={item} currency={branch.currency} onClick={() => setSelectedItem(item)} />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-stone-300 dark:text-stone-700 pt-4">{tx.poweredBy}</p>
      </div>

      {/* Item detail sheet */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setSelectedItem(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-stone-900 rounded-t-3xl w-full max-w-xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Photo */}
            <div className="h-56 w-full relative">
              <ItemPhoto url={selectedItem.image_url} name={selectedItem.name} />
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 h-9 w-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
              <p className="absolute bottom-4 left-4 text-xl font-bold text-white drop-shadow">{selectedItem.name}</p>
            </div>

            {/* Content */}
            <div className="p-5">
              {selectedItem.description && (
                <p className="text-stone-500 dark:text-stone-400 text-sm leading-relaxed mb-4">{selectedItem.description}</p>
              )}
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(Number(selectedItem.base_price), branch.currency)}
                </p>
                {selectedItem.prep_time_minutes && (
                  <div className="flex items-center gap-1.5 text-sm text-stone-400">
                    <Clock className="h-4 w-4" />
                    <span>{selectedItem.prep_time_minutes} {tx.prepTime}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, currency, onClick }: { item: MenuItem; currency: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group bg-white dark:bg-stone-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-md active:scale-95 transition-all text-left border border-stone-100 dark:border-stone-800"
    >
      {/* Photo */}
      <div className="h-32 w-full overflow-hidden">
        <ItemPhoto url={item.image_url} name={item.name} />
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">{item.name}</p>
        {item.description && (
          <p className="text-xs text-stone-400 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
        <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-2">
          {formatCurrency(Number(item.base_price), currency)}
        </p>
      </div>
    </button>
  );
}
