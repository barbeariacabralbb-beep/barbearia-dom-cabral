// ecosystem.config.js
module.exports = {
    apps: [{
        name: 'barbearia-whatsapp',
        script: 'index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
        },
        error_file: 'logs/err.log',
        out_file: 'logs/out.log',
        log_file: 'logs/combined.log',
        time: true,
        max_restarts: 10,
        restart_delay: 5000,
        cron_restart: '0 */6 * * *', // Reinicia a cada 6 horas para evitar memory leaks
    }]
};