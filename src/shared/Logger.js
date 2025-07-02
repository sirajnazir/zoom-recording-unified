class Logger {
    constructor(context = 'Logger') {
        this.context = context;
    }
    info(message, meta) {
        console.log(`[INFO] [${this.context}]`, message, meta || '');
    }
    warn(message, meta) {
        console.warn(`[WARN] [${this.context}]`, message, meta || '');
    }
    error(message, meta) {
        console.error(`[ERROR] [${this.context}]`, message, meta || '');
    }
    debug(message, meta) {
        console.debug(`[DEBUG] [${this.context}]`, message, meta || '');
    }
}

module.exports = { Logger };
