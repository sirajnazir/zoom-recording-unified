class Cache {
    constructor() {
        this.store = new Map();
    }
    
    async get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        
        if (item.expiry && item.expiry < Date.now()) {
            this.store.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    async set(key, value, ttl = 3600) {
        const expiry = ttl ? Date.now() + (ttl * 1000) : null;
        this.store.set(key, { value, expiry });
    }
    
    async delete(key) {
        this.store.delete(key);
    }
    
    async clear() {
        this.store.clear();
    }
}

module.exports = { Cache };