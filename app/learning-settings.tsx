"use client";
import { useState } from 'react';
import { Check, CreditCard } from 'lucide-react';
import type { RecordData } from './lib/learning-store';

export function LearningSettings({ products, busy, run }: { products: RecordData[]; busy: boolean; run: (action: string, values?: RecordData) => Promise<boolean> }) {
  const [selected, setSelected] = useState('');
  const product = products.find(item => item.id === selected) || products[0];
  if (!product) return null;
  return <section className="management-panel settings-panel"><header><CreditCard size={20} /><div><h3>Learning passes & lesson prices</h3></div></header>
    <label className="form-field"><span>Product</span><select value={String(product.id)} onChange={event => setSelected(event.target.value)}>{products.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
    <form key={String(product.id) + String(product.price) + String(product.unit_price)} className="detail-edit-form learning-price-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void run('updatePassProduct', { passProductId: product.id, name: String(form.get('name')), price: Number(form.get('price')), onsiteCredits: Number(form.get('onsite')), onlineCredits: Number(form.get('online')), studyCredits: Number(form.get('study')), unitPrice: form.get('unit') === '' ? null : Number(form.get('unit')), note: String(form.get('description')) }); }}>
      <label className="form-field"><span>Name</span><input name="name" defaultValue={String(product.name)} required /></label>
      <label className="form-field"><span>Pass price · RM</span><input name="price" type="number" min="0" step="0.01" defaultValue={Number(product.price)} required /></label>
      {(['onsite', 'online', 'study'] as const).map(type => <label key={type} className="form-field"><span>{type === 'study' ? 'Study visits' : type === 'onsite' ? 'Onsite lessons' : 'Online lessons'}</span><input name={type} type="number" min="0" step="1" defaultValue={Number(product[`${type}_credits`])} required /></label>)}
      <label className="form-field"><span>Single visit / lesson price · RM</span><input name="unit" type="number" min="0" step="0.01" defaultValue={product.unit_price != null ? Number(product.unit_price) : ''} /></label>
      <label className="form-field"><span>Description</span><input name="description" defaultValue={String(product.description || '')} /></label>
      <button className="primary-button" type="submit" disabled={busy}><Check size={17} />Save pricing</button>
    </form></section>;
}
