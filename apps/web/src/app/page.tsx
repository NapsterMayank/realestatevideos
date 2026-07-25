'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Property } from '@realestatevids/shared';

export default function Home() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', contact_phone: '', contact_website: '', agency_name: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    const response = await fetch('/api/properties');
    if (!response.ok) {
      console.error('Failed to load properties', response.status);
      return;
    }
    const { properties } = await response.json();
    setProperties(properties ?? []);
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFormError(body.error ?? `Request failed (${response.status})`);
        return;
      }
      setForm({ name: '', contact_phone: '', contact_website: '', agency_name: '' });
      setShowForm(false);
      await loadProperties();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Properties</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'New Property'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input
            required
            placeholder="Property name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <input
            required
            placeholder="Contact phone"
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <input
            required
            placeholder="Contact website"
            value={form.contact_website}
            onChange={(e) => setForm((f) => ({ ...f, contact_website: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <input
            placeholder="Agency name (optional)"
            value={form.agency_name}
            onChange={(e) => setForm((f) => ({ ...f, agency_name: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
          />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {creating ? 'Creating…' : 'Create Property'}
          </button>
        </form>
      ) : null}

      {properties.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No properties yet. Click &ldquo;New Property&rdquo; to add your first listing.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {properties.map((property) => (
            <li key={property.id}>
              <Link
                href={`/properties/${property.id}`}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{property.name}</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {property.contact_phone} · {property.contact_website}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
