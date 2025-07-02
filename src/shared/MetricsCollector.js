class MetricsCollector {
    constructor() {
        this.metrics = {};
    }
    
    increment(metric, value = 1, tags = {}) {
        if (!this.metrics[metric]) {
            this.metrics[metric] = 0;
        }
        this.metrics[metric] += value;
    }
    
    gauge(metric, value, tags = {}) {
        this.metrics[metric] = value;
    }
    
    timing(metric, value, tags = {}) {
        if (!this.metrics[metric]) {
            this.metrics[metric] = [];
        }
        this.metrics[metric].push(value);
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
}

module.exports = { MetricsCollector };