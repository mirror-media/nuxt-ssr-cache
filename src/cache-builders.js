const Promise = require('bluebird');
const cacheManager = require('cache-manager');

function memoryCache(config) {
    return cacheManager.caching({
        store: 'memory',
        ...config,
    });
}

function redisCache(config) {
    if (config && Array.isArray(config.configure)) {
        const redis = require('redis');
        const client = redis.createClient({
            retry_strategy() {},
            ...config,
        });

        Promise
            .all(config.configure.map(options => new Promise((resolve, reject) => {
                client.config('SET', ...options, function (err, result) {
                    if (err || result !== 'OK') {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            })))
            .then(() => client.quit());
    }

    let cacheConfig = Object.assign({}, config)
    if (config.readHost && config.writeHost && config.readHost !== config.writeHost) {
      const writeCache = cacheManager.caching({
        store: require('cache-manager-redis'),
        retry_strategy() {},
        ...cacheConfig,
        host: config.writeHost
      });
      const readCache = cacheManager.caching({
        store: require('cache-manager-redis'),
        retry_strategy() {},
        ...cacheConfig,
        host: config.readHost
      });
      return {
        writeCache,
        readCache
      }
    } else if (config.readHost && config.writeHost && (config.readHost === config.writeHost)) {
      cacheConfig.host = config.readHost
    }

    const defaultCache = cacheManager.caching({
      store: require('cache-manager-redis'),
      retry_strategy() {},
      ...cacheConfig,
    });
    return defaultCache
}

function memcachedCache(config) {
    return cacheManager.caching({
        store: require('cache-manager-memcached-store'),
        ...config,
    });
}

function multiCache(config) {
    const stores = config.stores.map(makeCache);
    return cacheManager.multiCaching(stores);
}

const cacheBuilders = {
    memory: memoryCache,
    multi: multiCache,
    redis: redisCache,
    memcached: memcachedCache,
};

function makeCache(config = { type: 'memory' }) {
    const builder = cacheBuilders[config.type];
    if (!builder) {
        throw new Error('Unknown store type: ' + config.type)
    }

    if (config.type === 'redis' && config.readHost && config.writeHost && config.readHost !== config.writeHost) {
      return {
        readCache: Promise.promisifyAll(builder(config).readCache),
        writeCache: Promise.promisifyAll(builder(config).writeCache)
      }
    }

    return Promise.promisifyAll(builder(config));
}

module.exports = makeCache;
