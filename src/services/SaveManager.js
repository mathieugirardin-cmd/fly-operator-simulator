const DB_NAME = 'fly-operator-simulator';
export class SaveManager {
  async database() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return this.db;
  }
  async save(snapshot) {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      transaction.objectStore('saves').put({ savedAt: new Date().toISOString(), snapshot }, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  async load() {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  async clear() {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').delete('current');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}
