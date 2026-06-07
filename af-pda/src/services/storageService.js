import { db } from '../firebase.js';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

class StorageService {
  constructor() {
    this.assets = [];
    this.listeners = new Set();
    this.initialized = false;
  }

  getFixedAssets() {
    return this.assets;
  }

  async initFixedAssetsOnly() {
    if (this.initialized) return;
    try {
      const qs = await getDocs(collection(db, 'fixed_assets'));
      this.assets = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      this.initialized = true;
      this.notify();
    } catch (e) {
      console.error("Error fetching fixed assets", e);
    }
  }

  async updateFixedAsset(asset) {
    if (!asset.id) return;
    try {
      await updateDoc(doc(db, 'fixed_assets', asset.id), asset);
      const index = this.assets.findIndex(a => a.id === asset.id);
      if (index !== -1) {
        this.assets[index] = asset;
      } else {
        this.assets.push(asset);
      }
      this.notify();
    } catch (e) {
      console.error("Error updating fixed asset", e);
      throw e;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(l => l());
  }
}

export const storageService = new StorageService();
